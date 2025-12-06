import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Check if we're in development mode based on origin
    const origin = req.headers.get('origin') || req.headers.get('referer') || ''
    const isDevMode = origin.includes('localhost') || 
                     origin.includes('127.0.0.1') ||
                     origin.includes('192.168.') ||
                     origin.includes(':5173') ||
                     origin.includes(':5174') ||
                     origin.includes(':5175')

    console.log('🔍 Environment detection:', { origin, isDevMode })

    let user = null
    
    // Get the authorization header
    const authHeader = req.headers.get('Authorization')
    
    if (isDevMode) {
      // In development mode, auth is optional
      console.log('🛠️ Development mode detected - auth is optional')
      if (authHeader) {
        // If auth header provided, validate it
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(
          authHeader.replace('Bearer ', '')
        )
        if (!authError && authUser) {
          user = authUser
          console.log('✅ Dev mode with valid auth token')
        } else {
          console.log('⚠️ Dev mode with invalid auth token, proceeding without user')
        }
      } else {
        console.log('ℹ️ Dev mode without auth header, proceeding anonymously')
      }
    } else {
      // In production mode, require authentication
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: 'Authentication required to create shared model' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Verify the JWT token to get user ID
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(
        authHeader.replace('Bearer ', '')
      )

      if (authError || !authUser) {
        return new Response(
          JSON.stringify({ error: 'Invalid authorization token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      user = authUser
    }

    const { model_data, expires_in_days } = await req.json()

    if (!model_data) {
      return new Response(
        JSON.stringify({ error: 'model_data is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Calculate expiration date (default 7 days, max 30 days)
    const expirationDays = Math.min(expires_in_days || 7, 30)
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + expirationDays)

    // Create shared model record
    const { data: sharedModel, error } = await supabase
      .from('shared_models')
      .insert({
        user_id: user?.id || null, // Allow null user_id in development mode
        model_data,
        expires_at: expiresAt.toISOString()
      })
      .select('id, created_at, expires_at')
      .single()

    if (error) {
      console.error('Error creating shared model:', error)
      return new Response(
        JSON.stringify({ error: 'Failed to create shared model' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate share URL
    const shareUrl = `${req.headers.get('origin') || 'https://agenticad.store'}/model/${sharedModel.id}`

    return new Response(
      JSON.stringify({
        id: sharedModel.id,
        share_url: shareUrl,
        expires_at: sharedModel.expires_at,
        created_at: sharedModel.created_at
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in create-shared-model:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
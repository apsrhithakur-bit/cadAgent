import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface WebhookPayload {
  type: string
  table: string
  record: any
  schema: string
  old_record: any | null
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    const payload: WebhookPayload = await req.json()
    console.log('Creating user profile for:', payload.record.id, payload.record.email)

    // Create user profile with proper defaults
    const { data, error } = await supabaseClient
      .from('user_profiles')
      .insert({
        id: payload.record.id,
        email: payload.record.email,
        subscription_tier: 'free',
        subscription_status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })

    if (error && error.code !== '23505') { // Ignore duplicate key errors
      console.error('Error creating user profile:', error)
      throw error
    }

    console.log('User profile created successfully for:', payload.record.email)
    
    return new Response(
      JSON.stringify({ success: true, user_id: payload.record.id }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    console.error('Error in create-user-profile function:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    )
  }
})
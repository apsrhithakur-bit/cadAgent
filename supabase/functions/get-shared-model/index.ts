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
    
    // Extract model ID from URL
    const url = new URL(req.url)
    const modelId = url.searchParams.get('id') || url.pathname.split('/').pop()

    if (!modelId) {
      return new Response(
        JSON.stringify({ error: 'Model ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get shared model
    const { data: sharedModel, error } = await supabase
      .from('shared_models')
      .select('*')
      .eq('id', modelId)
      .single()

    if (error || !sharedModel) {
      return new Response(
        JSON.stringify({ error: 'Shared model not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if model has expired
    if (sharedModel.expires_at && new Date(sharedModel.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: 'Shared model has expired' }),
        { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        id: sharedModel.id,
        model_data: sharedModel.model_data,
        created_at: sharedModel.created_at,
        expires_at: sharedModel.expires_at
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in get-shared-model:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
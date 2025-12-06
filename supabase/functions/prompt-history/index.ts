import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

interface PromptHistoryEntry {
  id?: string
  user_id?: string
  prompt: string
  success: boolean
  error_message?: string
  confidence?: number
  source?: string
  created_at?: string
}

interface RequestBody {
  action: 'save' | 'get_successful' | 'find_similar'
  prompt?: string
  success?: boolean
  error_message?: string
  confidence?: number
  source?: string
  limit?: number
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get user from JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      console.error('❌ Missing Authorization header')
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    console.log('🔑 Validating token for user authentication...')
    
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)

    if (authError || !user) {
      console.error('❌ Auth error:', authError?.message || 'Unknown auth error')
      console.error('🔍 Full auth error:', JSON.stringify(authError, null, 2))
      return new Response(
        JSON.stringify({ error: 'Unauthorized', details: authError?.message }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    console.log('✅ User authenticated:', user.id)

    let body: RequestBody
    try {
      body = await req.json()
    } catch (jsonError) {
      console.error('❌ Invalid JSON in request body:', jsonError)
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }
    
    console.log('📝 Prompt history request:', body.action, 'from user:', user.id)
    console.log('📋 Request body:', JSON.stringify(body, null, 2))

    switch (body.action) {
      case 'save': {
        if (!body.prompt || body.prompt.trim().length === 0) {
          console.error('❌ Invalid prompt:', body.prompt)
          return new Response(
            JSON.stringify({ error: 'Prompt is required and cannot be empty' }),
            { 
              status: 400, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          )
        }

        // Validate and normalize confidence value if provided
        let normalizedConfidence = undefined;
        if (body.confidence !== undefined && body.confidence !== null) {
          if (typeof body.confidence !== 'number') {
            console.error('❌ Invalid confidence type:', typeof body.confidence, body.confidence)
            return new Response(
              JSON.stringify({ error: 'Confidence must be a number' }),
              { 
                status: 400, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              }
            )
          }
          
          // Handle both decimal (0.0-1.0) and integer (0-100) confidence values
          if (body.confidence >= 0 && body.confidence <= 1) {
            // Convert decimal to integer (0.8 -> 80)
            normalizedConfidence = Math.round(body.confidence * 100);
          } else if (body.confidence >= 0 && body.confidence <= 100) {
            // Already an integer, just round to ensure it's whole
            normalizedConfidence = Math.round(body.confidence);
          } else {
            console.error('❌ Invalid confidence range:', body.confidence)
            return new Response(
              JSON.stringify({ error: 'Confidence must be between 0-1 (decimal) or 0-100 (integer)' }),
              { 
                status: 400, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              }
            )
          }
        }

        // Save prompt to database
        console.log('💾 Preparing to save prompt to database...')
        
        // First, check if the table exists
        try {
          const { data: tableCheck, error: tableError } = await supabaseClient
            .from('prompt_history')
            .select('count')
            .limit(0)
            
          if (tableError) {
            console.error('🚨 Table check failed:', tableError)
            console.error('🚨 This likely means the prompt_history table does not exist')
            console.error('🚨 Error code:', tableError.code)
            console.error('🚨 Error message:', tableError.message)
            
            return new Response(
              JSON.stringify({ 
                error: 'Database table does not exist - migrations may need to be applied',
                details: tableError.message,
                code: tableError.code
              }),
              { 
                status: 500, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              }
            )
          }
          console.log('✅ Table exists - proceeding with insert')
        } catch (checkError) {
          console.error('🚨 Failed to check table existence:', checkError)
        }
        
        const insertData: any = {
          user_id: user.id,
          prompt: body.prompt.trim(),
          success: body.success ?? false
        };
        
        // Only include optional fields if they have valid values
        if (body.error_message) insertData.error_message = body.error_message;
        if (normalizedConfidence !== undefined && normalizedConfidence !== null) insertData.confidence = normalizedConfidence;
        if (body.source) insertData.source = body.source;
        
        console.log('📊 Insert data prepared:', JSON.stringify(insertData, null, 2))
        
        try {
          console.log('🚀 Executing database insert...')
          const { data, error } = await supabaseClient
            .from('prompt_history')
            .insert(insertData)
            .select()
            .single()
            
          console.log('✅ Database operation completed')
          
          if (error) {
            console.error('❌ Database returned error')
            throw error
          }
          
          console.log('🎉 Data inserted successfully:', data?.id)
          
          console.log('✅ Prompt saved successfully - preparing response')
          return new Response(
            JSON.stringify({ success: true, data }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
          
        } catch (dbError) {
          console.error('🔥 Database operation failed:', dbError)
          console.error('📊 Insert data was:', JSON.stringify(insertData, null, 2))
          console.error('🔍 Error message:', dbError?.message || 'No error message')
          console.error('🔍 Error code:', dbError?.code || 'No error code')
          console.error('🔍 Error hint:', dbError?.hint || 'No error hint')
          console.error('🔍 Error details:', dbError?.details || 'No error details')
          console.error('🔍 Full error object:', JSON.stringify({
            name: dbError?.name,
            message: dbError?.message,
            code: dbError?.code,
            hint: dbError?.hint,
            details: dbError?.details,
            stack: dbError?.stack
          }, null, 2))
          
          // Handle specific error types
          let errorMessage = 'Failed to save prompt'
          if (dbError.code === '23503') {
            errorMessage = 'Foreign key constraint violation - user ID not found'
          } else if (dbError.code === '23505') {
            errorMessage = 'Duplicate entry violation'
          } else if (dbError.code === '23514') {
            errorMessage = 'Check constraint violation'
          } else if (dbError.message) {
            errorMessage = dbError.message
          }
          
          return new Response(
            JSON.stringify({ 
              error: errorMessage, 
              code: dbError.code,
              hint: dbError.hint,
              details: dbError.details
            }),
            { 
              status: 500, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          )
        }
      }

      case 'get_successful': {
        const limit = body.limit ?? 50

        // Get successful prompts for this user
        const { data, error } = await supabaseClient
          .from('prompt_history')
          .select('*')
          .eq('user_id', user.id)
          .eq('success', true)
          .order('created_at', { ascending: false })
          .limit(limit)

        if (error) {
          console.error('❌ Error fetching successful prompts:', error)
          return new Response(
            JSON.stringify({ error: 'Failed to fetch prompts' }),
            { 
              status: 500, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          )
        }

        console.log(`✅ Retrieved ${data.length} successful prompts`)
        return new Response(
          JSON.stringify({ success: true, data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'find_similar': {
        if (!body.prompt) {
          return new Response(
            JSON.stringify({ error: 'Prompt is required for find_similar action' }),
            { 
              status: 400, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          )
        }

        const limit = body.limit ?? 5

        // Get successful prompts and calculate similarity in memory
        // (For production, consider using PostgreSQL full-text search or vector similarity)
        const { data, error } = await supabaseClient
          .from('prompt_history')
          .select('*')
          .eq('user_id', user.id)
          .eq('success', true)
          .order('created_at', { ascending: false })
          .limit(100) // Get more to calculate similarity

        if (error) {
          console.error('❌ Error fetching prompts for similarity:', error)
          return new Response(
            JSON.stringify({ error: 'Failed to fetch prompts' }),
            { 
              status: 500, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          )
        }

        // Simple similarity calculation based on word overlap
        const inputWords = body.prompt.toLowerCase().split(/\s+/)
        const similarPrompts = data
          .map(entry => {
            const entryWords = entry.prompt.toLowerCase().split(/\s+/)
            const commonWords = inputWords.filter(word => entryWords.includes(word))
            const similarity = commonWords.length / Math.max(inputWords.length, entryWords.length)
            
            return {
              ...entry,
              similarity
            }
          })
          .filter(entry => entry.similarity > 0.2) // At least 20% similarity
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, limit)

        console.log(`✅ Found ${similarPrompts.length} similar prompts`)
        return new Response(
          JSON.stringify({ success: true, data: similarPrompts }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error)
    console.error('🔍 Error message:', error?.message || 'No error message')
    console.error('🔍 Error stack:', error?.stack || 'No stack trace')
    console.error('🔍 Error details:', JSON.stringify({
      name: error?.name,
      message: error?.message,
      stack: error?.stack,
      cause: error?.cause
    }, null, 2))
    
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error?.message || 'Unknown error'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
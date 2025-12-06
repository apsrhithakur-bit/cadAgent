import { createClient } from 'npm:@supabase/supabase-js@2.49.1'

interface RequestBody {
  userId?: string
  extraSearches?: number
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    // Initialize Supabase client with service role key
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const body: RequestBody = await req.json()
    const { userId, extraSearches = 10 } = body

    console.log('🔧 Manual add patent searches request:', { userId, extraSearches })

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'userId is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Check if user exists
    const { data: existingUser, error: userError } = await supabase
      .from('user_profiles')
      .select('id, email, subscription_tier, extra_patent_searches')
      .eq('id', userId)
      .single()

    if (userError || !existingUser) {
      console.error('❌ User not found:', userError)
      return new Response(
        JSON.stringify({ error: 'User not found', details: userError }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    console.log('👤 Found user:', existingUser)

    // Add extra patent searches
    const { data: updatedUser, error: updateError } = await supabase
      .from('user_profiles')
      .update({
        extra_patent_searches: (existingUser.extra_patent_searches || 0) + extraSearches,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select('id, email, subscription_tier, extra_patent_searches')
      .single()

    if (updateError) {
      console.error('❌ Update failed:', updateError)
      return new Response(
        JSON.stringify({ error: 'Update failed', details: updateError }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    console.log('✅ Successfully added extra patent searches:', updatedUser)

    return new Response(
      JSON.stringify({
        success: true,
        message: `Added ${extraSearches} extra patent searches`,
        before: existingUser,
        after: updatedUser
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('❌ Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}) 
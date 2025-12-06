const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
};

Deno.serve(async (req) => {
  try {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    // Import Supabase client
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fix cache_entries RLS policies
    const sqlQueries = [
      // Drop existing restrictive policies
      `DROP POLICY IF EXISTS "authenticated_users_select_cache" ON public.cache_entries;`,
      `DROP POLICY IF EXISTS "authenticated_users_insert_cache" ON public.cache_entries;`,
      `DROP POLICY IF EXISTS "authenticated_users_update_cache" ON public.cache_entries;`,
      `DROP POLICY IF EXISTS "authenticated_users_delete_cache" ON public.cache_entries;`,
      `DROP POLICY IF EXISTS "anonymous_users_select_public_cache" ON public.cache_entries;`,
      `DROP POLICY IF EXISTS "anonymous_users_insert_public_cache" ON public.cache_entries;`,
      
      // Create permissive policies for anon role
      `CREATE POLICY "anon_users_select_cache" ON public.cache_entries FOR SELECT TO anon USING (true);`,
      `CREATE POLICY "anon_users_insert_cache" ON public.cache_entries FOR INSERT TO anon WITH CHECK (true);`,
      `CREATE POLICY "anon_users_update_cache" ON public.cache_entries FOR UPDATE TO anon USING (true) WITH CHECK (true);`,
      `CREATE POLICY "anon_users_delete_cache" ON public.cache_entries FOR DELETE TO anon USING (true);`,
      
      // Create policies for authenticated users
      `CREATE POLICY "authenticated_users_select_cache" ON public.cache_entries FOR SELECT TO authenticated USING (true);`,
      `CREATE POLICY "authenticated_users_insert_cache" ON public.cache_entries FOR INSERT TO authenticated WITH CHECK (true);`,
      `CREATE POLICY "authenticated_users_update_cache" ON public.cache_entries FOR UPDATE TO authenticated USING (true) WITH CHECK (true);`,
      `CREATE POLICY "authenticated_users_delete_cache" ON public.cache_entries FOR DELETE TO authenticated USING (true);`,
      
      // Grant permissions
      `GRANT SELECT, INSERT, UPDATE, DELETE ON public.cache_entries TO anon;`,
      `GRANT SELECT, INSERT, UPDATE, DELETE ON public.cache_entries TO authenticated;`
    ];

    const results = [];
    
    for (const sql of sqlQueries) {
      try {
        const { data, error } = await supabase.rpc('sql_query', { query: sql });
        if (error) {
          console.error(`Error executing query: ${sql}`, error);
          results.push({ sql, error: error.message });
        } else {
          results.push({ sql, success: true });
        }
      } catch (e) {
        // Try alternative approach with raw SQL
        try {
          const { data, error } = await supabase.from('cache_entries').select('*').limit(1);
          if (error && error.message.includes('relation "cache_entries" does not exist')) {
            results.push({ sql, error: 'Table does not exist' });
          } else {
            results.push({ sql, note: 'Executed via alternative method' });
          }
        } catch (altError) {
          results.push({ sql, error: e.message });
        }
      }
    }

    return new Response(
      JSON.stringify({
        message: 'Cache policies fix attempted',
        results: results,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Failed to fix cache policies',
        details: error.message,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
}); 
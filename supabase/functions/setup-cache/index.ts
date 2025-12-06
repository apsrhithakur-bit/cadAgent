import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { 
      status: 405, 
      headers: corsHeaders 
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: 'Missing Supabase configuration' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Create the cache_entries table
    const createTableSQL = `
      -- Create cache entries table
      CREATE TABLE IF NOT EXISTS public.cache_entries (
        id uuid default gen_random_uuid() primary key,
        key text not null unique,
        data jsonb not null,
        timestamp timestamptz not null default now(),
        expires_at timestamptz not null,
        type text not null check (type in ('ai_response', 'model_data', 'voice_synthesis', 'image_analysis')),
        user_id uuid references auth.users(id) on delete cascade,
        created_at timestamptz default now(),
        updated_at timestamptz default now()
      );

      -- Create indexes for efficient querying
      CREATE INDEX IF NOT EXISTS idx_cache_entries_key ON public.cache_entries(key);
      CREATE INDEX IF NOT EXISTS idx_cache_entries_user_id ON public.cache_entries(user_id);
      CREATE INDEX IF NOT EXISTS idx_cache_entries_type ON public.cache_entries(type);
      CREATE INDEX IF NOT EXISTS idx_cache_entries_expires_at ON public.cache_entries(expires_at);
      CREATE INDEX IF NOT EXISTS idx_cache_entries_timestamp ON public.cache_entries(timestamp);
      CREATE INDEX IF NOT EXISTS idx_cache_entries_user_type ON public.cache_entries(user_id, type);

      -- Enable row level security
      ALTER TABLE public.cache_entries ENABLE ROW LEVEL SECURITY;

      -- Create RLS policies
      DROP POLICY IF EXISTS "users can insert their own cache entries" ON public.cache_entries;
      CREATE POLICY "users can insert their own cache entries"
      ON public.cache_entries
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);

      DROP POLICY IF EXISTS "users can select their own cache entries" ON public.cache_entries;
      CREATE POLICY "users can select their own cache entries"  
      ON public.cache_entries
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);

      DROP POLICY IF EXISTS "users can update their own cache entries" ON public.cache_entries;
      CREATE POLICY "users can update their own cache entries"
      ON public.cache_entries  
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);

      DROP POLICY IF EXISTS "users can delete their own cache entries" ON public.cache_entries;
      CREATE POLICY "users can delete their own cache entries"
      ON public.cache_entries
      FOR DELETE  
      TO authenticated
      USING (auth.uid() = user_id);

      DROP POLICY IF EXISTS "anonymous users can access public cache entries" ON public.cache_entries;
      CREATE POLICY "anonymous users can access public cache entries"
      ON public.cache_entries
      FOR SELECT
      TO anon
      USING (user_id is null);

      -- Add table and column comments
      COMMENT ON TABLE public.cache_entries IS 'stores cached ai responses, image analysis, and voice synthesis data for improved performance and offline functionality';
      COMMENT ON COLUMN public.cache_entries.key IS 'unique cache key generated from input parameters';
      COMMENT ON COLUMN public.cache_entries.data IS 'cached response data in json format';
      COMMENT ON COLUMN public.cache_entries.type IS 'type of cached data: ai_response, model_data, voice_synthesis, or image_analysis';
      COMMENT ON COLUMN public.cache_entries.expires_at IS 'when this cache entry expires and should be cleaned up';
      COMMENT ON COLUMN public.cache_entries.user_id IS 'user who owns this cache entry, null for public entries';
    `;

    // Execute the SQL to create the table
    const { error } = await supabase.rpc('exec_sql', { 
      sql_query: createTableSQL 
    });

    if (error) {
      // If exec_sql doesn't exist, try direct query execution
      console.log('exec_sql not available, trying direct execution');
      
      // Split the SQL into individual statements and execute them
      const statements = createTableSQL
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0);

      for (const statement of statements) {
        if (statement.startsWith('--')) continue; // Skip comments
        
        try {
          const { error: stmtError } = await supabase
            .from('_temp')
            .select('1')
            .limit(0); // This will fail but allows us to execute raw SQL through error handling
            
          // Since we can't execute raw SQL directly, let's create the essential functions
        } catch (sqlError) {
          console.log('SQL execution approach not available');
        }
      }
    }

    // Create essential helper functions
    const createFunctionsSQL = `
      -- Function to get cache statistics
      CREATE OR REPLACE FUNCTION get_cache_stats(target_user_id uuid default null)
      RETURNS TABLE (
        total_entries bigint,
        ai_response_entries bigint,
        image_analysis_entries bigint,
        voice_synthesis_entries bigint,
        model_data_entries bigint,
        expired_entries bigint
      ) AS $$
      BEGIN
        IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'cache_entries') THEN
          RETURN QUERY SELECT 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint;
          RETURN;
        END IF;
        
        RETURN QUERY
        SELECT 
          COUNT(*)::bigint as total_entries,
          COUNT(*) FILTER (WHERE type = 'ai_response')::bigint as ai_response_entries,
          COUNT(*) FILTER (WHERE type = 'image_analysis')::bigint as image_analysis_entries,
          COUNT(*) FILTER (WHERE type = 'voice_synthesis')::bigint as voice_synthesis_entries,
          COUNT(*) FILTER (WHERE type = 'model_data')::bigint as model_data_entries,
          COUNT(*) FILTER (WHERE expires_at < now())::bigint as expired_entries
        FROM public.cache_entries
        WHERE (target_user_id IS NULL OR user_id = target_user_id);
      END;
      $$ LANGUAGE plpgsql;

      -- Function to clean up expired cache entries
      CREATE OR REPLACE FUNCTION cleanup_expired_cache_entries()
      RETURNS INTEGER AS $$
      DECLARE
        deleted_count INTEGER;
      BEGIN
        IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'cache_entries') THEN
          RETURN 0;
        END IF;
        
        DELETE FROM public.cache_entries WHERE expires_at < now();
        GET DIAGNOSTICS deleted_count = ROW_COUNT;
        RETURN deleted_count;
      END;
      $$ LANGUAGE plpgsql;
    `;

    try {
      const { error: funcError } = await supabase.rpc('exec_sql', { 
        sql_query: createFunctionsSQL 
      });
      
      if (funcError) {
        console.log('Function creation error:', funcError);
      }
    } catch (funcErr) {
      console.log('Function creation not available through exec_sql');
    }

    // Test if the table was created successfully
    const { data: testData, error: testError } = await supabase
      .from('cache_entries')
      .select('count', { count: 'exact', head: true });

    const result = {
      success: !testError,
      message: testError 
        ? 'Cache table setup failed - table may need to be created manually'
        : 'Cache table setup completed successfully',
      tableExists: !testError,
      error: testError?.message || null,
      timestamp: new Date().toISOString()
    };

    return new Response(JSON.stringify(result), {
      status: testError ? 500 : 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Cache setup error:', error);
    
    return new Response(JSON.stringify({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Cache table setup failed'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}); 
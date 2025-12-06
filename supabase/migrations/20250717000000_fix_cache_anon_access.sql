-- Fix cache_entries RLS policies for anon key access
-- This migration addresses the 406 errors when accessing cache_entries with anon key

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "authenticated_users_select_cache" ON public.cache_entries;
DROP POLICY IF EXISTS "authenticated_users_insert_cache" ON public.cache_entries;
DROP POLICY IF EXISTS "authenticated_users_update_cache" ON public.cache_entries;
DROP POLICY IF EXISTS "authenticated_users_delete_cache" ON public.cache_entries;
DROP POLICY IF EXISTS "anonymous_users_select_public_cache" ON public.cache_entries;
DROP POLICY IF EXISTS "anonymous_users_insert_public_cache" ON public.cache_entries;
DROP POLICY IF EXISTS "anon_users_select_cache" ON public.cache_entries;
DROP POLICY IF EXISTS "anon_users_insert_cache" ON public.cache_entries;
DROP POLICY IF EXISTS "anon_users_update_cache" ON public.cache_entries;
DROP POLICY IF EXISTS "anon_users_delete_cache" ON public.cache_entries;

-- Create more permissive policies that work with anon key authentication

-- Policy: Allow anon role to select cache entries (for both user-specific and public)
CREATE POLICY "anon_users_select_cache"
ON public.cache_entries
FOR SELECT
TO anon
USING (true);

-- Policy: Allow anon role to insert cache entries  
CREATE POLICY "anon_users_insert_cache"
ON public.cache_entries
FOR INSERT
TO anon
WITH CHECK (true);

-- Policy: Allow anon role to update cache entries
CREATE POLICY "anon_users_update_cache"
ON public.cache_entries
FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

-- Policy: Allow anon role to delete cache entries
CREATE POLICY "anon_users_delete_cache"
ON public.cache_entries
FOR DELETE
TO anon
USING (true);

-- Policy: Allow authenticated users to select cache entries
CREATE POLICY "authenticated_users_select_cache"
ON public.cache_entries
FOR SELECT
TO authenticated
USING (true);

-- Policy: Allow authenticated users to insert cache entries
CREATE POLICY "authenticated_users_insert_cache"
ON public.cache_entries
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Policy: Allow authenticated users to update cache entries
CREATE POLICY "authenticated_users_update_cache"
ON public.cache_entries
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Policy: Allow authenticated users to delete cache entries
CREATE POLICY "authenticated_users_delete_cache"
ON public.cache_entries
FOR DELETE
TO authenticated
USING (true);

-- Add helpful comments
COMMENT ON POLICY "anon_users_select_cache" ON public.cache_entries IS 'Allow anon users to read cache entries';
COMMENT ON POLICY "anon_users_insert_cache" ON public.cache_entries IS 'Allow anon users to create cache entries';
COMMENT ON POLICY "anon_users_update_cache" ON public.cache_entries IS 'Allow anon users to update cache entries';
COMMENT ON POLICY "anon_users_delete_cache" ON public.cache_entries IS 'Allow anon users to delete cache entries';

-- Ensure the table exists and has proper structure
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

-- Grant permissions to anon role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cache_entries TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cache_entries TO authenticated;

-- Grant sequence permissions (only if sequence exists)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'cache_entries_id_seq') THEN
    GRANT USAGE ON SEQUENCE cache_entries_id_seq TO anon;
    GRANT USAGE ON SEQUENCE cache_entries_id_seq TO authenticated;
  END IF;
END $$;

-- Add helpful table comment
COMMENT ON TABLE public.cache_entries IS 'Cache storage accessible by both authenticated and anonymous users for improved performance'; 
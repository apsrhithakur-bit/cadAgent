-- Fix cache_entries RLS policies for better compatibility
-- This migration fixes issues with cache access for authenticated users

-- Drop existing policies
DROP POLICY IF EXISTS "users can insert their own cache entries" ON public.cache_entries;
DROP POLICY IF EXISTS "users can select their own cache entries" ON public.cache_entries;
DROP POLICY IF EXISTS "users can update their own cache entries" ON public.cache_entries;
DROP POLICY IF EXISTS "users can delete their own cache entries" ON public.cache_entries;
DROP POLICY IF EXISTS "anonymous users can access public cache entries" ON public.cache_entries;

-- Create more flexible policies that handle both authenticated and public cache entries

-- Policy: Allow authenticated users to select their own cache entries OR public entries (user_id is null)
CREATE POLICY "authenticated_users_select_cache"
ON public.cache_entries
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR user_id IS NULL);

-- Policy: Allow authenticated users to insert cache entries (with their user_id or null for public)
CREATE POLICY "authenticated_users_insert_cache"
ON public.cache_entries
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Policy: Allow authenticated users to update their own cache entries
CREATE POLICY "authenticated_users_update_cache"
ON public.cache_entries
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy: Allow authenticated users to delete their own cache entries OR public entries
CREATE POLICY "authenticated_users_delete_cache"
ON public.cache_entries
FOR DELETE
TO authenticated
USING (auth.uid() = user_id OR user_id IS NULL);

-- Policy: Allow anonymous users to select public cache entries only
CREATE POLICY "anonymous_users_select_public_cache"
ON public.cache_entries
FOR SELECT
TO anon
USING (user_id IS NULL);

-- Policy: Allow anonymous users to insert public cache entries only
CREATE POLICY "anonymous_users_insert_public_cache"
ON public.cache_entries
FOR INSERT
TO anon
WITH CHECK (user_id IS NULL);

-- Add helpful comments to explain the policies
COMMENT ON POLICY "authenticated_users_select_cache" ON public.cache_entries IS 'Authenticated users can access their own cache entries and public entries';
COMMENT ON POLICY "authenticated_users_insert_cache" ON public.cache_entries IS 'Authenticated users can create cache entries with their user_id or as public entries';
COMMENT ON POLICY "authenticated_users_update_cache" ON public.cache_entries IS 'Authenticated users can only update their own cache entries';
COMMENT ON POLICY "authenticated_users_delete_cache" ON public.cache_entries IS 'Authenticated users can delete their own cache entries and public entries';
COMMENT ON POLICY "anonymous_users_select_public_cache" ON public.cache_entries IS 'Anonymous users can only access public cache entries';
COMMENT ON POLICY "anonymous_users_insert_public_cache" ON public.cache_entries IS 'Anonymous users can only create public cache entries';

-- Ensure proper indexes exist for efficient policy queries
CREATE INDEX IF NOT EXISTS idx_cache_entries_user_id_null ON public.cache_entries(user_id) WHERE user_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_cache_entries_auth_access ON public.cache_entries(user_id, expires_at) WHERE user_id IS NOT NULL;

-- Add helpful table comment
COMMENT ON TABLE public.cache_entries IS 'Cache storage for AI responses, model data, and other cached content. Supports both user-specific and public cache entries.';

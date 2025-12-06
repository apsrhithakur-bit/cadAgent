-- Fix RLS policies to allow users to update their own extra_patent_searches
-- This fixes the issue where purchases can't update the patent search limits

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile including purchases" ON public.user_profiles;
DROP POLICY IF EXISTS "Service role can update any profile" ON public.user_profiles;

-- Create a more permissive update policy that allows users to update their own profiles
CREATE POLICY "Users can update own profile including purchases" 
ON public.user_profiles 
FOR UPDATE 
TO authenticated 
USING (auth.uid() = id) 
WITH CHECK (auth.uid() = id);

-- Also ensure service role can update any profile (for webhooks)
CREATE POLICY "Service role can update any profile" 
ON public.user_profiles 
FOR UPDATE 
TO service_role 
USING (true) 
WITH CHECK (true);

-- Grant necessary permissions
GRANT UPDATE ON public.user_profiles TO authenticated;
GRANT ALL ON public.user_profiles TO service_role; 
/*
  # Fix User Profiles Authentication Setup

  1. Database Changes
    - Remove foreign key constraint that references non-existent users table
    - Update user_profiles to properly reference auth.users
    - Fix trigger function to handle user profile creation correctly
    - Add proper RLS policies for user profiles

  2. Security
    - Enable RLS on user_profiles table
    - Add policies for authenticated users to manage their own profiles
    - Add service role policy for administrative access
*/

-- First, drop the existing foreign key constraint that's causing issues
ALTER TABLE public.user_profiles 
DROP CONSTRAINT IF EXISTS user_profiles_id_fkey;

-- Add the correct foreign key constraint to auth.users
ALTER TABLE public.user_profiles 
ADD CONSTRAINT user_profiles_id_fkey 
FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create or replace the function that handles new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (
    id, 
    email, 
    subscription_tier, 
    subscription_status,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id, 
    NEW.email,
    'free',
    'active',
    NOW(),
    NOW()
  );
  RETURN NEW;
EXCEPTION
  WHEN others THEN
    -- Log the error but don't fail the user creation
    RAISE LOG 'Error creating user profile for %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop the trigger if it exists and recreate it
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Ensure RLS is enabled on user_profiles
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to recreate them properly
DROP POLICY IF EXISTS "Users can read own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Service role can manage all profiles" ON public.user_profiles;

-- Create proper RLS policies
CREATE POLICY "Users can read own profile"
  ON public.user_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.user_profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Service role can manage all profiles"
  ON public.user_profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_profiles TO authenticated;
GRANT ALL ON public.user_profiles TO service_role;

-- Also ensure usage_tracking table has proper permissions
GRANT SELECT, INSERT, UPDATE ON public.usage_tracking TO authenticated;
GRANT ALL ON public.usage_tracking TO service_role;

-- And design_sessions table
GRANT SELECT, INSERT, UPDATE, DELETE ON public.design_sessions TO authenticated;
GRANT ALL ON public.design_sessions TO service_role;

-- And refine_chats table
GRANT SELECT, INSERT, UPDATE, DELETE ON public.refine_chats TO authenticated;
GRANT ALL ON public.refine_chats TO service_role;
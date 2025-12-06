/*
  # Fix Authentication Trigger Function

  This migration fixes the authentication issues by ensuring the trigger function
  exists and works properly for creating user profiles when new users sign up.

  ## Changes Made
  1. Create or replace the handle_new_user function
  2. Ensure the trigger exists and is properly configured
  3. Add proper error handling to the function

  ## Security
  - Function runs with SECURITY DEFINER to have proper permissions
  - Maintains existing RLS policies on user_profiles table
*/

-- Create or replace the function that handles new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, subscription_tier, subscription_status)
  VALUES (
    NEW.id, 
    NEW.email,
    'free',
    'active'
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

-- Ensure the function has proper permissions
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
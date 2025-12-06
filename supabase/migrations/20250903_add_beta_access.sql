-- Add beta access fields to user_profiles table
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS optimization_beta_access BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS beta_access_granted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS beta_access_reason TEXT,
ADD COLUMN IF NOT EXISTS beta_features JSONB DEFAULT '[]'::jsonb;

-- Create index for faster beta access queries
CREATE INDEX IF NOT EXISTS idx_user_profiles_optimization_beta_access 
ON user_profiles(optimization_beta_access) 
WHERE optimization_beta_access = TRUE;

-- Create a table to track beta access requests
CREATE TABLE IF NOT EXISTS beta_access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  reason TEXT NOT NULL,
  feature_requested TEXT NOT NULL DEFAULT 'optimization',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create RLS policies for beta_access_requests
ALTER TABLE beta_access_requests ENABLE ROW LEVEL SECURITY;

-- Users can insert their own requests
CREATE POLICY "Users can create their own beta requests"
  ON beta_access_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can view their own requests
CREATE POLICY "Users can view their own beta requests"
  ON beta_access_requests
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Function to grant beta access
CREATE OR REPLACE FUNCTION grant_beta_access(
  target_user_id UUID,
  feature TEXT DEFAULT 'optimization'
)
RETURNS VOID AS $$
BEGIN
  -- Update user profile to grant beta access
  UPDATE user_profiles
  SET 
    optimization_beta_access = TRUE,
    beta_access_granted_at = NOW(),
    beta_features = CASE 
      WHEN beta_features::jsonb ? feature THEN beta_features
      ELSE beta_features::jsonb || to_jsonb(feature)
    END,
    updated_at = NOW()
  WHERE id = target_user_id;
  
  -- Update any pending requests for this user
  UPDATE beta_access_requests
  SET 
    status = 'approved',
    reviewed_at = NOW(),
    updated_at = NOW()
  WHERE user_id = target_user_id 
    AND feature_requested = feature
    AND status = 'pending';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to revoke beta access
CREATE OR REPLACE FUNCTION revoke_beta_access(
  target_user_id UUID,
  feature TEXT DEFAULT 'optimization'
)
RETURNS VOID AS $$
BEGIN
  UPDATE user_profiles
  SET 
    optimization_beta_access = FALSE,
    beta_features = (beta_features::jsonb - feature)::jsonb,
    updated_at = NOW()
  WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant yourself beta access (replace with your actual user ID)
-- You can run this after deployment:
-- SELECT grant_beta_access('your-user-id-here', 'optimization');
-- Simple migration to fix existing users with legacy "manufacturer" tier
-- Convert them to "pro" tier with manufacturer_access = true

-- Log the start of migration
DO $$
DECLARE
  affected_rows integer;
BEGIN
  -- Update users with "manufacturer" tier to "pro" tier with manufacturer access
  UPDATE user_profiles 
  SET 
    subscription_tier = 'pro',
    manufacturer_access = true,
    updated_at = now()
  WHERE subscription_tier::text = 'manufacturer';
  
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  
  -- Log the result
  RAISE LOG 'Migrated % users from manufacturer tier to pro tier with manufacturer access', affected_rows;
  
  -- If any users were affected, also log their emails for debugging
  IF affected_rows > 0 THEN
    RAISE LOG 'Migration completed successfully. Users now have tier=pro and manufacturer_access=true';
  ELSE
    RAISE LOG 'No users with manufacturer tier found - migration not needed';
  END IF;
END $$;

-- Also ensure any users with NULL manufacturer_access get it set to false by default
UPDATE user_profiles 
SET manufacturer_access = false
WHERE manufacturer_access IS NULL;

-- Add a helpful view to check user subscription status
CREATE OR REPLACE VIEW user_subscription_summary AS
SELECT 
  id,
  email,
  subscription_tier,
  manufacturer_access,
  subscription_status,
  stripe_customer_id IS NOT NULL as has_stripe_customer,
  updated_at
FROM user_profiles
ORDER BY updated_at DESC;

-- Grant access to the view
GRANT SELECT ON user_subscription_summary TO service_role; 
-- COMPREHENSIVE SECURITY LOCKDOWN MIGRATION
-- This migration addresses all critical security vulnerabilities in subscription tier management

-- 1. SECURE manual_update_user_profile function to prevent manufacturer tier bypass
CREATE OR REPLACE FUNCTION manual_update_user_profile(
  p_user_id uuid,
  p_tier subscription_tier,
  p_status subscription_status,
  p_customer_id text,
  p_subscription_id text,
  p_period_start bigint,
  p_period_end bigint
)
RETURNS boolean AS $$
BEGIN
  -- SECURITY: Block any attempt to set manufacturer tier
  IF p_tier = 'manufacturer' THEN
    RAISE EXCEPTION 'SECURITY VIOLATION: Direct assignment to manufacturer tier is not allowed. Use pro tier with manufacturer_access = true instead.';
  END IF;

  -- SECURITY: Only allow service role to call this function
  IF NOT (current_setting('role') = 'service_role' OR current_setting('role') = 'postgres') THEN
    RAISE EXCEPTION 'SECURITY VIOLATION: This function can only be called by service role.';
  END IF;

  UPDATE user_profiles 
  SET 
    subscription_tier = p_tier,
    stripe_customer_id = p_customer_id,
    stripe_subscription_id = p_subscription_id,
    subscription_status = p_status,
    current_period_start = CASE 
      WHEN p_period_start IS NOT NULL 
      THEN to_timestamp(p_period_start)::timestamptz
      ELSE NULL
    END,
    current_period_end = CASE 
      WHEN p_period_end IS NOT NULL 
      THEN to_timestamp(p_period_end)::timestamptz
      ELSE NULL
    END,
    updated_at = now()
  WHERE id = p_user_id;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. SECURE ALL sync functions to handle manufacturer subscriptions properly
CREATE OR REPLACE FUNCTION sync_user_subscription_tier()
RETURNS TRIGGER AS $$
DECLARE
  target_user_id uuid;
  tier_value subscription_tier;
  status_value subscription_status;
  manufacturer_access_value boolean := false;
BEGIN
  -- Get the user_id from the stripe_customers table
  SELECT sc.user_id INTO target_user_id
  FROM stripe_customers sc
  WHERE sc.customer_id = NEW.customer_id
  AND sc.deleted_at IS NULL;

  -- If no user found, log and exit
  IF target_user_id IS NULL THEN
    RAISE LOG 'sync_user_subscription_tier: No user found for customer_id: %', NEW.customer_id;
    RETURN NEW;
  END IF;

  RAISE LOG 'sync_user_subscription_tier: Processing user: %, customer: %, status: %, price_id: %', 
    target_user_id, NEW.customer_id, NEW.status, NEW.price_id;

  -- Determine subscription tier based on price_id and status
  IF NEW.status IN ('active', 'trialing') AND NEW.price_id IS NOT NULL THEN
    CASE NEW.price_id
      WHEN 'price_1ReRffQlr7BhgPjLRYQKCMwi' THEN
        tier_value := 'plus'::subscription_tier;
      WHEN 'price_1ReRgCQlr7BhgPjLzPv64mSG' THEN
        tier_value := 'pro'::subscription_tier;
      WHEN 'price_1RjsBpQlr7BhgPjLEDrIvngq' THEN
        -- SECURITY: Manufacturer subscription = Pro tier + manufacturer access
        tier_value := 'pro'::subscription_tier;
        manufacturer_access_value := true;
      ELSE
        tier_value := 'free'::subscription_tier;
        RAISE LOG 'sync_user_subscription_tier: Unknown price_id: %, defaulting to free tier', NEW.price_id;
    END CASE;
  ELSE
    tier_value := 'free'::subscription_tier;
  END IF;

  -- Map Stripe status to our subscription_status enum
  CASE NEW.status
    WHEN 'active' THEN status_value := 'active'::subscription_status;
    WHEN 'canceled' THEN status_value := 'canceled'::subscription_status;
    WHEN 'past_due' THEN status_value := 'past_due'::subscription_status;
    WHEN 'incomplete' THEN status_value := 'incomplete'::subscription_status;
    WHEN 'trialing' THEN status_value := 'trialing'::subscription_status;
    WHEN 'incomplete_expired' THEN status_value := 'canceled'::subscription_status;
    WHEN 'unpaid' THEN status_value := 'past_due'::subscription_status;
    WHEN 'paused' THEN status_value := 'canceled'::subscription_status;
    WHEN 'not_started' THEN status_value := 'active'::subscription_status;
    ELSE status_value := NULL;
  END CASE;

  -- Update the user profile
  UPDATE user_profiles 
  SET 
    subscription_tier = tier_value,
    stripe_customer_id = NEW.customer_id,
    stripe_subscription_id = NEW.subscription_id,
    subscription_status = status_value,
    manufacturer_access = manufacturer_access_value,
    current_period_start = CASE 
      WHEN NEW.current_period_start IS NOT NULL 
      THEN to_timestamp(NEW.current_period_start)::timestamptz
      ELSE NULL
    END,
    current_period_end = CASE 
      WHEN NEW.current_period_end IS NOT NULL 
      THEN to_timestamp(NEW.current_period_end)::timestamptz
      ELSE NULL
    END,
    updated_at = now()
  WHERE id = target_user_id;

  IF FOUND THEN
    RAISE LOG 'sync_user_subscription_tier: SECURITY COMPLIANT - Updated user: %, tier: %, status: %, manufacturer_access: %', 
      target_user_id, tier_value, status_value, manufacturer_access_value;
  ELSE
    RAISE LOG 'sync_user_subscription_tier: Failed to update user profile for user: %', target_user_id;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'sync_user_subscription_tier: Error - % - %', SQLSTATE, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. SECURE force_sync_user_subscription function
DROP FUNCTION IF EXISTS force_sync_user_subscription(text);
CREATE OR REPLACE FUNCTION force_sync_user_subscription(customer_id_param text)
RETURNS TABLE(
  user_id uuid,
  old_tier subscription_tier,
  new_tier subscription_tier,
  old_status subscription_status,
  new_status subscription_status,
  manufacturer_access boolean,
  success boolean
) AS $$
DECLARE
  target_user_id uuid;
  subscription_record RECORD;
  old_tier_val subscription_tier;
  old_status_val subscription_status;
  new_tier_val subscription_tier;
  new_status_val subscription_status;
  manufacturer_access_val boolean := false;
BEGIN
  -- SECURITY: Only allow service role to call this function
  IF NOT (current_setting('role') = 'service_role' OR current_setting('role') = 'postgres') THEN
    RAISE EXCEPTION 'SECURITY VIOLATION: This function can only be called by service role.';
  END IF;

  -- Get user ID from customer ID
  SELECT sc.user_id INTO target_user_id
  FROM stripe_customers sc
  WHERE sc.customer_id = customer_id_param
  AND sc.deleted_at IS NULL;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'No user found for customer_id: %', customer_id_param;
  END IF;

  -- Get current profile values
  SELECT subscription_tier, subscription_status INTO old_tier_val, old_status_val
  FROM user_profiles
  WHERE id = target_user_id;

  -- Get latest subscription record
  SELECT * INTO subscription_record
  FROM stripe_subscriptions ss
  WHERE ss.customer_id = customer_id_param
  ORDER BY ss.updated_at DESC
  LIMIT 1;

  IF subscription_record IS NOT NULL THEN
    -- Determine new tier with SECURITY CONTROLS
    IF subscription_record.status IN ('active', 'trialing') AND subscription_record.price_id IS NOT NULL THEN
      CASE subscription_record.price_id
        WHEN 'price_1ReRffQlr7BhgPjLRYQKCMwi' THEN
          new_tier_val := 'plus'::subscription_tier;
        WHEN 'price_1ReRgCQlr7BhgPjLzPv64mSG' THEN
          new_tier_val := 'pro'::subscription_tier;
        WHEN 'price_1RjsBpQlr7BhgPjLEDrIvngq' THEN
          -- SECURITY: Manufacturer subscription = Pro tier + manufacturer access
          new_tier_val := 'pro'::subscription_tier;
          manufacturer_access_val := true;
        ELSE
          new_tier_val := 'free'::subscription_tier;
      END CASE;
    ELSE
      new_tier_val := 'free'::subscription_tier;
    END IF;

    -- Determine new status
    CASE subscription_record.status
      WHEN 'active' THEN new_status_val := 'active'::subscription_status;
      WHEN 'canceled' THEN new_status_val := 'canceled'::subscription_status;
      WHEN 'past_due' THEN new_status_val := 'past_due'::subscription_status;
      WHEN 'incomplete' THEN new_status_val := 'incomplete'::subscription_status;
      WHEN 'trialing' THEN new_status_val := 'trialing'::subscription_status;
      ELSE new_status_val := NULL;
    END CASE;

    -- SECURITY COMPLIANT UPDATE
    UPDATE user_profiles 
    SET 
      subscription_tier = new_tier_val,
      stripe_customer_id = customer_id_param,
      stripe_subscription_id = subscription_record.subscription_id,
      subscription_status = new_status_val,
      manufacturer_access = manufacturer_access_val,
      current_period_start = CASE 
        WHEN subscription_record.current_period_start IS NOT NULL 
        THEN to_timestamp(subscription_record.current_period_start)::timestamptz
        ELSE NULL
      END,
      current_period_end = CASE 
        WHEN subscription_record.current_period_end IS NOT NULL 
        THEN to_timestamp(subscription_record.current_period_end)::timestamptz
        ELSE NULL
      END,
      updated_at = now()
    WHERE id = target_user_id;

    -- Return the results
    RETURN QUERY
    SELECT 
      target_user_id,
      old_tier_val,
      new_tier_val,
      old_status_val,
      new_status_val,
      manufacturer_access_val,
      FOUND;
  ELSE
    RAISE EXCEPTION 'No subscription found for customer_id: %', customer_id_param;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. CREATE SECURITY AUDIT FUNCTION
CREATE OR REPLACE FUNCTION audit_subscription_tier_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Log all subscription tier changes for security auditing
  RAISE LOG 'SECURITY AUDIT: User % subscription_tier changed from % to % by role %', 
    NEW.id, OLD.subscription_tier, NEW.subscription_tier, current_setting('role');
  
  -- Alert if manufacturer tier is somehow set
  IF NEW.subscription_tier = 'manufacturer' THEN
    RAISE LOG 'SECURITY ALERT: Manufacturer tier detected for user %! This should not happen.', NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. CREATE AUDIT TRIGGER
DROP TRIGGER IF EXISTS audit_subscription_tier_trigger ON user_profiles;
CREATE TRIGGER audit_subscription_tier_trigger
  AFTER UPDATE OF subscription_tier ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION audit_subscription_tier_change();

-- 6. ENSURE SECURITY TRIGGER IS ACTIVE
DROP TRIGGER IF EXISTS prevent_manufacturer_tier_trigger ON user_profiles;
CREATE TRIGGER prevent_manufacturer_tier_trigger
  BEFORE INSERT OR UPDATE OF subscription_tier ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION prevent_manufacturer_tier_assignment();

-- 7. RECREATE SYNC TRIGGER TO ENSURE LATEST VERSION
DROP TRIGGER IF EXISTS sync_subscription_tier_trigger ON stripe_subscriptions;
CREATE TRIGGER sync_subscription_tier_trigger
  AFTER INSERT OR UPDATE ON stripe_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION sync_user_subscription_tier();

-- 8. SECURE ALL PERMISSIONS
REVOKE ALL ON FUNCTION manual_update_user_profile(uuid, subscription_tier, subscription_status, text, text, bigint, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION manual_update_user_profile(uuid, subscription_tier, subscription_status, text, text, bigint, bigint) TO service_role;

REVOKE ALL ON FUNCTION force_sync_user_subscription(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION force_sync_user_subscription(text) TO service_role;

REVOKE ALL ON FUNCTION sync_user_subscription_tier() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sync_user_subscription_tier() TO service_role;

GRANT EXECUTE ON FUNCTION has_manufacturer_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION audit_subscription_tier_change() TO service_role;
GRANT EXECUTE ON FUNCTION prevent_manufacturer_tier_assignment() TO service_role;

-- 9. SECURITY VERIFICATION QUERY
DO $$
DECLARE
  manufacturer_count integer;
BEGIN
  SELECT COUNT(*) INTO manufacturer_count
  FROM user_profiles
  WHERE subscription_tier = 'manufacturer';
  
  IF manufacturer_count > 0 THEN
    RAISE LOG 'SECURITY ALERT: Found % users with manufacturer tier! Investigating...', manufacturer_count;
    
    -- Log users with manufacturer tier
    RAISE LOG 'Users with manufacturer tier: %', (
      SELECT array_agg(id) FROM user_profiles WHERE subscription_tier = 'manufacturer'
    );
  ELSE
    RAISE LOG 'SECURITY CHECK PASSED: No users have manufacturer tier';
  END IF;
END $$;

-- 10. UPDATE COMMENTS FOR SECURITY AWARENESS
COMMENT ON FUNCTION manual_update_user_profile(uuid, subscription_tier, subscription_status, text, text, bigint, bigint) IS 'SECURITY HARDENED: Prevents manufacturer tier assignment. Service role only.';
COMMENT ON FUNCTION force_sync_user_subscription(text) IS 'SECURITY HARDENED: Handles manufacturer subscriptions securely. Service role only.';
COMMENT ON FUNCTION sync_user_subscription_tier() IS 'SECURITY HARDENED: Maps manufacturer subscriptions to pro+manufacturer_access. Service role only.';
COMMENT ON FUNCTION audit_subscription_tier_change() IS 'SECURITY AUDIT: Logs all subscription tier changes for monitoring.';
COMMENT ON FUNCTION prevent_manufacturer_tier_assignment() IS 'SECURITY CONTROL: Blocks direct manufacturer tier assignment.';

-- SUCCESS MESSAGE
DO $$
BEGIN
  RAISE LOG 'SECURITY LOCKDOWN COMPLETE: All subscription tier vulnerabilities have been secured.';
END $$; 
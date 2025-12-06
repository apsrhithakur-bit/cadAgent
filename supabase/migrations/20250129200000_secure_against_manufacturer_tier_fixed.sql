-- Comprehensive security migration to prevent manufacturer tier usage
-- This ensures the manufacturer tier can never be accidentally used

-- 1. Fix has_manufacturer_access function to only check manufacturer_access field
CREATE OR REPLACE FUNCTION has_manufacturer_access(user_id uuid)
RETURNS boolean AS $$
DECLARE
  profile_record record;
BEGIN
  SELECT 
    manufacturer_access,
    subscription_status
  INTO profile_record
  FROM user_profiles
  WHERE id = user_id;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Only allow access if explicitly granted via manufacturer_access field
  -- Remove all references to manufacturer tier for security
  RETURN profile_record.manufacturer_access = true 
    AND (profile_record.subscription_status = 'active' OR profile_record.subscription_status IS NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Update sync_user_subscription_tier function to handle manufacturer subscriptions
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
        -- Manufacturer subscription = Pro tier + manufacturer access
        tier_value := 'pro'::subscription_tier;
        manufacturer_access_value := true;
      ELSE
        tier_value := 'free'::subscription_tier;
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
    RAISE LOG 'sync_user_subscription_tier: Successfully updated user profile for user: %, tier: %, status: %, manufacturer_access: %', 
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

-- 3. Drop and recreate force_sync_user_subscription function to handle manufacturer subscriptions
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
    -- Determine new tier
    IF subscription_record.status IN ('active', 'trialing') AND subscription_record.price_id IS NOT NULL THEN
      CASE subscription_record.price_id
        WHEN 'price_1ReRffQlr7BhgPjLRYQKCMwi' THEN
          new_tier_val := 'plus'::subscription_tier;
        WHEN 'price_1ReRgCQlr7BhgPjLzPv64mSG' THEN
          new_tier_val := 'pro'::subscription_tier;
        WHEN 'price_1RjsBpQlr7BhgPjLEDrIvngq' THEN
          -- Manufacturer subscription = Pro tier + manufacturer access
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

    -- Force update the profile
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

-- 4. Create security function to prevent manufacturer tier assignment
CREATE OR REPLACE FUNCTION prevent_manufacturer_tier_assignment()
RETURNS TRIGGER AS $$
BEGIN
  -- Block any attempt to set subscription_tier to 'manufacturer'
  IF NEW.subscription_tier = 'manufacturer' THEN
    RAISE EXCEPTION 'Direct assignment to manufacturer tier is not allowed. Use pro tier with manufacturer_access = true instead.';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Create trigger to prevent manufacturer tier assignment
DROP TRIGGER IF EXISTS prevent_manufacturer_tier_trigger ON user_profiles;
CREATE TRIGGER prevent_manufacturer_tier_trigger
  BEFORE INSERT OR UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION prevent_manufacturer_tier_assignment();

-- Update comments to reflect security changes
COMMENT ON FUNCTION has_manufacturer_access(uuid) IS 'Check if a user has access to manufacturer features based only on manufacturer_access field. Manufacturer tier checks removed for security.';
COMMENT ON FUNCTION prevent_manufacturer_tier_assignment() IS 'Security function to prevent direct assignment of manufacturer tier';

-- Grant permissions
GRANT EXECUTE ON FUNCTION has_manufacturer_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION sync_user_subscription_tier() TO service_role;
GRANT EXECUTE ON FUNCTION force_sync_user_subscription(text) TO service_role; 
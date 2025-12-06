/*
  # Fix subscription sync and prevent infinite loops

  1. Enhanced Functions
    - Improved sync_user_subscription_tier function with better error handling
    - Added force refresh capability for immediate updates
    - Better logging and debugging

  2. Triggers
    - Ensure triggers fire correctly on subscription updates
    - Add additional safety checks

  3. Performance
    - Add indexes for better query performance
    - Optimize subscription lookup queries
*/

-- Drop and recreate the sync_user_subscription_tier function with enhanced functionality
CREATE OR REPLACE FUNCTION sync_user_subscription_tier()
RETURNS TRIGGER AS $$
DECLARE
  target_user_id uuid;
  tier_value subscription_tier;
  status_value subscription_status;
  old_tier subscription_tier;
  old_status subscription_status;
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

  -- Get current tier and status for comparison
  SELECT subscription_tier, subscription_status INTO old_tier, old_status
  FROM user_profiles
  WHERE id = target_user_id;

  RAISE LOG 'sync_user_subscription_tier: Processing user: %, customer: %, status: %, price_id: %, old_tier: %, old_status: %', 
    target_user_id, NEW.customer_id, NEW.status, NEW.price_id, old_tier, old_status;

  -- Determine subscription tier based on price_id and status
  IF NEW.status IN ('active', 'trialing') AND NEW.price_id IS NOT NULL THEN
    -- Map price IDs to subscription tiers (using the actual price IDs from stripe-config.ts)
    CASE NEW.price_id
      WHEN 'price_1ReRffQlr7BhgPjLRYQKCMwi' THEN
        tier_value := 'plus'::subscription_tier;
      WHEN 'price_1ReRgCQlr7BhgPjLzPv64mSG' THEN
        tier_value := 'pro'::subscription_tier;
      ELSE
        -- Default to free for unknown price IDs
        tier_value := 'free'::subscription_tier;
        RAISE LOG 'sync_user_subscription_tier: Unknown price_id: %, defaulting to free tier', NEW.price_id;
    END CASE;
  ELSE
    -- If subscription is not active, set to free
    tier_value := 'free'::subscription_tier;
    RAISE LOG 'sync_user_subscription_tier: Subscription not active (status: %), setting to free tier', NEW.status;
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
    WHEN 'not_started' THEN status_value := 'active'::subscription_status; -- Treat as active for new subscriptions
    ELSE 
      status_value := NULL;
      RAISE LOG 'sync_user_subscription_tier: Unknown status: %', NEW.status;
  END CASE;

  -- Only update if there's actually a change to prevent unnecessary updates
  IF tier_value != old_tier OR status_value != old_status OR 
     NEW.subscription_id IS DISTINCT FROM (SELECT stripe_subscription_id FROM user_profiles WHERE id = target_user_id) THEN
    
    -- Update the user profile with proper enum casting
    UPDATE user_profiles 
    SET 
      subscription_tier = tier_value,
      stripe_customer_id = NEW.customer_id,
      stripe_subscription_id = NEW.subscription_id,
      subscription_status = status_value,
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

    -- Check if the update was successful
    IF FOUND THEN
      RAISE LOG 'sync_user_subscription_tier: Successfully updated user profile for user: %, tier: % -> %, status: % -> %', 
        target_user_id, old_tier, tier_value, old_status, status_value;
    ELSE
      RAISE LOG 'sync_user_subscription_tier: Failed to update user profile for user: %', target_user_id;
    END IF;
  ELSE
    RAISE LOG 'sync_user_subscription_tier: No changes detected for user: %, skipping update', target_user_id;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'sync_user_subscription_tier: Error - % - %', SQLSTATE, SQLERRM;
    -- Don't fail the trigger, just log the error
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure the trigger exists (recreate if needed)
DROP TRIGGER IF EXISTS sync_subscription_tier_trigger ON stripe_subscriptions;
CREATE TRIGGER sync_subscription_tier_trigger
  AFTER INSERT OR UPDATE ON stripe_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION sync_user_subscription_tier();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION sync_user_subscription_tier() TO service_role;

-- Create a function to force sync a user's subscription (useful for webhooks)
CREATE OR REPLACE FUNCTION force_sync_user_subscription(customer_id_param text)
RETURNS TABLE(
  user_id uuid,
  old_tier subscription_tier,
  new_tier subscription_tier,
  old_status subscription_status,
  new_status subscription_status,
  success boolean
) AS $$
DECLARE
  target_user_id uuid;
  subscription_record RECORD;
  old_tier_val subscription_tier;
  old_status_val subscription_status;
  new_tier_val subscription_tier;
  new_status_val subscription_status;
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
      FOUND;
  ELSE
    RAISE EXCEPTION 'No subscription found for customer_id: %', customer_id_param;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on the force sync function
GRANT EXECUTE ON FUNCTION force_sync_user_subscription(text) TO service_role;

-- Add additional indexes for better performance
CREATE INDEX IF NOT EXISTS idx_stripe_subscriptions_customer_status_updated 
ON stripe_subscriptions(customer_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_profiles_subscription_tier 
ON user_profiles(subscription_tier);

CREATE INDEX IF NOT EXISTS idx_user_profiles_updated_at 
ON user_profiles(updated_at DESC);

-- Create a view for easy debugging of subscription sync issues
CREATE OR REPLACE VIEW subscription_sync_debug AS
SELECT 
  up.id as user_id,
  up.email,
  up.subscription_tier as profile_tier,
  up.subscription_status as profile_status,
  up.stripe_customer_id as profile_customer_id,
  up.stripe_subscription_id as profile_subscription_id,
  up.updated_at as profile_updated_at,
  sc.customer_id as stripe_customer_id,
  ss.subscription_id as stripe_subscription_id,
  ss.price_id,
  ss.status as stripe_status,
  ss.current_period_start,
  ss.current_period_end,
  ss.updated_at as subscription_updated_at,
  CASE 
    WHEN ss.status IN ('active', 'trialing') AND ss.price_id = 'price_1ReRffQlr7BhgPjLRYQKCMwi' THEN 'plus'
    WHEN ss.status IN ('active', 'trialing') AND ss.price_id = 'price_1ReRgCQlr7BhgPjLzPv64mSG' THEN 'pro'
    ELSE 'free'
  END as expected_tier,
  CASE 
    WHEN up.subscription_tier::text != CASE 
      WHEN ss.status IN ('active', 'trialing') AND ss.price_id = 'price_1ReRffQlr7BhgPjLRYQKCMwi' THEN 'plus'
      WHEN ss.status IN ('active', 'trialing') AND ss.price_id = 'price_1ReRgCQlr7BhgPjLzPv64mSG' THEN 'pro'
      ELSE 'free'
    END THEN 'MISMATCH'
    ELSE 'OK'
  END as sync_status
FROM user_profiles up
LEFT JOIN stripe_customers sc ON up.id = sc.user_id AND sc.deleted_at IS NULL
LEFT JOIN stripe_subscriptions ss ON sc.customer_id = ss.customer_id
ORDER BY up.updated_at DESC;

-- Grant access to the debug view
GRANT SELECT ON subscription_sync_debug TO service_role;
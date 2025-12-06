/*
  # Fix subscription sync infinite loop

  1. Database Functions
    - Simplify sync_user_subscription_tier function
    - Remove unnecessary complexity that causes loops
    - Add direct profile update function

  2. Performance
    - Optimize subscription sync queries
    - Add better error handling
    - Ensure immediate updates
*/

-- Drop and recreate the sync function with simplified logic
CREATE OR REPLACE FUNCTION sync_user_subscription_tier()
RETURNS TRIGGER AS $$
DECLARE
  target_user_id uuid;
  tier_value subscription_tier;
  status_value subscription_status;
BEGIN
  -- Get the user_id from the stripe_customers table
  SELECT sc.user_id INTO target_user_id
  FROM stripe_customers sc
  WHERE sc.customer_id = NEW.customer_id
  AND sc.deleted_at IS NULL;

  -- If no user found, exit
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
    RAISE LOG 'sync_user_subscription_tier: Successfully updated user profile for user: %, tier: %, status: %', 
      target_user_id, tier_value, status_value;
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

-- Recreate the trigger
DROP TRIGGER IF EXISTS sync_subscription_tier_trigger ON stripe_subscriptions;
CREATE TRIGGER sync_subscription_tier_trigger
  AFTER INSERT OR UPDATE ON stripe_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION sync_user_subscription_tier();

-- Create a function to manually update user profile (for webhook use)
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

-- Grant permissions
GRANT EXECUTE ON FUNCTION sync_user_subscription_tier() TO service_role;
GRANT EXECUTE ON FUNCTION manual_update_user_profile(uuid, subscription_tier, subscription_status, text, text, bigint, bigint) TO service_role;

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_stripe_subscriptions_customer_id_status 
ON stripe_subscriptions(customer_id, status);
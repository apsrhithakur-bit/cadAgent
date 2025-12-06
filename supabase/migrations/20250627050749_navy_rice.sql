/*
  # Fix subscription tier enum casting

  1. Database Function Updates
    - Update `sync_user_subscription_tier()` function to properly cast subscription tier values to enum type
    - Ensure proper mapping from Stripe price IDs to subscription tiers
    - Add error handling for unknown price IDs

  2. Changes Made
    - Replace the existing trigger function with proper enum casting
    - Map price IDs to correct subscription tier enum values
    - Use explicit casting with `::subscription_tier` syntax
*/

-- Drop and recreate the sync_user_subscription_tier function with proper enum casting
CREATE OR REPLACE FUNCTION sync_user_subscription_tier()
RETURNS TRIGGER AS $$
DECLARE
  target_user_id uuid;
  tier_value subscription_tier;
BEGIN
  -- Get the user_id from the stripe_customers table
  SELECT sc.user_id INTO target_user_id
  FROM stripe_customers sc
  WHERE sc.customer_id = NEW.customer_id;

  -- If no user found, exit early
  IF target_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Determine subscription tier based on price_id and status
  IF NEW.status = 'active' AND NEW.price_id IS NOT NULL THEN
    -- Map price IDs to subscription tiers
    -- You may need to adjust these price IDs based on your Stripe configuration
    CASE NEW.price_id
      WHEN 'price_1QZlJhP5qzGVlWKbYourPlusPrice' THEN
        tier_value := 'plus'::subscription_tier;
      WHEN 'price_1QZlJhP5qzGVlWKbYourProPrice' THEN
        tier_value := 'pro'::subscription_tier;
      ELSE
        -- Default to free for unknown price IDs or handle as needed
        tier_value := 'free'::subscription_tier;
    END CASE;
  ELSE
    -- If subscription is not active, set to free
    tier_value := 'free'::subscription_tier;
  END IF;

  -- Update the user profile with proper enum casting
  UPDATE user_profiles 
  SET 
    subscription_tier = tier_value,
    stripe_customer_id = NEW.customer_id,
    stripe_subscription_id = NEW.subscription_id,
    subscription_status = CASE 
      WHEN NEW.status = 'active' THEN 'active'::subscription_status
      WHEN NEW.status = 'canceled' THEN 'canceled'::subscription_status
      WHEN NEW.status = 'past_due' THEN 'past_due'::subscription_status
      WHEN NEW.status = 'incomplete' THEN 'incomplete'::subscription_status
      WHEN NEW.status = 'trialing' THEN 'trialing'::subscription_status
      ELSE NULL
    END,
    current_period_start = CASE 
      WHEN NEW.current_period_start IS NOT NULL 
      THEN to_timestamp(NEW.current_period_start)
      ELSE NULL
    END,
    current_period_end = CASE 
      WHEN NEW.current_period_end IS NOT NULL 
      THEN to_timestamp(NEW.current_period_end)
      ELSE NULL
    END,
    updated_at = now()
  WHERE id = target_user_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ensure the trigger exists (recreate if needed)
DROP TRIGGER IF EXISTS sync_subscription_tier_trigger ON stripe_subscriptions;
CREATE TRIGGER sync_subscription_tier_trigger
  AFTER INSERT OR UPDATE ON stripe_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION sync_user_subscription_tier();
/*
  # Fix Stripe subscription sync function

  1. Updates
    - Fix the sync_user_subscription_tier function to use correct price IDs
    - Ensure proper enum casting for subscription tiers and statuses
    - Add better error handling and logging

  2. Security
    - Maintains existing RLS policies
    - Ensures function runs with proper permissions
*/

-- Drop and recreate the sync_user_subscription_tier function with correct price IDs
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

  -- If no user found, log and exit
  IF target_user_id IS NULL THEN
    RAISE LOG 'No user found for customer_id: %', NEW.customer_id;
    RETURN NEW;
  END IF;

  RAISE LOG 'Syncing subscription for user: %, customer: %, status: %, price_id: %', 
    target_user_id, NEW.customer_id, NEW.status, NEW.price_id;

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
        RAISE LOG 'Unknown price_id: %, defaulting to free tier', NEW.price_id;
    END CASE;
  ELSE
    -- If subscription is not active, set to free
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
    RAISE LOG 'Successfully updated user profile for user: %, new tier: %', target_user_id, tier_value;
  ELSE
    RAISE LOG 'Failed to update user profile for user: %', target_user_id;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'Error in sync_user_subscription_tier: % - %', SQLSTATE, SQLERRM;
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

-- Also ensure the stripe_customers table has proper foreign key constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'stripe_customers_user_id_fkey' 
    AND table_name = 'stripe_customers'
  ) THEN
    ALTER TABLE stripe_customers 
    ADD CONSTRAINT stripe_customers_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Ensure stripe_subscriptions has proper foreign key constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'stripe_subscriptions_customer_id_fkey' 
    AND table_name = 'stripe_subscriptions'
  ) THEN
    ALTER TABLE stripe_subscriptions 
    ADD CONSTRAINT stripe_subscriptions_customer_id_fkey 
    FOREIGN KEY (customer_id) REFERENCES stripe_customers(customer_id) ON DELETE CASCADE;
  END IF;
END $$;
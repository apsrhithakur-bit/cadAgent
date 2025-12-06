/*
  # Update user profiles with Stripe subscription sync

  1. New Function
    - `sync_user_subscription_tier`: Updates user profile subscription tier based on Stripe data
    - Triggered when stripe_subscriptions table is updated
    - Maps Stripe price IDs to subscription tiers

  2. Trigger
    - Automatically updates user_profiles when subscription status changes
    - Ensures data consistency between Stripe and user profiles

  3. Price ID Mapping
    - Maps specific Stripe price IDs to subscription tiers
    - Handles subscription status changes (active, canceled, etc.)
*/

-- Function to sync user subscription tier based on Stripe data
CREATE OR REPLACE FUNCTION sync_user_subscription_tier()
RETURNS TRIGGER AS $$
DECLARE
    user_uuid uuid;
    new_tier text := 'free';
BEGIN
    -- Get the user_id from stripe_customers table
    SELECT user_id INTO user_uuid
    FROM stripe_customers
    WHERE customer_id = NEW.customer_id
    AND deleted_at IS NULL;

    -- If no user found, exit
    IF user_uuid IS NULL THEN
        RETURN NEW;
    END IF;

    -- Determine subscription tier based on price_id and status
    IF NEW.status = 'active' AND NEW.price_id IS NOT NULL THEN
        CASE NEW.price_id
            WHEN 'price_1ReRffQlr7BhgPjLRYQKCMwi' THEN
                new_tier := 'plus';
            WHEN 'price_1ReRgCQlr7BhgPjLzPv64mSG' THEN
                new_tier := 'pro';
            ELSE
                new_tier := 'free';
        END CASE;
    ELSE
        -- If subscription is not active, set to free
        new_tier := 'free';
    END IF;

    -- Update user profile
    UPDATE user_profiles
    SET 
        subscription_tier = new_tier,
        stripe_subscription_id = NEW.subscription_id,
        subscription_status = NEW.status::text,
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
        updated_at = NOW()
    WHERE id = user_uuid;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to sync subscription tier when stripe_subscriptions is updated
DROP TRIGGER IF EXISTS sync_subscription_tier_trigger ON stripe_subscriptions;

CREATE TRIGGER sync_subscription_tier_trigger
    AFTER INSERT OR UPDATE ON stripe_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION sync_user_subscription_tier();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION sync_user_subscription_tier() TO service_role;
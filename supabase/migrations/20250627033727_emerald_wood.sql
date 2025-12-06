/*
  # Complete Supabase Authentication Setup

  1. Database Schema
    - user_profiles table with subscription management
    - usage_tracking for monitoring user limits
    - design_sessions and refine_chats for app functionality
    - Stripe integration tables

  2. Authentication Functions
    - handle_new_user(): Auto-creates profiles on signup
    - sync_user_subscription_tier(): Updates subscription from Stripe
    - handle_updated_at(): Manages timestamps

  3. Security
    - Row Level Security on all tables
    - Comprehensive policies for data access
    - Service role permissions for backend operations

  4. Performance
    - Indexes on frequently queried columns
    - Foreign key constraints for data integrity
*/

-- Create custom types
DO $$ BEGIN
    CREATE TYPE subscription_tier AS ENUM ('free', 'plus', 'pro');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE subscription_status AS ENUM ('active', 'canceled', 'past_due', 'incomplete', 'trialing');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create user_profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email text UNIQUE NOT NULL,
    subscription_tier subscription_tier DEFAULT 'free' NOT NULL,
    stripe_customer_id text,
    stripe_subscription_id text,
    subscription_status subscription_status,
    current_period_start timestamptz,
    current_period_end timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- Create usage_tracking table
CREATE TABLE IF NOT EXISTS usage_tracking (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    designs_used integer DEFAULT 0,
    refine_chats_used integer DEFAULT 0,
    period_start timestamptz NOT NULL,
    period_end timestamptz NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- Create design_sessions table
CREATE TABLE IF NOT EXISTS design_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    design_data jsonb DEFAULT '{}' NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- Create refine_chats table
CREATE TABLE IF NOT EXISTS refine_chats (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    design_session_id uuid REFERENCES design_sessions(id) ON DELETE SET NULL,
    message text NOT NULL,
    response text,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- Create Stripe-related tables
CREATE TABLE IF NOT EXISTS stripe_customers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    customer_id text UNIQUE NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS stripe_subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id text REFERENCES stripe_customers(customer_id) ON DELETE CASCADE NOT NULL,
    subscription_id text UNIQUE,
    price_id text,
    status text NOT NULL DEFAULT 'not_started',
    current_period_start bigint,
    current_period_end bigint,
    cancel_at_period_end boolean DEFAULT false,
    payment_method_brand text,
    payment_method_last4 text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS stripe_orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id text REFERENCES stripe_customers(customer_id) ON DELETE CASCADE NOT NULL,
    checkout_session_id text UNIQUE NOT NULL,
    payment_intent_id text,
    amount_subtotal bigint,
    amount_total bigint,
    currency text,
    payment_status text,
    status text DEFAULT 'pending',
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- Enable Row Level Security on all tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE design_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE refine_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_orders ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to recreate them
DROP POLICY IF EXISTS "Users can read own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;
DROP POLICY IF EXISTS "Service role can manage all profiles" ON user_profiles;

DROP POLICY IF EXISTS "Users can read own usage" ON usage_tracking;
DROP POLICY IF EXISTS "Users can update own usage" ON usage_tracking;
DROP POLICY IF EXISTS "Users can insert own usage" ON usage_tracking;
DROP POLICY IF EXISTS "Service role can manage all usage" ON usage_tracking;

DROP POLICY IF EXISTS "Users can read own design sessions" ON design_sessions;
DROP POLICY IF EXISTS "Users can insert own design sessions" ON design_sessions;
DROP POLICY IF EXISTS "Users can update own design sessions" ON design_sessions;
DROP POLICY IF EXISTS "Users can delete own design sessions" ON design_sessions;

DROP POLICY IF EXISTS "Users can read own refine chats" ON refine_chats;
DROP POLICY IF EXISTS "Users can insert own refine chats" ON refine_chats;
DROP POLICY IF EXISTS "Users can update own refine chats" ON refine_chats;
DROP POLICY IF EXISTS "Users can delete own refine chats" ON refine_chats;

DROP POLICY IF EXISTS "Users can read own stripe data" ON stripe_customers;
DROP POLICY IF EXISTS "Service role can manage stripe customers" ON stripe_customers;
DROP POLICY IF EXISTS "Service role can manage stripe subscriptions" ON stripe_subscriptions;
DROP POLICY IF EXISTS "Service role can manage stripe orders" ON stripe_orders;

-- Create RLS policies for user_profiles
CREATE POLICY "Users can read own profile"
    ON user_profiles
    FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON user_profiles
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
    ON user_profiles
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Service role can manage all profiles"
    ON user_profiles
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Create RLS policies for usage_tracking
CREATE POLICY "Users can read own usage"
    ON usage_tracking
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own usage"
    ON usage_tracking
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own usage"
    ON usage_tracking
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can manage all usage"
    ON usage_tracking
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Create RLS policies for design_sessions
CREATE POLICY "Users can read own design sessions"
    ON design_sessions
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own design sessions"
    ON design_sessions
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own design sessions"
    ON design_sessions
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own design sessions"
    ON design_sessions
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- Create RLS policies for refine_chats
CREATE POLICY "Users can read own refine chats"
    ON refine_chats
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own refine chats"
    ON refine_chats
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own refine chats"
    ON refine_chats
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own refine chats"
    ON refine_chats
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- Create RLS policies for Stripe tables
CREATE POLICY "Users can read own stripe data"
    ON stripe_customers
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage stripe customers"
    ON stripe_customers
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role can manage stripe subscriptions"
    ON stripe_subscriptions
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role can manage stripe orders"
    ON stripe_orders
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Create function to handle updated_at timestamps
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create function to automatically create user profile and usage tracking on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    profile_exists BOOLEAN;
BEGIN
    -- Check if profile already exists
    SELECT EXISTS(SELECT 1 FROM public.user_profiles WHERE id = NEW.id) INTO profile_exists;
    
    -- Only create profile if it doesn't exist
    IF NOT profile_exists THEN
        -- Create user profile
        INSERT INTO public.user_profiles (
            id, 
            email, 
            subscription_tier, 
            subscription_status,
            created_at,
            updated_at
        )
        VALUES (
            NEW.id,
            COALESCE(NEW.email, ''),
            'free',
            'active',
            NOW(),
            NOW()
        );
        
        -- Create initial usage tracking record for current month
        INSERT INTO public.usage_tracking (
            user_id,
            designs_used,
            refine_chats_used,
            period_start,
            period_end,
            created_at,
            updated_at
        )
        VALUES (
            NEW.id,
            0,
            0,
            DATE_TRUNC('month', NOW()),
            (DATE_TRUNC('month', NOW()) + INTERVAL '1 month' - INTERVAL '1 day'),
            NOW(),
            NOW()
        );
    END IF;
    
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Log the error but don't fail the user creation
        RAISE LOG 'Error in handle_new_user for user %: % - %', NEW.id, SQLSTATE, SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to sync subscription data from Stripe
CREATE OR REPLACE FUNCTION sync_user_subscription_tier()
RETURNS TRIGGER AS $$
DECLARE
    tier_name TEXT;
    user_id_var UUID;
BEGIN
    -- Determine subscription tier based on price_id
    CASE NEW.price_id
        WHEN 'price_1ReRgCQlr7BhgPjLzPv64mSG' THEN tier_name := 'pro';
        WHEN 'price_1ReRffQlr7BhgPjLRYQKCMwi' THEN tier_name := 'plus';
        ELSE tier_name := 'free';
    END CASE;

    -- Get user_id from stripe_customers table
    SELECT sc.user_id INTO user_id_var
    FROM public.stripe_customers sc 
    WHERE sc.customer_id = NEW.customer_id 
    AND sc.deleted_at IS NULL;

    -- Update user profile with subscription info
    IF user_id_var IS NOT NULL THEN
        UPDATE public.user_profiles 
        SET 
            subscription_tier = tier_name,
            subscription_status = CASE 
                WHEN NEW.status IN ('active', 'trialing') THEN 'active'::subscription_status
                WHEN NEW.status = 'canceled' THEN 'canceled'::subscription_status
                WHEN NEW.status = 'past_due' THEN 'past_due'::subscription_status
                WHEN NEW.status = 'incomplete' THEN 'incomplete'::subscription_status
                ELSE 'active'::subscription_status
            END,
            stripe_subscription_id = NEW.subscription_id,
            current_period_start = CASE 
                WHEN NEW.current_period_start IS NOT NULL THEN TO_TIMESTAMP(NEW.current_period_start)
                ELSE NULL
            END,
            current_period_end = CASE 
                WHEN NEW.current_period_end IS NOT NULL THEN TO_TIMESTAMP(NEW.current_period_end)
                ELSE NULL
            END,
            updated_at = NOW()
        WHERE id = user_id_var;
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE LOG 'Error in sync_user_subscription_tier: % - %', SQLSTATE, SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing triggers to recreate them safely
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS sync_subscription_tier_trigger ON public.stripe_subscriptions;
DROP TRIGGER IF EXISTS handle_user_profiles_updated_at ON user_profiles;
DROP TRIGGER IF EXISTS handle_usage_tracking_updated_at ON usage_tracking;
DROP TRIGGER IF EXISTS handle_stripe_customers_updated_at ON stripe_customers;
DROP TRIGGER IF EXISTS handle_stripe_subscriptions_updated_at ON stripe_subscriptions;
DROP TRIGGER IF EXISTS handle_stripe_orders_updated_at ON stripe_orders;

-- Create triggers
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW 
    EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER sync_subscription_tier_trigger
    AFTER INSERT OR UPDATE ON public.stripe_subscriptions
    FOR EACH ROW 
    EXECUTE FUNCTION public.sync_user_subscription_tier();

-- Create triggers for updated_at
CREATE TRIGGER handle_user_profiles_updated_at
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER handle_usage_tracking_updated_at
    BEFORE UPDATE ON usage_tracking
    FOR EACH ROW
    EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER handle_stripe_customers_updated_at
    BEFORE UPDATE ON stripe_customers
    FOR EACH ROW
    EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER handle_stripe_subscriptions_updated_at
    BEFORE UPDATE ON stripe_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER handle_stripe_orders_updated_at
    BEFORE UPDATE ON stripe_orders
    FOR EACH ROW
    EXECUTE FUNCTION handle_updated_at();

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_id ON user_profiles(id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_usage_tracking_user_id ON usage_tracking(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_tracking_period ON usage_tracking(user_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_design_sessions_user_id ON design_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_refine_chats_user_id ON refine_chats(user_id);
CREATE INDEX IF NOT EXISTS idx_refine_chats_session_id ON refine_chats(design_session_id);
CREATE INDEX IF NOT EXISTS idx_stripe_customers_user_id ON stripe_customers(user_id);
CREATE INDEX IF NOT EXISTS idx_stripe_customers_customer_id ON stripe_customers(customer_id);
CREATE INDEX IF NOT EXISTS idx_stripe_subscriptions_customer_id ON stripe_subscriptions(customer_id);

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT ALL ON public.user_profiles TO authenticated, service_role;
GRANT ALL ON public.usage_tracking TO authenticated, service_role;
GRANT ALL ON public.design_sessions TO authenticated, service_role;
GRANT ALL ON public.refine_chats TO authenticated, service_role;
GRANT SELECT ON public.stripe_customers TO authenticated;
GRANT SELECT ON public.stripe_subscriptions TO authenticated;
GRANT SELECT ON public.stripe_orders TO authenticated;
GRANT ALL ON public.stripe_customers TO service_role;
GRANT ALL ON public.stripe_subscriptions TO service_role;
GRANT ALL ON public.stripe_orders TO service_role;

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_user_subscription_tier() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_updated_at() TO authenticated, service_role;

-- Grant sequence permissions
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- Fix any existing users that might not have profiles
DO $$
DECLARE
    user_record RECORD;
BEGIN
    FOR user_record IN 
        SELECT au.id, au.email 
        FROM auth.users au 
        LEFT JOIN public.user_profiles up ON au.id = up.id 
        WHERE up.id IS NULL
    LOOP
        -- Create missing user profile
        INSERT INTO public.user_profiles (
            id, 
            email, 
            subscription_tier, 
            subscription_status,
            created_at,
            updated_at
        )
        VALUES (
            user_record.id,
            COALESCE(user_record.email, ''),
            'free',
            'active',
            NOW(),
            NOW()
        );
        
        -- Create usage tracking for existing user
        INSERT INTO public.usage_tracking (
            user_id,
            designs_used,
            refine_chats_used,
            period_start,
            period_end,
            created_at,
            updated_at
        )
        VALUES (
            user_record.id,
            0,
            0,
            DATE_TRUNC('month', NOW()),
            (DATE_TRUNC('month', NOW()) + INTERVAL '1 month' - INTERVAL '1 day'),
            NOW(),
            NOW()
        );
    END LOOP;
END $$;
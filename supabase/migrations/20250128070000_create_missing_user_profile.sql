-- Create missing user profile for abhirooprt03@gmail.com
-- This user had a successful payment but no profile was created

-- Insert the user profile directly (bypassing RLS for this specific case)
insert into public.user_profiles (
  id,
  email,
  subscription_tier,
  subscription_status,
  stripe_customer_id,
  stripe_subscription_id,
  created_at,
  updated_at
) values (
  '459db84f-4fac-49cc-8682-b54e09010381',
  'abhirooprt03@gmail.com',
  'plus',
  'active',
  'cus_SZdmgxvxjaAPY5',
  'sub_1ResY9Qlr7BhgPjLIQc3JlFo',
  now(),
  now()
) on conflict (id) do update set
  subscription_tier = excluded.subscription_tier,
  subscription_status = excluded.subscription_status,
  stripe_customer_id = excluded.stripe_customer_id,
  stripe_subscription_id = excluded.stripe_subscription_id,
  updated_at = now();

-- Also ensure we have the stripe customer record
insert into public.stripe_customers (
  customer_id,
  user_id,
  email,
  created_at,
  updated_at
) values (
  'cus_SZdmgxvxjaAPY5',
  '459db84f-4fac-49cc-8682-b54e09010381',
  'abhirooprt03@gmail.com',
  now(),
  now()
) on conflict (customer_id) do update set
  user_id = excluded.user_id,
  email = excluded.email,
  updated_at = now();

-- And the subscription record
insert into public.stripe_subscriptions (
  customer_id,
  subscription_id,
  price_id,
  status,
  current_period_start,
  current_period_end,
  cancel_at_period_end,
  created_at,
  updated_at
) values (
  'cus_SZdmgxvxjaAPY5',
  'sub_1ResY9Qlr7BhgPjLIQc3JlFo',
  'price_1ReRffQlr7BhgPjLRYQKCMwi',
  'active',
  1751093265,
  1753685265,
  false,
  now(),
  now()
) on conflict (customer_id) do update set
  subscription_id = excluded.subscription_id,
  price_id = excluded.price_id,
  status = excluded.status,
  current_period_start = excluded.current_period_start,
  current_period_end = excluded.current_period_end,
  cancel_at_period_end = excluded.cancel_at_period_end,
  updated_at = now(); 
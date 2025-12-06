-- Add trigger to ensure profile updates are properly broadcasted
-- This helps with real-time subscription updates when profiles change

-- Create or replace a function to handle profile updates
create or replace function handle_profile_update()
returns trigger as $$
begin
  -- Ensure updated_at is always set to current timestamp
  new.updated_at = now();
  
  -- Log the update for debugging
  raise log 'Profile updated for user % - tier: % -> %, status: % -> %', 
    new.id, 
    coalesce(old.subscription_tier::text, 'NULL'), 
    new.subscription_tier::text,
    coalesce(old.subscription_status::text, 'NULL'), 
    new.subscription_status::text;
  
  return new;
end;
$$ language plpgsql security definer;

-- Create trigger that fires before profile updates
drop trigger if exists trigger_handle_profile_update on user_profiles;
create trigger trigger_handle_profile_update
  before update on user_profiles
  for each row
  execute function handle_profile_update();

-- Add index on updated_at for better performance on profile queries
create index if not exists idx_user_profiles_updated_at on user_profiles(updated_at desc);

-- Add index on subscription status for filtering
create index if not exists idx_user_profiles_subscription_status on user_profiles(subscription_status) where subscription_status is not null;

-- Add composite index for efficient tier and status queries
create index if not exists idx_user_profiles_tier_status on user_profiles(subscription_tier, subscription_status);

-- Ensure RLS is properly configured for real-time
alter table user_profiles enable row level security;

-- Update RLS policies to ensure authenticated users can see profile updates
drop policy if exists "Users can view their own profile" on user_profiles;
create policy "Users can view their own profile" on user_profiles
  for select using (auth.uid() = id);

drop policy if exists "Users can update their own profile" on user_profiles;  
create policy "Users can update their own profile" on user_profiles
  for update using (auth.uid() = id);

-- Grant necessary permissions for the trigger function
grant execute on function handle_profile_update() to authenticated;
grant execute on function handle_profile_update() to service_role; 
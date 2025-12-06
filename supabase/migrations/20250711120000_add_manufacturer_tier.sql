-- Add manufacturer tier support and usage tracking
-- This migration adds support for the premium manufacturer access feature

-- Add manufacturer_access column to user_profiles table
alter table if exists user_profiles
add column if not exists manufacturer_access boolean default false;

-- Update subscription_tier enum to include manufacturer tier
-- First check if the enum value already exists
do $$ 
begin
  if not exists (select 1 from pg_enum where enumlabel = 'manufacturer' and enumtypid = (select oid from pg_type where typname = 'subscription_tier')) then
    alter type subscription_tier add value 'manufacturer';
  end if;
exception when others then
  -- If subscription_tier enum doesn't exist, create it
  create type subscription_tier as enum ('free', 'plus', 'pro', 'manufacturer');
end $$;

-- Create manufacturer_usage table for tracking searches and quotes
create table if not exists manufacturer_usage (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  searches_used integer default 0 not null,
  quotes_sent integer default 0 not null,
  month_year text not null, -- 'YYYY-MM' format
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  
  -- Ensure one record per user per month
  unique(user_id, month_year)
);

-- Create indexes for manufacturer_usage table
create index if not exists idx_manufacturer_usage_user_id on manufacturer_usage(user_id);
create index if not exists idx_manufacturer_usage_month_year on manufacturer_usage(month_year);
create index if not exists idx_manufacturer_usage_user_month on manufacturer_usage(user_id, month_year);

-- Create trigger to update updated_at timestamp
create or replace function update_manufacturer_usage_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists trigger_manufacturer_usage_updated_at on manufacturer_usage;
create trigger trigger_manufacturer_usage_updated_at
  before update on manufacturer_usage
  for each row
  execute function update_manufacturer_usage_updated_at();

-- Enable Row Level Security for manufacturer_usage
alter table manufacturer_usage enable row level security;

-- RLS policies for manufacturer_usage
create policy "Users can view their own manufacturer usage" on manufacturer_usage
  for select using (auth.uid() = user_id);

create policy "Users can insert their own manufacturer usage" on manufacturer_usage
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own manufacturer usage" on manufacturer_usage
  for update using (auth.uid() = user_id);

-- Create function to increment manufacturer usage
create or replace function increment_manufacturer_usage(
  user_id uuid,
  month_year text,
  search_increment integer default 0,
  quote_increment integer default 0
)
returns void as $$
begin
  insert into manufacturer_usage (user_id, month_year, searches_used, quotes_sent)
  values (user_id, month_year, search_increment, quote_increment)
  on conflict (user_id, month_year)
  do update set
    searches_used = manufacturer_usage.searches_used + search_increment,
    quotes_sent = manufacturer_usage.quotes_sent + quote_increment,
    updated_at = timezone('utc'::text, now());
end;
$$ language plpgsql security definer;

-- Create function to check manufacturer access
create or replace function has_manufacturer_access(user_id uuid)
returns boolean as $$
declare
  profile_record record;
begin
  select 
    subscription_tier,
    manufacturer_access,
    subscription_status
  into profile_record
  from user_profiles
  where id = user_id;
  
  if not found then
    return false;
  end if;
  
  -- Allow access if explicitly granted or if on manufacturer tier
  return profile_record.manufacturer_access = true 
    or profile_record.subscription_tier = 'manufacturer'
    or (profile_record.subscription_tier = 'manufacturer' and profile_record.subscription_status = 'active');
end;
$$ language plpgsql security definer;

-- Create function to get manufacturer usage stats
create or replace function get_manufacturer_usage_stats(
  target_user_id uuid,
  target_month_year text default null
)
returns table (
  searches_used integer,
  quotes_sent integer,
  month_year text,
  has_access boolean
) as $$
declare
  current_month_year text;
begin
  if target_month_year is null then
    current_month_year := to_char(now(), 'YYYY-MM');
  else
    current_month_year := target_month_year;
  end if;
  
  return query
  select 
    coalesce(mu.searches_used, 0) as searches_used,
    coalesce(mu.quotes_sent, 0) as quotes_sent,
    current_month_year as month_year,
    has_manufacturer_access(target_user_id) as has_access
  from (
    select current_month_year as month_year
  ) m
  left join manufacturer_usage mu on mu.user_id = target_user_id and mu.month_year = current_month_year;
end;
$$ language plpgsql security definer;

-- Grant permissions
grant usage on schema public to authenticated;
grant select, insert, update on manufacturer_usage to authenticated;
grant execute on function increment_manufacturer_usage(uuid, text, integer, integer) to authenticated;
grant execute on function has_manufacturer_access(uuid) to authenticated;
grant execute on function get_manufacturer_usage_stats(uuid, text) to authenticated;

-- Add helpful comments
comment on table manufacturer_usage is 'Tracks manufacturer search and quote usage per user per month';
comment on column manufacturer_usage.searches_used is 'Number of manufacturer searches performed in this month';
comment on column manufacturer_usage.quotes_sent is 'Number of quotes sent to manufacturers in this month';
comment on column manufacturer_usage.month_year is 'Month and year in YYYY-MM format';

comment on function increment_manufacturer_usage(uuid, text, integer, integer) is 'Safely increment manufacturer usage counters for a user';
comment on function has_manufacturer_access(uuid) is 'Check if a user has access to manufacturer features';
comment on function get_manufacturer_usage_stats(uuid, text) is 'Get manufacturer usage statistics for a user';

-- Update existing profiles to have proper manufacturer access based on subscription tier
-- Note: Cannot use new enum value 'manufacturer' in same transaction, so we'll set defaults first
update user_profiles 
set manufacturer_access = false 
where manufacturer_access is null;

-- Add constraint to ensure manufacturer_access is not null
alter table user_profiles 
alter column manufacturer_access set default false,
alter column manufacturer_access set not null; 
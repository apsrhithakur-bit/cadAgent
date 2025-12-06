-- Fix ambiguous column reference in increment_manufacturer_usage function
-- Drop and recreate function with fixed parameter naming to avoid conflicts

drop function if exists increment_manufacturer_usage(uuid, text, integer, integer);

create or replace function increment_manufacturer_usage(
  p_user_id uuid,
  p_month_year text,
  p_search_increment integer default 0,
  p_quote_increment integer default 0
)
returns void as $$
begin
  insert into manufacturer_usage (user_id, month_year, searches_used, quotes_sent)
  values (p_user_id, p_month_year, p_search_increment, p_quote_increment)
  on conflict (user_id, month_year)
  do update set
    searches_used = manufacturer_usage.searches_used + p_search_increment,
    quotes_sent = manufacturer_usage.quotes_sent + p_quote_increment,
    updated_at = timezone('utc'::text, now());
end;
$$ language plpgsql security definer;

-- Grant execute permission
grant execute on function increment_manufacturer_usage(uuid, text, integer, integer) to authenticated;

-- Add helpful comment
comment on function increment_manufacturer_usage(uuid, text, integer, integer) is 'Safely increment manufacturer usage counters for a user with fixed parameter names'; 
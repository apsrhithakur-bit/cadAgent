-- migration: create cache entries table for ai response caching
-- description: creates table to store cached ai responses, image analysis, and voice synthesis data
-- with automatic cleanup of expired entries

-- create cache entries table
create table if not exists public.cache_entries (
  id uuid default gen_random_uuid() primary key,
  key text not null unique,
  data jsonb not null,
  timestamp timestamptz not null default now(),
  expires_at timestamptz not null,
  type text not null check (type in ('ai_response', 'model_data', 'voice_synthesis', 'image_analysis')),
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- create indexes for efficient querying
create index if not exists idx_cache_entries_key on public.cache_entries(key);
create index if not exists idx_cache_entries_user_id on public.cache_entries(user_id);
create index if not exists idx_cache_entries_type on public.cache_entries(type);
create index if not exists idx_cache_entries_expires_at on public.cache_entries(expires_at);
create index if not exists idx_cache_entries_timestamp on public.cache_entries(timestamp);

-- create composite index for user-specific cache lookups
create index if not exists idx_cache_entries_user_type on public.cache_entries(user_id, type);

-- add updated_at trigger
create or replace function update_cache_entries_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- create trigger to automatically update updated_at column
drop trigger if exists trigger_cache_entries_updated_at on public.cache_entries;
create trigger trigger_cache_entries_updated_at
  before update on public.cache_entries
  for each row
  execute function update_cache_entries_updated_at();

-- function to automatically clean up expired cache entries
create or replace function cleanup_expired_cache_entries()
returns void as $$
begin
  -- delete entries that have expired
  delete from public.cache_entries 
  where expires_at < now();
  
  -- log cleanup activity
  raise notice 'cleaned up expired cache entries at %', now();
end;
$$ language plpgsql;

-- create function to get cache statistics
create or replace function get_cache_stats(target_user_id uuid default null)
returns table (
  total_entries bigint,
  ai_response_entries bigint,
  image_analysis_entries bigint,
  voice_synthesis_entries bigint,
  model_data_entries bigint,
  total_size_mb numeric,
  oldest_entry timestamptz,
  newest_entry timestamptz,
  expired_entries bigint
) as $$
begin
  return query
  select 
    count(*) as total_entries,
    count(*) filter (where type = 'ai_response') as ai_response_entries,
    count(*) filter (where type = 'image_analysis') as image_analysis_entries,
    count(*) filter (where type = 'voice_synthesis') as voice_synthesis_entries,
    count(*) filter (where type = 'model_data') as model_data_entries,
    round((pg_total_relation_size('public.cache_entries') / 1024.0 / 1024.0)::numeric, 2) as total_size_mb,
    min(timestamp) as oldest_entry,
    max(timestamp) as newest_entry,
    count(*) filter (where expires_at < now()) as expired_entries
  from public.cache_entries
  where (target_user_id is null or user_id = target_user_id);
end;
$$ language plpgsql;

-- enable row level security
alter table public.cache_entries enable row level security;

-- create rls policies for cache entries

-- policy: users can insert their own cache entries
create policy "users can insert their own cache entries"
on public.cache_entries
for insert
to authenticated
with check (auth.uid() = user_id);

-- policy: users can select their own cache entries
create policy "users can select their own cache entries"  
on public.cache_entries
for select
to authenticated
using (auth.uid() = user_id);

-- policy: users can update their own cache entries
create policy "users can update their own cache entries"
on public.cache_entries  
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- policy: users can delete their own cache entries
create policy "users can delete their own cache entries"
on public.cache_entries
for delete  
to authenticated
using (auth.uid() = user_id);

-- policy: allow anonymous users to access public cache entries (for demo purposes)
create policy "anonymous users can access public cache entries"
on public.cache_entries
for select
to anon
using (user_id is null);

-- add table comment
comment on table public.cache_entries is 'stores cached ai responses, image analysis, and voice synthesis data for improved performance and offline functionality';

-- add column comments
comment on column public.cache_entries.key is 'unique cache key generated from input parameters';
comment on column public.cache_entries.data is 'cached response data in json format';
comment on column public.cache_entries.type is 'type of cached data: ai_response, model_data, voice_synthesis, or image_analysis';
comment on column public.cache_entries.expires_at is 'when this cache entry expires and should be cleaned up';
comment on column public.cache_entries.user_id is 'user who owns this cache entry, null for public entries';

-- create a scheduled job to clean up expired entries (requires pg_cron extension)
-- note: this will only work if pg_cron is enabled in the supabase project
-- select cron.schedule('cleanup-expired-cache', '0 2 * * *', 'select cleanup_expired_cache_entries();');

-- create helper function for cache size management per user
create or replace function manage_user_cache_size(target_user_id uuid, max_entries integer default 1000)
returns void as $$
begin
  -- if user has more than max_entries, delete oldest ones
  with user_cache_count as (
    select count(*) as total_count
    from public.cache_entries 
    where user_id = target_user_id
  ),
  entries_to_delete as (
    select id
    from public.cache_entries
    where user_id = target_user_id
    order by timestamp asc
    limit greatest(0, (select total_count from user_cache_count) - max_entries)
  )
  delete from public.cache_entries
  where id in (select id from entries_to_delete);
  
  raise notice 'managed cache size for user %, max entries: %', target_user_id, max_entries;
end;
$$ language plpgsql;

-- create function to clear user cache by type
create or replace function clear_user_cache(
  target_user_id uuid, 
  cache_type text default null
)
returns integer as $$
declare
  deleted_count integer;
begin
  if cache_type is null then
    -- clear all cache for user
    delete from public.cache_entries 
    where user_id = target_user_id;
  else
    -- clear specific type of cache for user
    delete from public.cache_entries 
    where user_id = target_user_id and type = cache_type;
  end if;
  
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$ language plpgsql; 
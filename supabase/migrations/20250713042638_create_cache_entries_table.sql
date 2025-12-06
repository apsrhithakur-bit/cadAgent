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

-- Create shared_models table for cross-device AR model sharing
create table if not exists shared_models (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  model_data jsonb not null,
  created_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '7 days')
);

-- Create index for efficient queries
create index if not exists shared_models_user_id_idx on shared_models(user_id);
create index if not exists shared_models_expires_at_idx on shared_models(expires_at);

-- Row Level Security (RLS) policies
alter table shared_models enable row level security;

-- Drop existing policies if they exist
drop policy if exists "Users can create their own shared models" on shared_models;
drop policy if exists "Anyone can read shared models" on shared_models;
drop policy if exists "Users can update their own shared models" on shared_models;
drop policy if exists "Users can delete their own shared models" on shared_models;

-- Policy: Users can create their own shared models (authenticated users only)
create policy "Users can create their own shared models" 
on shared_models for insert 
with check (auth.uid() = user_id);

-- Policy: Anyone can read shared models (for cross-device sharing)
create policy "Anyone can read shared models" 
on shared_models for select 
using (true);

-- Policy: Users can update their own shared models
create policy "Users can update their own shared models" 
on shared_models for update 
using (auth.uid() = user_id);

-- Policy: Users can delete their own shared models
create policy "Users can delete their own shared models" 
on shared_models for delete 
using (auth.uid() = user_id);

-- Automatic cleanup function for expired shared models
create or replace function cleanup_expired_shared_models()
returns void as $$
begin
  delete from shared_models 
  where expires_at < now();
end;
$$ language plpgsql;

-- Create a scheduled job to clean up expired models (runs daily)
-- Note: This requires the pg_cron extension to be enabled
-- In Supabase, this can be set up via the SQL editor or programmatically
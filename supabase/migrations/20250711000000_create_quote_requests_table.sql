-- Create quote_requests table for manufacturer quote management
-- This table stores quote requests from users to manufacturers

create table if not exists quote_requests (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  manufacturer_id text not null,
  manufacturer_name text not null,
  manufacturer_contact jsonb,
  design_id text,
  design_name text,
  project_details jsonb not null,
  contact_info jsonb not null,
  status text not null default 'pending' 
    check (status in ('pending', 'sent', 'responded', 'accepted', 'declined')),
  quote_response jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create indexes for better query performance
create index if not exists idx_quote_requests_user_id on quote_requests(user_id);
create index if not exists idx_quote_requests_status on quote_requests(status);
create index if not exists idx_quote_requests_created_at on quote_requests(created_at desc);
create index if not exists idx_quote_requests_manufacturer_id on quote_requests(manufacturer_id);

-- Create trigger to update updated_at timestamp
create or replace function update_quote_requests_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

create trigger trigger_update_quote_requests_updated_at
  before update on quote_requests
  for each row
  execute function update_quote_requests_updated_at();

-- Row Level Security (RLS) policies
alter table quote_requests enable row level security;

-- Users can only view their own quote requests
create policy "Users can view their own quote requests" on quote_requests
  for select using (auth.uid() = user_id);

-- Users can only insert their own quote requests
create policy "Users can insert their own quote requests" on quote_requests
  for insert with check (auth.uid() = user_id);

-- Users can only update their own quote requests
create policy "Users can update their own quote requests" on quote_requests
  for update using (auth.uid() = user_id);

-- Users can only delete their own quote requests
create policy "Users can delete their own quote requests" on quote_requests
  for delete using (auth.uid() = user_id);

-- Grant necessary permissions
grant select, insert, update, delete on quote_requests to authenticated;
grant usage on schema public to authenticated;

-- Add helpful comments
comment on table quote_requests is 'Stores quote requests from users to manufacturers';
comment on column quote_requests.manufacturer_id is 'External manufacturer ID from search results';
comment on column quote_requests.manufacturer_contact is 'Contact information for the manufacturer (website, phone, email)';
comment on column quote_requests.project_details is 'Details about the project (materials, method, quantity, complexity, timeline)';
comment on column quote_requests.contact_info is 'User contact information for the quote (email, phone, company)';
comment on column quote_requests.quote_response is 'Response from manufacturer (price, lead time, terms)';
comment on column quote_requests.status is 'Status of the quote request (pending, sent, responded, accepted, declined)';
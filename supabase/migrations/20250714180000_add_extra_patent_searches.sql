alter table public.user_profiles
add column extra_patent_searches integer not null default 0;

comment on column public.user_profiles.extra_patent_searches is 'Number of extra patent searches purchased by the user.'; 
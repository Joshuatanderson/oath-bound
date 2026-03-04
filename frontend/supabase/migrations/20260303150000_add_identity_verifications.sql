-- Identity verification table (Persona integration)
-- Keyed on auth.users(id) since verification happens before username setup.

create table public.identity_verifications (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  persona_inquiry_id text not null,
  status text not null check (status in ('pending', 'approved', 'declined', 'expired')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- RLS
alter table public.identity_verifications enable row level security;

-- Authenticated users can read their own row
create policy "Users can read own verification"
  on public.identity_verifications for select
  to authenticated
  using (auth_user_id = auth.uid());

-- Only service role can insert/update (API routes use service role client)
-- No insert/update policies for authenticated role = effectively service-role only writes

-- Restructure identity_verifications to reference public.users(id) instead of auth.users(id).
-- Application FKs should always go through public.users; auth.users is only for auth.

-- Step 1: Drop old constraints first (so we can update the data)
alter table public.identity_verifications
  drop constraint identity_verifications_auth_user_id_fkey,
  drop constraint identity_verifications_auth_user_id_key;

-- Step 2: Migrate existing data from auth user IDs to public user IDs
update public.identity_verifications iv
  set auth_user_id = u.id
  from public.users u
  where u.user_id = iv.auth_user_id;

-- Step 3: Rename column
alter table public.identity_verifications
  rename column auth_user_id to user_id;

-- Step 4: Add new FK + unique constraint referencing public.users
alter table public.identity_verifications
  add constraint identity_verifications_user_id_fkey
    foreign key (user_id) references public.users(id) on delete cascade,
  add constraint identity_verifications_user_id_key unique (user_id);

-- Step 5: Update RLS policy
drop policy if exists "Users can read own verification" on public.identity_verifications;

create policy "Users can read own verification"
  on public.identity_verifications for select
  to authenticated
  using (
    user_id in (
      select id from public.users where public.users.user_id = auth.uid()
    )
  );

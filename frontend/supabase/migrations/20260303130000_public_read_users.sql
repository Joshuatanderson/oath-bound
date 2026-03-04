-- Allow anyone to read user profiles (username, display_name are public info)
-- Drop the old self-only policy first
drop policy "Users can read their own record" on public.users;

create policy "Public can read users"
  on public.users for select
  using (true);

-- Add passed column
alter table public.audits add column passed boolean not null default false;
alter table public.audits alter column passed drop default;

-- RLS policies
create policy "Public can read audits"
  on public.audits for select
  using (true);

create policy "Authenticated users can insert own audits"
  on public.audits for insert
  with check (uploader = auth.uid());

-- Fix self-audit trigger: uploader is auth.users.id, skills.user_id is public.users.id
-- Need to join through public.users to connect them
create or replace function check_audit_not_self()
returns trigger as $$
begin
  if exists (
    select 1
    from public.skills s
    join public.users u on u.id = s.user_id
    where s.id = new.skill_id
      and u.user_id = new.uploader
  ) then
    raise exception 'Auditor cannot be the skill author';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_audit_not_self
  before insert or update on public.audits
  for each row execute function check_audit_not_self();

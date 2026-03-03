create or replace function check_audit_not_self()
returns trigger as $$
begin
  if exists (
    select 1 from public.skills
    where id = new.skill_id and user_id = new.uploader
  ) then
    raise exception 'Auditor cannot be the skill author';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_audit_not_self
  before insert or update on public.audits
  for each row execute function check_audit_not_self();

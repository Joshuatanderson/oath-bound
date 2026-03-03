alter table users add column role text not null default 'developer'
  check (role in ('developer', 'auditor'));

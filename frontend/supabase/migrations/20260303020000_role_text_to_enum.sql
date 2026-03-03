-- Convert role from text+check to a proper enum

create type user_role as enum ('DEVELOPER', 'AUDITOR');

alter table public.users
  drop constraint users_role_check,
  alter column role drop default;

alter table public.users
  alter column role set data type user_role using upper(role)::user_role;

alter table public.users
  alter column role set default 'DEVELOPER';

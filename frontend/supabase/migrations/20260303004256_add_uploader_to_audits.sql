alter table public.audits
  add column uploader uuid not null references public.users(id);

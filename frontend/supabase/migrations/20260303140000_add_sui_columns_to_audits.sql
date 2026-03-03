alter table public.audits
  add column sui_digest text,
  add column sui_object_id text;

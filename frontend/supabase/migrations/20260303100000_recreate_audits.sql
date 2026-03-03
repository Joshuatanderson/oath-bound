drop table if exists audits;

create table audits (
  id          uuid        primary key default gen_random_uuid(),
  skill_id    uuid        not null references skills(id),
  ipfs_cid    text        not null,
  report_hash text        not null,
  audited_at  timestamptz not null default now(),
  uploader    uuid        not null references auth.users(id)
);

alter table audits enable row level security;

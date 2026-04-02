create table public.downloads (
  id uuid primary key default gen_random_uuid(),
  skill_id uuid references public.skills(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete cascade,
  version text not null,
  downloaded_at timestamptz not null default now(),
  constraint downloads_entity_check check (
    (skill_id is not null and agent_id is null) or
    (skill_id is null and agent_id is not null)
  )
);

create index idx_downloads_skill_id on public.downloads(skill_id);
create index idx_downloads_agent_id on public.downloads(agent_id);
create index idx_downloads_at on public.downloads(downloaded_at);

alter table public.downloads enable row level security;

-- Public read so UI pages can display download counts
create policy "Public read access" on public.downloads for select using (true);

-- Create agents table for Claude Code subagent configurations
CREATE TABLE public.agents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  namespace       text NOT NULL,
  description     text NOT NULL,
  license         text NOT NULL REFERENCES public.licenses(id),
  version         text NOT NULL DEFAULT '0.1.0',

  -- Agent config: queryable/filterable fields as columns
  tools           text,
  disallowed_tools text,
  model           text,
  permission_mode text,
  max_turns       integer,
  memory_scope    text,
  background      boolean DEFAULT false,
  effort          text,
  isolation       text,

  -- Agent config: opaque/complex fields as jsonb
  config          jsonb NOT NULL DEFAULT '{}',

  -- System prompt (markdown body)
  system_prompt   text NOT NULL,

  -- Storage & integrity
  storage_path    text NOT NULL,
  content_hash    text NOT NULL,

  -- Oathbound metadata
  compatibility   text,
  original_author text,
  visibility      text NOT NULL DEFAULT 'public',
  user_id         uuid NOT NULL REFERENCES public.users(id),

  -- On-chain
  sui_digest      text,
  sui_object_id   text,

  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),

  -- Constraints
  CONSTRAINT agents_name_check
    CHECK (char_length(name) BETWEEN 1 AND 64 AND name ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT agents_description_check
    CHECK (char_length(description) BETWEEN 1 AND 1024),
  CONSTRAINT agents_version_semver_check
    CHECK (version ~ '^\d+\.\d+\.\d+$'),
  CONSTRAINT agents_visibility_check
    CHECK (visibility IN ('public', 'private')),
  CONSTRAINT agents_permission_mode_check
    CHECK (permission_mode IS NULL OR permission_mode IN ('default', 'acceptEdits', 'dontAsk', 'bypassPermissions', 'plan')),
  CONSTRAINT agents_memory_scope_check
    CHECK (memory_scope IS NULL OR memory_scope IN ('user', 'project', 'local')),
  CONSTRAINT agents_effort_check
    CHECK (effort IS NULL OR effort IN ('low', 'medium', 'high', 'max')),
  CONSTRAINT agents_isolation_check
    CHECK (isolation IS NULL OR isolation = 'worktree'),

  UNIQUE (namespace, name, version)
);

-- Enforce: original_author requires open-source license (same trigger as skills)
CREATE TRIGGER trg_agents_check_original_author
  BEFORE INSERT OR UPDATE ON public.agents
  FOR EACH ROW EXECUTE FUNCTION check_original_author_license();

-- RLS
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

-- SELECT: public agents readable by anyone, private only by owner
CREATE POLICY "Agents are readable based on visibility" ON public.agents
  FOR SELECT USING (
    visibility = 'public'
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = agents.user_id
        AND u.user_id = auth.uid()
    )
  );

-- INSERT: require approved identity verification (same gate as skills)
CREATE POLICY "Verified users can insert own agents" ON public.agents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id IN (
      SELECT id FROM public.users WHERE user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.identity_verifications iv
      JOIN public.users u ON u.id = iv.user_id
      WHERE u.user_id = auth.uid()
        AND iv.status = 'approved'
        AND iv.persona_hash IS NOT NULL
    )
  );

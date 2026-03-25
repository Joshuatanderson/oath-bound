# Oathbound Agents PRD

## Overview

Add **agents** as a first-class entity in Oathbound alongside skills. Agents are Claude Code subagent configurations (single `.md` files with YAML frontmatter + system prompt body) that can be published, pulled, verified, displayed, and attested on-chain — just like skills, but for executor configurations rather than knowledge/workflows.

### Why agents?

Skills define *what* Claude knows. Agents define *how* Claude operates — tool restrictions, model selection, permission modes, domain-specific system prompts. A verified agent means users can trust not just the knowledge but the behavioral constraints of a shared configuration.

### Key difference from skills

| Aspect | Skill | Agent |
|--------|-------|-------|
| Structure | Directory of files (SKILL.md + assets) | Single `.md` file |
| Identity file | `SKILL.md` | The `.md` file itself |
| Frontmatter | name, description, license, version, etc. | name, description, tools, model, hooks, etc. |
| Content | Instructions, scripts, references | System prompt + configuration |
| Install location | `.claude/skills/{name}/` | `.claude/agents/{name}.md` |
| On-chain hash | SHA-256 of tar archive (`tar_hash`) | SHA-256 of `.md` file content (`content_hash`) |

---

## Agent Frontmatter Spec (Anthropic Standard)

Based on [Claude Code subagent docs](https://code.claude.com/docs/en/sub-agents):

| Field | Required | Type | Oathbound handling |
|-------|----------|------|-------------------|
| `name` | **Yes** | string (lowercase, hyphens) | Stored, validated, indexed |
| `description` | **Yes** | string | Stored, validated |
| `tools` | No | comma-separated string | Stored, format-validated (non-empty strings) |
| `disallowedTools` | No | comma-separated string | Stored, format-validated |
| `model` | No | `sonnet` \| `opus` \| `haiku` \| `inherit` \| full model ID | Stored, validated against known aliases + model ID pattern |
| `permissionMode` | No | `default` \| `acceptEdits` \| `dontAsk` \| `bypassPermissions` \| `plan` | Stored, validated enum |
| `maxTurns` | No | integer | Stored, validated positive int |
| `skills` | No | list of strings | Stored (skill references, warn if not in registry) |
| `mcpServers` | No | list of objects/strings | Stored as jsonb, structure-validated |
| `hooks` | No | object | Stored as jsonb, structure-validated |
| `memory` | No | `user` \| `project` \| `local` | Stored, validated enum |
| `background` | No | boolean | Stored |
| `effort` | No | `low` \| `medium` \| `high` \| `max` | Stored, validated enum |
| `isolation` | No | `worktree` | Stored |
| `initialPrompt` | No | string | Stored |

### Oathbound-specific fields (added to frontmatter)

| Field | Required | Type | Purpose |
|-------|----------|------|---------|
| `license` | **Yes** | SPDX string | Same license validation as skills |
| `version` | No | semver string | Auto-bumped if omitted, like skills |
| `compatibility` | No | string (max 500) | Environment requirements |
| `original-author` | No | string | Only for open-source licenses |

---

## Stages

### Stage 1: Database Schema

**Goal**: Create the `agents` table and supporting infrastructure.

**Schema** (hybrid approach — queryable fields as columns, opaque config as jsonb):

```sql
CREATE TABLE agents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,                    -- lowercase + hyphens, max 64
  namespace     text NOT NULL,                    -- publisher username
  description   text NOT NULL,                    -- max 1024
  license       text NOT NULL REFERENCES licenses(id),
  version       text NOT NULL,                    -- semver

  -- Agent config: queryable/filterable fields as columns
  tools         text,                             -- comma-separated tool list
  disallowed_tools text,                          -- comma-separated denylist
  model         text,                             -- model alias or ID
  permission_mode text,                           -- permission mode enum
  max_turns     integer,
  memory_scope  text,                             -- user|project|local
  background    boolean DEFAULT false,
  effort        text,                             -- low|medium|high|max
  isolation     text,                             -- worktree

  -- Agent config: opaque/complex fields as jsonb
  config        jsonb NOT NULL DEFAULT '{}',      -- hooks, mcp_servers, skills_refs, initial_prompt

  -- System prompt (markdown body)
  system_prompt text NOT NULL,

  -- Storage & integrity
  storage_path  text NOT NULL,                    -- path to stored .md file in Storage
  content_hash  text NOT NULL,                    -- SHA-256 of canonical .md file content

  -- Oathbound metadata
  compatibility text,
  original_author text,
  visibility    text NOT NULL DEFAULT 'public',   -- public|private
  user_id       uuid NOT NULL REFERENCES public.users(id),

  -- On-chain
  sui_digest    text,
  sui_object_id text,

  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),

  UNIQUE(namespace, name, version)
);

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
-- (policies mirror skills table)
```

**`config` jsonb structure** (extensible — new Anthropic fields just go here):
```json
{
  "hooks": { ... },
  "mcpServers": [ ... ],
  "skillsRefs": ["skill-a", "skill-b"],
  "initialPrompt": "..."
}
```

**Decisions**:
- **Hybrid column strategy**: Queryable fields (model, permission_mode, effort, etc.) are columns. Opaque blobs (hooks, mcpServers, skillsRefs, initialPrompt) go in `config` jsonb. This means when Anthropic adds new agent frontmatter fields, we just add them to the jsonb — no migration needed.
- No tar file — agents are single files. Store raw `.md` in Supabase Storage as `{namespace}/{name}/v{version}.md`.
- `content_hash` = SHA-256 of the **canonical** `.md` file (see Stage 2 for canonical format).
- `system_prompt` column is a cache for quick web UI rendering. The Storage file is the source of truth for integrity.
- Each version is an immutable row — `updated_at` won't change (no trigger needed).
- Create a **separate `agents` Storage bucket** (not a folder in the existing skills bucket) for clean RLS separation.

**Tasks**:
1. Write migration SQL
2. Update `database.types.ts` (manually add types matching schema)
3. Add RLS policies (mirror skills)
4. Create `agents` Storage bucket in Supabase dashboard

---

### Stage 2: Validation & Content Hashing

**Goal**: Build server-side and CLI-side validation for agent `.md` files.

**Validator** (`frontend/lib/agent-validator.ts`):

Required frontmatter:
- `name`: 1-64 chars, `^[a-z0-9]+(-[a-z0-9]+)*$`, **must not be a reserved name**
- `description`: 1-1024 chars, non-empty
- `license`: must be in VALID_LICENSES

Optional frontmatter (type/format-checked):
- `version`: valid semver if present
- `tools`: comma-separated, validate format only (non-empty trimmed strings). **Do NOT validate against a hardcoded tool list** — Claude Code's tool list changes with every release
- `disallowedTools`: same format validation
- `model`: one of `sonnet|opus|haiku|inherit` or matches pattern `^claude-[a-z0-9-]+$`
- `permissionMode`: one of `default|acceptEdits|dontAsk|bypassPermissions|plan`
- `maxTurns`: positive integer
- `skills`: array of non-empty strings
- `mcpServers`: array — each item is either a string or an object with valid shape (key-value where value has `type` field)
- `hooks`: object — validate top-level keys are valid event names (`PreToolUse`, `PostToolUse`, `Stop`), validate structure has `matcher` and `hooks` array
- `memory`: one of `user|project|local`
- `background`: boolean
- `effort`: one of `low|medium|high|max`
- `isolation`: must be `worktree`
- `initialPrompt`: string
- `compatibility`: max 500 chars
- `original-author`: only with open-source license

Body:
- Must have non-empty markdown body (system prompt)

**Reserved agent names** (blocks collision with Claude Code built-ins):
```typescript
const RESERVED_AGENT_NAMES = [
  'explore', 'plan', 'default', 'general-purpose', 'bash',
  'statusline-setup', 'claude-code-guide',
  'system', 'claude', 'opus', 'sonnet', 'haiku',
];
```

**Security checks**:
- Size limit: 500KB for the `.md` file
- No path traversal in hook commands
- **Hooks and mcpServers are surfaced, not blocked** — they are inherently arbitrary code/network access. Oathbound validates structure but does not try to judge safety. The audit system (Stage 7) and UI surfacing (Stage 6) are the mitigations.

**Canonical `.md` serialization** (critical for deterministic hashing):
- YAML frontmatter keys in defined order: `name`, `description`, `license`, `version`, `tools`, `disallowedTools`, `model`, `permissionMode`, `maxTurns`, `skills`, `mcpServers`, `hooks`, `memory`, `background`, `effort`, `isolation`, `initialPrompt`, `compatibility`, `original-author`
- Omit keys with null/undefined values
- LF line endings (no CRLF)
- Single newline between frontmatter closing `---` and body
- No trailing whitespace on lines
- Single trailing newline at EOF
- Share `serializeAgentFrontmatter()` between server and CLI

**Content hash**:
- SHA-256 of the canonical `.md` file content
- Used for: DB `content_hash` column, on-chain attestation target, `pull` integrity verification, `verify` hook comparison

**Tasks**:
1. Create `frontend/lib/agent-validator.ts` (validation + canonical serialization)
2. Create `cli/agent-validator.ts` (shared or duplicated subset for CLI-side)
3. Write tests for validator (required fields, reserved names, format checks, canonical serialization determinism)

**Parallelizable with**: Stage 1 (DB) — no dependency between them.

---

### Stage 3: API Routes

**Goal**: Create REST endpoints for agent CRUD.

**GET `/api/agents`** (search/list):
- Query params: `q`, `namespace`, `sparse`, `limit`, `offset` (same pattern as skills)
- Returns paginated list with author info
- Deduped to latest version per namespace/name
- Response matches skills format but with agent-specific fields

**POST `/api/agents`** (push):
- Auth required + identity verification (same gate as skills)
- Request body:
  ```json
  {
    "name": "string",
    "description": "string",
    "license": "string",
    "version": "string | null",
    "systemPrompt": "string",
    "tools": "string | null",
    "disallowedTools": "string | null",
    "model": "string | null",
    "permissionMode": "string | null",
    "maxTurns": "number | null",
    "config": {
      "skillsRefs": "string[] | null",
      "mcpServers": "object | null",
      "hooks": "object | null",
      "initialPrompt": "string | null"
    },
    "memoryScope": "string | null",
    "background": "boolean | null",
    "effort": "string | null",
    "isolation": "string | null",
    "compatibility": "string | null",
    "originalAuthor": "string | null",
    "visibility": "public | private"
  }
  ```
- Flow:
  1. Validate all fields via agent-validator
  2. Reconstruct canonical `.md` file via `serializeAgentFrontmatter()` + body
  3. Compute content_hash from canonical `.md`
  4. Upload to Storage: `{namespace}/{name}/v{version}.md`
  5. On-chain attestation (if available — see note): `registerAgent(subject, contentHash, uri)`
  6. On-chain authorship link: `registerAuthorship(agentSubject, authorSubject)` (matching skills pattern)
  7. Insert into `agents` table
  8. Return `{ ok, namespace, name, version, suiDigest, suiObjectId }`

**Note on chain dependency**: On-chain attestation should be **optional at this stage** — if `registerAgent` is not yet deployed (Stage 5), store `sui_digest` and `sui_object_id` as null. This unblocks CLI delivery without waiting for Move contract redeployment. Wire in attestation as a fast follow in Stage 5.

**Tasks**:
1. Create `frontend/app/api/agents/route.ts` (GET + POST)
2. Share auth/verification helpers from skills route (extract to shared util if not already)
3. Write tests

**Parallelizable with**: Stage 2 (validator can be stubbed for initial API scaffolding).

---

### Stage 4: CLI Commands

**Goal**: Add `oathbound agent push`, `oathbound agent pull`, `oathbound agent search`.

**Command structure**: `oathbound agent <subcommand>` (Option C).

| Command | Description |
|---------|-------------|
| `oathbound agent push [path]` | Publish agent .md file to registry |
| `oathbound agent pull <namespace/name>[@version]` | Download agent to `.claude/agents/` |
| `oathbound agent search [query]` | Search registry |
| `oathbound agent list` | Alias for search |
| `oathbound agent` (no subcommand) | Show agent-specific help |

**CLI router change**: The current `cli.ts` uses a flat `if/else if` on `subcommand`. Adding `agent` requires two-level parsing: if `subcommand === "agent"`, read `args[1]` as the agent subcommand. This is a pattern change that needs care to not break existing commands.

**Push flow** (`cli/agent-push.ts`):
1. Read `.md` file from path (or find single `.md` in cwd with valid agent frontmatter)
2. Parse YAML frontmatter + markdown body
3. Validate via shared validator logic (CLI-side)
4. Authenticate (same as skill push)
5. POST to `/api/agents`
6. Display result (namespace, name, version, chain attestation if available)

**Pull flow** (extend `cli/cli.ts`):
1. Parse `namespace/name[@version]`
2. Query API or direct Supabase for agent record
3. Download `.md` from Storage
4. Verify content_hash matches SHA-256 of downloaded file
5. **Ensure `.claude/agents/` directory exists** (create if not)
6. **If agent has hooks or mcpServers**: print them to terminal with a warning before writing
7. Check if referenced skills (from `config.skillsRefs`) are installed locally — if not, print install suggestions
8. Write to `.claude/agents/{name}.md`
9. Display success with on-chain object ID if available

**Search flow** (`cli/agent-search.ts`):
- GET `/api/agents?q=...`
- Display results in table format (name, namespace, description, model, tools summary)

**Verify flow** (extend `cli/verify.ts`):
- In addition to hashing `.claude/skills/`, also hash `.claude/agents/*.md`
- Compare against registry hashes
- Session state gains `agentsVerified` field alongside existing `verified`
- SessionStart hook checks both skills and agents
- PreToolUse hook checks both

**Tasks**:
1. Refactor CLI router for two-level `agent <subcommand>` parsing
2. Create `cli/agent-push.ts`
3. Create `cli/agent-search.ts`
4. Add `agent pull` handler in `cli/cli.ts`
5. Extend `cli/verify.ts` for agent verification (SessionStart + PreToolUse)
6. Bump CLI version (minor bump — new feature)
7. Write CLI tests

---

### Stage 5: On-Chain Attestation

**Goal**: Add `register_agent` entry point to Move contract. Deploy updated contract.

**New entry in `registrations.move`** (matching existing function signatures):
```move
public fun register_agent(
    admin: &AdminCap,
    subject: vector<u8>,    // sha256("agent:namespace/name@version")
    agent_hash: vector<u8>, // SHA-256 of canonical .md file content
    uri: String,            // storage URI hint
    ctx: &mut TxContext,
) {
    create(
        admin,
        subject,
        b"register_agent".to_string(),
        agent_hash,
        vector[],
        uri,
        ctx,
    );
}
```

**Note**: Uses `public fun` (not `public entry fun`) and includes `uri` parameter — matching the existing `register_skill` signature pattern. Uses `create()` (not `attest()`) which is the actual function name in `attestation.move`.

**New function in `frontend/lib/sui.ts`**:
```typescript
export async function registerAgent(
  subject: string,
  agentHash: string,
  uri?: string
): Promise<ChainResult> { ... }
```

**Operational steps for contract redeployment**:
1. Add `register_agent` to `registrations.move`
2. `sui move build` and verify
3. Deploy updated package to testnet (`sui client publish`)
4. **New package creates a new package ID** — update `SUI_PACKAGE_ID` env var
5. Verify AdminCap works with new package
6. Update Vercel env vars
7. Add `registerAgent()` to `sui.ts`
8. Wire into POST `/api/agents` route (update from optional→required)
9. Also add `registerAuthorship()` call for agents

**Hash conventions**:
- Subject: `sha256("agent:namespace/name@version")`
- Target: SHA-256 of canonical `.md` (content_hash)
- Evidence: empty
- URI: Storage path

---

### Stage 6: Web UI

**Goal**: Display agents in the web app — listing page + detail page.

**Pages**:

`/agents` (listing):
- Grid layout matching `/skills`
- Card per agent: name, description, namespace, model badge, permission mode indicator, tools summary
- **Security indicators**: warning badge if agent has `bypassPermissions`, hooks, or mcpServers
- Filter/search
- Link to detail page

`/agents/[id]` (detail):
- Full agent metadata
- **Full system prompt** rendered in a code block (not just a preview — users must read the entire prompt to trust an agent)
- Tool restrictions visualization (allowed / disallowed)
- **Hooks display** — prominently show all hook commands if present
- **MCP servers display** — show all configured servers
- **Permission mode** — highlighted if elevated (`bypassPermissions`, `dontAsk`)
- Referenced skills as clickable links (to `/skills/[id]`)
- Version history
- On-chain attestation accordion (same pattern as skills)
- Copy-paste `oathbound agent pull namespace/name` command

**Shared components** (extract from skills pages):
- Attestation accordion
- Author badge / verification badge
- Version history component

**Tasks**:
1. Create `/agents` listing page
2. Create `/agents/[id]` detail page
3. Extract shared components from skills pages
4. Add `/agents` to site navigation

**Parallelizable with**: Stage 4 (CLI), Stage 5 (on-chain) — only needs API (Stage 3) to be functional.

---

### Stage 7: Agent Audits (Future / Deferred)

**Goal**: Allow auditors to audit agents, same pattern as skill audits.

When implemented, generalize the `audits` table:
```sql
ALTER TABLE audits
  ADD COLUMN entity_type text NOT NULL DEFAULT 'skill',
  ADD COLUMN entity_id uuid;
-- Backfill: UPDATE audits SET entity_id = skill_id;
-- Then drop skill_id
```

**Deferred** — not needed for initial launch. Design the agents table now with the knowledge that audits will use `entity_id + entity_type` later.

---

## Execution Order & Dependencies

```
Stage 1: DB Schema ─────────┐
                             ├──→ Stage 3: API Routes ──┬──→ Stage 4: CLI (PRIORITY)
Stage 2: Validation ─────────┘                          ├──→ Stage 5: On-Chain
                                                        └──→ Stage 6: Web UI
```

**Optimized ordering for fastest time-to-value**:
1. **Stage 1 + 2** in parallel (DB + validation, no dependency)
2. **Stage 3** (API — depends on 1 + 2, chain attestation optional)
3. **Stage 4** (CLI — highest user-facing priority, gives push/pull/search)
4. **Stage 5** (On-chain — wire into existing API, update from optional→required)
5. **Stage 6** (Web UI — users who push/pull via CLI don't need web UI immediately)

**Key insight**: Making on-chain attestation optional in the API (storing null for sui fields) lets us ship a working push/pull/search cycle without waiting for Move contract redeployment.

**Parallelization**:
- Stages 1 + 2 run in parallel
- Stages 4 + 5 + 6 can all run in parallel (once Stage 3 API contract is defined)
- Within Stage 4: push, pull, search can be developed independently
- Tests for each stage run alongside implementation

---

## Resolved Decisions

1. **Command naming**: `oathbound agent <subcommand>`. Also add `oathbound agents` as alias for `oathbound agent search`.

2. **Audit generalization**: Use `entity_id + entity_type` when Stage 7 is built. Don't migrate now — just design with it in mind.

3. **Agent + skill bundling**: Do NOT bundle. Warn at push time if referenced skills aren't in registry. Warn at pull time if referenced skills aren't installed locally. Show referenced skills as links in web UI.

4. **Navigation**: Keep `/skills` and `/agents` separate for launch. Add both to top nav. Revisit unified `/explore` if/when a third entity type appears.

5. **Verification hooks**: `oathbound verify` checks both skills and agents by default.

---

## Security Considerations

| Risk | Severity | Mitigation |
|------|----------|------------|
| `permissionMode: bypassPermissions` | High | Warning badge in web UI, surfaced in `agent pull` output |
| `hooks` with arbitrary shell commands | High | Display hooks prominently in web UI + pull output. Do NOT try to validate command safety (losing game). Audit system is the mitigation. |
| `mcpServers` pointing to external endpoints | Medium | Display in web UI detail page. Audit system is the mitigation. |
| System prompt injection | Medium | Audit system (Stage 7). Show full prompt in web UI so users can inspect. |
| Naming collision with built-in agents | Low | Reserved names list in validator |

---

## Footnotes / Open for Later

- **Model field runtime behavior**: Unclear what happens if a user runs an agent specifying a model they don't have access to (e.g., `model: opus` but user only has sonnet). Does Claude Code error or fall back? Need to test this outside of an Opus session. Until resolved, recommend agent authors use `inherit` or omit `model`. This affects whether we should treat `model` as part of the verified hash or as a user-overridable field.

---

## Non-Goals (this PRD)

- Agent marketplace/discovery features beyond basic search
- Agent execution monitoring or usage analytics
- Agent composition (agents spawning agents)
- Agent versioning beyond semver (no branching, no draft/published states)
- Audit workflow for agents (Stage 7, deferred)
- Validating tool names against a hardcoded list (too fragile)
- Blocking agents with hooks/mcpServers (legitimate use case — surface, don't block)

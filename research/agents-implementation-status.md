# Agents Implementation Status

## Completed

### Stage 1: Database Schema ✅
- Migration: `frontend/supabase/migrations/20260325120000_create_agents_table.sql`
- RLS fix: `frontend/supabase/migrations/20260325130000_agents_simpler_rls.sql`
- Types: `frontend/lib/database.types.ts` — agents table added (Row/Insert/Update)
- Both migrations pushed and applied to Supabase project `mjnfqagwuewhgwbtrdgs`
- Storage bucket "agents" created via dashboard

### Stage 2: Validation & Content Hashing ✅
- Validator: `frontend/lib/agent-validator.ts`
- Tests: `frontend/lib/agent-validator.test.ts` — 62 tests, all passing
- Exports: `validateAgent`, `parseAgentFrontmatter`, `serializeAgentFile`, `agentToMeta`
- Key decisions:
  - Tools validated by format only (not hardcoded list)
  - Reserved names block Claude Code built-ins (explore, plan, system, etc.)
  - `serializeAgentFile()` produces deterministic output with defined key order for hashing
  - Reuses `VALID_LICENSES`, `isOpenSourceLicense`, `ValidationCheck` from skill-validator

### Stage 3: API Routes ✅
- File: `frontend/app/api/agents/route.ts`
- GET endpoint: complete, mirrors skills pattern (search, dedupe, paginate, shape)
- POST endpoint: complete, type error fixed (`config` uses `{ [key: string]: Json | undefined }`)
- On-chain attestation commented out (Stage 5 dependency) — returns null for sui fields
- Auth uses `getClientFromRequest()` pattern (Bearer token or cookie)
- No identity verification required (simpler than skills, per user request)
- `tsc --noEmit` passes clean

### Stage 4: CLI Commands ✅
- `oathbound agent push [path] [--private]` — publishes agent .md to registry
- `oathbound agent pull <namespace/name[@version]>` — downloads to `.claude/agents/`
- `oathbound agent search [query]` / `oathbound agent list` — searches agents registry
- Two-level command parsing: `agent` subcommand dispatches to agent-specific handlers
- Agent pull verifies content_hash (SHA-256) and warns about hooks/mcpServers
- Version bumped to 0.13.0 (both `cli.ts` and `package.json`)
- All 50 existing CLI tests + 62 agent validator tests pass
- New files: `cli/agent-push.ts`, `cli/agent-search.ts`
- Updated: `cli/cli.ts`, `cli/ui.ts`, `cli/package.json`

## Remaining Stages

### Stage 4: CLI Commands
- `oathbound agent push/pull/search/list`
- Two-level command parsing (`agent <subcommand>`)
- See PRD at `research/agents-prd.md` for full spec

### Stage 5: On-Chain Attestation
- Add `register_agent` to `sources/registrations.move`
- Must use `public fun` (not `public entry fun`), include `uri` param, use `create()` function
- Add `registerAgent()` to `frontend/lib/sui.ts`
- Uncomment chain attestation block in POST `/api/agents`
- Contract redeploy creates new package ID — update env vars

### Stage 6: Web UI
- `/agents` listing page + `/agents/[id]` detail page
- Surface hooks/mcpServers/permissionMode prominently (security)
- Show full system prompt (not just preview)

### Stage 7: Agent Audits (deferred)
- Generalize audits table to `entity_id + entity_type` when needed

## Key Files
- PRD: `research/agents-prd.md`
- Migration: `frontend/supabase/migrations/20260325120000_create_agents_table.sql`
- RLS fix: `frontend/supabase/migrations/20260325130000_agents_simpler_rls.sql`
- Validator: `frontend/lib/agent-validator.ts`
- Validator tests: `frontend/lib/agent-validator.test.ts`
- API route: `frontend/app/api/agents/route.ts`
- DB types: `frontend/lib/database.types.ts`

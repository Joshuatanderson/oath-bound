---
name: supabase
description: Manage Supabase projects — query databases, push migrations, generate types, search docs, view logs, manage edge functions, and run security checks. Use when working with Supabase databases, deploying migrations, or managing project infrastructure.
license: MIT
allowed-tools: Bash(bun run *)
compatibility: Requires Bun runtime and SUPABASE_PROJECT_REF + SUPABASE_ACCOUNT_TOKEN environment variables
---
# Supabase Skill

## Before You Query

**CRITICAL**: Before writing ANY SQL query, check `frontend/lib/database.types.ts` to verify table and column names. Never assume schema structure.

## If This Skill Blocks an Operation

**CRITICAL**: If a script blocks a write or destructive operation, treat the block as user intent, not an obstacle.

- Do NOT use curl, fetch, or direct CLI to bypass the block
- **ASK THE USER** what they want to do instead

## Environment Variables

| Variable | Required By | Default |
|----------|------------|---------|
| `SUPABASE_PROJECT_REF` | All scripts except search-docs | — |
| `SUPABASE_ACCOUNT_TOKEN` | All scripts except search-docs, push-migrations | — |
| `SUPABASE_DB_PASSWORD` | push-migrations | — |
| `SUPABASE_POOLER_HOST` | push-migrations | `aws-0-us-east-1.pooler.supabase.com` |
| `SUPABASE_SERVICE_ROLE_KEY` | edge-functions invoke | — |
| `SUPABASE_ALLOW_WRITE` | write operations (INSERT, UPDATE, deploy, invoke, push) | `false` |
| `SUPABASE_ALLOW_DESTRUCTIVE` | destructive operations (DROP, TRUNCATE) | `false` |

Set these in your project root `.env` file. Run all scripts from the **project root directory**.

## Scripts

All scripts live in `scripts/` and output JSON to stdout. Run with:

```bash
bun run .claude/skills/supabase/scripts/<script>.ts [--args]
```

### query.ts — Execute SQL

```bash
bun run .claude/skills/supabase/scripts/query.ts --sql="SELECT * FROM users LIMIT 5"
```

Automatically analyzes risk level. Blocked if risk exceeds permission level.

### list-tables.ts — List Tables & Views

```bash
bun run .claude/skills/supabase/scripts/list-tables.ts [--schemas=public,auth]
```

### list-migrations.ts — List Applied Migrations

```bash
bun run .claude/skills/supabase/scripts/list-migrations.ts
```

### list-extensions.ts — List PostgreSQL Extensions

```bash
bun run .claude/skills/supabase/scripts/list-extensions.ts
```

### generate-types.ts — Generate TypeScript Types

```bash
# Print to stdout
bun run .claude/skills/supabase/scripts/generate-types.ts

# Write to file
bun run .claude/skills/supabase/scripts/generate-types.ts --output=frontend/lib/database.types.ts
```

### search-docs.ts — Search Supabase Docs

No auth required — uses public GraphQL API.

```bash
bun run .claude/skills/supabase/scripts/search-docs.ts --query="row level security" [--limit=10]
```

### get-logs.ts — Get Project Logs

```bash
bun run .claude/skills/supabase/scripts/get-logs.ts --service=postgres [--hours=24]
```

Services: `api`, `branch-action`, `postgres`, `edge-function`, `auth`, `storage`, `realtime`

### get-advisors.ts — Security & Performance Checks

```bash
bun run .claude/skills/supabase/scripts/get-advisors.ts --type=security
bun run .claude/skills/supabase/scripts/get-advisors.ts --type=performance
```

### push-migrations.ts — Push Pending Migrations

Requires `SUPABASE_ALLOW_WRITE=true` and `SUPABASE_DB_PASSWORD`.

```bash
bun run .claude/skills/supabase/scripts/push-migrations.ts
```

Uses port 5432 (direct connection). Do NOT use port 6543 (pooler) — it causes "prepared statement already exists" errors.

### edge-functions.ts — Manage Edge Functions

```bash
# List all functions
bun run .claude/skills/supabase/scripts/edge-functions.ts --action=list

# Get function details
bun run .claude/skills/supabase/scripts/edge-functions.ts --action=get --slug=my-function

# Invoke a function (requires SUPABASE_ALLOW_WRITE=true, SUPABASE_SERVICE_ROLE_KEY)
bun run .claude/skills/supabase/scripts/edge-functions.ts --action=invoke --name=my-function --body='{"key":"value"}'

# Deploy a function (requires SUPABASE_ALLOW_WRITE=true)
bun run .claude/skills/supabase/scripts/edge-functions.ts --action=deploy --name=my-function --files='[{"name":"index.ts","content":"..."}]'
```

## Permissions

Write and destructive operations are gated by environment variables:

- **Read** (SELECT, list, get): Always allowed
- **Write** (INSERT, UPDATE, CREATE, deploy, invoke, push): Requires `SUPABASE_ALLOW_WRITE=true`
- **Destructive** (DROP, TRUNCATE, DELETE without WHERE): Requires both `SUPABASE_ALLOW_WRITE=true` and `SUPABASE_ALLOW_DESTRUCTIVE=true`

## Migrations Workflow

1. Create a migration file in `frontend/supabase/migrations/` with timestamp prefix (e.g., `20260303010133_add_role.sql`)
2. Run `push-migrations.ts` to apply pending migrations
3. Run `generate-types.ts --output=frontend/lib/database.types.ts` to update types

## Do NOT Use (Use This Skill Instead)

| Instead of... | Use... |
|---------------|--------|
| `mcp__supabase__*` (any MCP tool) | Corresponding script above |
| `supabase db push` directly | `push-migrations.ts` |
| Supabase CLI directly | This skill's scripts |

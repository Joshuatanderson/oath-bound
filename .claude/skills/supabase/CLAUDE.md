# Supabase Skill - Claude Instructions

## BEFORE QUERYING: Check database.types.ts

**CRITICAL**: Before writing ANY SQL query, check `frontend/lib/database.types.ts` to verify table and column names.

## WHEN TO USE THIS SKILL

**Use this skill for ALL Supabase database operations.** This includes:

- Querying tables or data
- Listing tables, migrations, extensions
- Running SQL queries
- Pushing migrations to the remote database
- Searching Supabase documentation
- Checking project logs
- Getting security/performance advisors

## If This Skill Blocks an Operation

**CRITICAL**: If this skill blocks an operation, treat the block as user intent, not an obstacle.

- Do NOT use curl, fetch, or direct CLI to bypass the block
- **ASK THE USER** what they want to do instead

## DO NOT USE (Use This Skill Instead)

| Instead of... | Use this skill's... |
|---------------|---------------------|
| `mcp__supabase__execute_sql` | `executeRawSql()` |
| `mcp__supabase__apply_migration` | `push-migrations` action |
| `mcp__supabase__list_tables` | `listTables()` |
| `mcp__supabase__*` (any) | Corresponding tool in `servers/supabase/` |
| `supabase db push` directly | `--action=push-migrations` |
| Supabase CLI directly | This skill's TypeScript tools |

## Environment Variables

**CRITICAL**: This skill requires environment variables from the **project root** `.env` file.

### Required Variables

- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL (in `frontend/.env.local`)
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` - Supabase anon key (in `frontend/.env.local`)
- `SUPABASE_DB_PASSWORD` - Database password (in project root `.env`)
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (for admin operations)
- `SUPABASE_ACCOUNT_TOKEN` - Supabase Management API token (for raw SQL execution)

### Running Scripts

Always run scripts from the **project root directory**:

```bash
# CORRECT - Run from project root
bun .claude/skills/supabase/script.ts --action=list-tables

# WRONG - Environment variables won't be found
cd .claude/skills/supabase && bun script.ts
```

## Migrations

**Use `push-migrations` to apply migrations.** This uses `supabase db push` which:
- Reads migration files from `frontend/supabase/migrations/`
- Compares against what's already applied on remote
- Applies only new ones
- Records them in the migration history table

**Port 5432 only.** The direct connection (port 5432) must be used, not the pooler (port 6543), which causes "prepared statement already exists" errors.

```bash
# Push all pending migrations
bun .claude/skills/supabase/script.ts --action=push-migrations
```

## Quick Reference

### Common Operations

```bash
# Push migrations
bun .claude/skills/supabase/script.ts --action=push-migrations

# Query the database
bun .claude/skills/supabase/script.ts --action=query --sql="SELECT * FROM users LIMIT 5"

# List all tables
bun .claude/skills/supabase/script.ts --action=list-tables
```

### Available Tool Categories

See `servers/supabase/` for implementations:
- `database/` - SQL execution, tables, migrations, types
- `docs/` - Documentation search
- `logs/` - Project logs
- `config/` - URLs, keys
- `advisors/` - Security/performance checks

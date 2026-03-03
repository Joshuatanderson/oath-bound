# Supabase Skill

**Project:** `mjnfqagwuewhgwbtrdgs` (Oathbound)

## Execute

```bash
# Run from project root (required for env vars)

# Push all pending migrations to remote database
bun .claude/skills/supabase/script.ts --action=push-migrations

# Query the database
bun .claude/skills/supabase/script.ts --action=query --sql="SELECT * FROM users LIMIT 5"

# List tables
bun .claude/skills/supabase/script.ts --action=list-tables
```

## Migrations Workflow

1. Create a migration file in `frontend/supabase/migrations/` with timestamp prefix (e.g. `20260303010133_add_role_to_users.sql`)
2. Run `push-migrations` to apply all pending migrations
3. Regenerate types: `bunx supabase gen types --lang=typescript --project-id mjnfqagwuewhgwbtrdgs > frontend/lib/database.types.ts`

**Important:** `push-migrations` uses `supabase db push` with a direct DB connection (port 5432). Do NOT use port 6543 (pooler) — it causes "prepared statement already exists" errors.

## Environment Variables

Requires `SUPABASE_DB_PASSWORD` in the project root `.env` file (one directory above `frontend/`).

## Permissions

All operations (read, write, destructive) are allowed.

## Imports

```typescript
import {
  createSupabaseClient,
  executeRawSql,
  assertAllowed,
  analyzeQueryRisk,
  getCurrentEnvironment,
} from './src/index.ts';
```

## Available Tools

See `servers/supabase/` for tool implementations by category:
- `database/` - SQL, tables, migrations, types, extensions
- `docs/` - documentation search
- `logs/` - project logs
- `config/` - URLs, keys
- `advisors/` - security/performance checks

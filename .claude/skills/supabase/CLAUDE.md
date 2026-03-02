# Supabase Skill - Claude Instructions

## BEFORE QUERYING: Check database.types.ts

**CRITICAL**: Before writing ANY SQL query, check `frontend/lib/database.types.ts` to verify table and column names.

## WHEN TO USE THIS SKILL

**Use this skill for ALL Supabase database operations.** This includes:

- Querying tables or data
- Listing tables, migrations, extensions
- Running SQL queries
- Generating TypeScript types
- Searching Supabase documentation
- Checking project logs
- Getting security/performance advisors
- Managing edge functions (deploy, list, invoke)

## If This Skill Blocks an Operation

**CRITICAL**: If this skill blocks an operation, treat the block as user intent, not an obstacle.

- Do NOT use curl, fetch, or direct CLI to bypass the block
- **ASK THE USER** what they want to do instead

## DO NOT USE (Use This Skill Instead)

| Instead of... | Use this skill's... |
|---------------|---------------------|
| `mcp__supabase__execute_sql` | `executeRawSql()` |
| `mcp__supabase__apply_migration` | `applyMigration()` |
| `mcp__supabase__list_tables` | `listTables()` |
| `mcp__supabase__*` (any) | Corresponding tool in `servers/supabase/` |
| Supabase CLI directly | This skill's TypeScript tools |

## Environment Variables

**CRITICAL**: This skill requires environment variables from the **project root** `.env` or `frontend/.env.local` file.

### Required Variables

- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` - Supabase anon/public key
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

## Quick Reference

### Common Operations

```typescript
// List all tables
import { listTables } from './servers/supabase/database/listTables.ts';
const tables = await listTables();

// Execute a query
import { executeRawSql, assertAllowed, analyzeQueryRisk } from './src/index.ts';

const query = `SELECT * FROM users LIMIT 10`;
assertAllowed('database', analyzeQueryRisk(query));
const result = await executeRawSql(query);

// Search documentation
import { searchDocs } from './servers/supabase/docs/searchDocs.ts';
const docs = await searchDocs({ query: 'authentication' });
```

### Available Tool Categories

See `servers/supabase/` for implementations:
- `database/` - SQL execution, tables, migrations, types
- `docs/` - Documentation search
- `logs/` - Project logs
- `config/` - URLs, keys
- `advisors/` - Security/performance checks
- `edge-functions/` - Function deployment, listing, and invocation

## CLI Actions Reference

### Database Actions

```bash
# Query the database
bun .claude/skills/supabase/script.ts --action=query --sql="SELECT * FROM users LIMIT 5"

# List all tables
bun .claude/skills/supabase/script.ts --action=list-tables

# Apply a migration
bun .claude/skills/supabase/script.ts --action=apply-migration --file=supabase/migrations/20250120_my_migration.sql
```

### Edge Function Actions

```bash
# List all edge functions
bun .claude/skills/supabase/script.ts --action=list-functions

# Deploy an edge function
bun .claude/skills/supabase/script.ts --action=deploy-function --name=my-function

# Deploy with JWT verification enabled
bun .claude/skills/supabase/script.ts --action=deploy-function --name=my-function --verify-jwt

# Invoke an edge function
bun .claude/skills/supabase/script.ts --action=invoke-function --name=my-function --body='{"key":"value"}'
```

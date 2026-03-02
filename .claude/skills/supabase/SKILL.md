# Supabase Skill

**Project:** `mjnfqagwuewhgwbtrdgs` (Oath Bound)

## Execute

```bash
# Run from project root (required for env vars)

# Query the database
bun .claude/skills/supabase/script.ts --action=query --sql="SELECT * FROM users LIMIT 5"

# List tables
bun .claude/skills/supabase/script.ts --action=list-tables

# Apply a migration
bun .claude/skills/supabase/script.ts --action=apply-migration --file=path/to/migration.sql

# Deploy edge function
bun .claude/skills/supabase/script.ts --action=deploy-function --name=my-function
bun .claude/skills/supabase/script.ts --action=deploy-function --name=my-function --verify-jwt

# List edge functions
bun .claude/skills/supabase/script.ts --action=list-functions

# Invoke edge function
bun .claude/skills/supabase/script.ts --action=invoke-function --name=my-function --body='{"key":"value"}'
```

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

## Example: Query

```typescript
import { executeRawSql, assertAllowed, analyzeQueryRisk } from './src/index.ts';

const query = `SELECT * FROM users LIMIT 10`;
assertAllowed('database', analyzeQueryRisk(query));
const result = await executeRawSql(query);
console.log(JSON.stringify(result, null, 2));
```

## Available Tools

See `servers/supabase/` for tool implementations by category:
- `database/` - SQL, tables, migrations, types, extensions
- `docs/` - documentation search
- `logs/` - project logs
- `config/` - URLs, keys
- `advisors/` - security/performance checks
- `edge-functions/` - function deployment, listing, invocation

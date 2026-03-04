# Supabase Skill API Reference

## scripts/lib.ts — Shared Utilities

All scripts import from `lib.ts`. No external dependencies.

### Environment Functions

- `getEnv(key, required?)` — Read env var; exits with error if required and missing
- `getProjectRef()` — Reads `SUPABASE_PROJECT_REF`
- `getAccountToken()` — Reads `SUPABASE_ACCOUNT_TOKEN`

### Fetch Helpers

- `managementApi<T>(endpoint, options?)` — Authenticated GET/POST/etc to `api.supabase.com/v1`
- `managementApiMultipart<T>(endpoint, formData, method?)` — Multipart upload (edge function deploy)
- `executeRawSql<T>(query)` — POST to `/projects/{ref}/database/query`
- `docsGraphql<T>(query)` — POST to `supabase.com/docs/api/graphql` (no auth)

### Risk Analysis

- `analyzeQueryRisk(query)` → `"read" | "write" | "destructive"`
  - Destructive: DROP TABLE/DATABASE/SCHEMA/INDEX/VIEW/FUNCTION/POLICY, TRUNCATE, DELETE without WHERE, ALTER TABLE DROP
  - Write: INSERT INTO, UPDATE SET, DELETE FROM, CREATE TABLE/INDEX/VIEW/FUNCTION/SCHEMA, ALTER TABLE, GRANT, REVOKE
  - Read: everything else

- `assertAllowed(riskLevel)` — Exits if operation exceeds permission level

### Utilities

- `parseArgs(defs)` — Parse `--key=value` args from `process.argv`
- `output(data)` — `JSON.stringify` to stdout

---

## scripts/query.ts

Execute arbitrary SQL queries.

| Arg | Required | Description |
|-----|----------|-------------|
| `--sql` | Yes | SQL query to execute |

**Output**: `{ riskLevel: string, result: any[] }`

**Errors**: Exits if query risk exceeds permission level.

---

## scripts/list-tables.ts

List tables and views in specified schemas.

| Arg | Required | Default | Description |
|-----|----------|---------|-------------|
| `--schemas` | No | `public` | Comma-separated schema names |

**Output**: `Array<{ schema: string, name: string, type: "table" | "view" }>`

**Validation**: Schema names must match `/^[a-zA-Z_][a-zA-Z0-9_]*$/`.

---

## scripts/list-migrations.ts

List applied database migrations.

No arguments.

**Output**: `Array<{ version: string, name: string, appliedAt: string }>`

---

## scripts/list-extensions.ts

List installed PostgreSQL extensions.

No arguments.

**Output**: `Array<{ name: string, version: string, schema: string }>`

---

## scripts/generate-types.ts

Generate TypeScript types from the database schema.

| Arg | Required | Description |
|-----|----------|-------------|
| `--output` | No | File path to write types to. If omitted, prints raw types to stdout. |

**Output** (with `--output`): `{ written: string, length: number }`
**Output** (without `--output`): Raw TypeScript type definitions

---

## scripts/search-docs.ts

Search Supabase documentation via public GraphQL API. No auth required.

| Arg | Required | Description |
|-----|----------|-------------|
| `--query` | Yes | Search query |
| `--limit` | No | Max results |

**Output**: `{ totalCount: number, results: Array<{ title, href, content, type, subsections? }> }`

Result types: `guide`, `cli-reference`, `api-reference`, `function-reference`, `troubleshooting`

---

## scripts/get-logs.ts

Get project logs by service.

| Arg | Required | Default | Description |
|-----|----------|---------|-------------|
| `--service` | Yes | — | One of: api, branch-action, postgres, edge-function, auth, storage, realtime |
| `--hours` | No | `24` | Lookback window in hours |

**Output**: `Array<{ id, timestamp, eventMessage, metadata }>`

Returns up to 100 most recent log entries.

---

## scripts/get-advisors.ts

Get security or performance advisories.

| Arg | Required | Description |
|-----|----------|-------------|
| `--type` | Yes | `security` or `performance` |

**Output**: `Array<{ type, title, description, severity, remediationUrl? }>`

Severity levels: `low`, `medium`, `high`, `critical`

---

## scripts/push-migrations.ts

Push pending migrations to the remote database.

No arguments. Requires `SUPABASE_ALLOW_WRITE=true` and `SUPABASE_DB_PASSWORD`.

Optional: `SUPABASE_POOLER_HOST` (default: `aws-0-us-east-1.pooler.supabase.com`)

**Output**: `{ success: true, message: string }`

**Behavior**:
1. Finds `supabase/migrations/` directory (checks cwd then `frontend/`)
2. Runs `bunx supabase db push --include-all --db-url <url>`
3. Uses port 5432 (direct connection, not pooler)

---

## scripts/edge-functions.ts

Manage Supabase Edge Functions.

| Arg | Required | Description |
|-----|----------|-------------|
| `--action` | Yes | `list`, `get`, `invoke`, or `deploy` |

### action=list

No additional args.

**Output**: `Array<{ id, slug, name, status, version, createdAt, updatedAt }>`

### action=get

| Arg | Required | Description |
|-----|----------|-------------|
| `--slug` | Yes | Function slug |

**Output**: Full function details from Management API.

### action=invoke

| Arg | Required | Description |
|-----|----------|-------------|
| `--name` | Yes | Function name |
| `--body` | No | JSON body string |
| `--method` | No | HTTP method (default: POST) |

Requires `SUPABASE_ALLOW_WRITE=true` and `SUPABASE_SERVICE_ROLE_KEY`.

**Output**: `{ status, statusText, ok, data, duration, headers }`

### action=deploy

| Arg | Required | Description |
|-----|----------|-------------|
| `--name` | Yes | Function name |
| `--files` | Yes | JSON array of `{name, content}` |
| `--entrypoint` | No | Entrypoint path (default: index.ts) |
| `--verify_jwt` | No | `"true"` to enable JWT verification |
| `--import_map_path` | No | Import map path |

Requires `SUPABASE_ALLOW_WRITE=true`.

**Output**: Deployed function details from Management API.

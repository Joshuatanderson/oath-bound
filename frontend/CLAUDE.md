# Frontend Notes

## Supabase CLI

- Migrations live in `frontend/supabase/migrations/` — run `supabase` commands from `frontend/`, not the repo root.
- Use port **5432** (session/direct connection) for `supabase db push`, **not** 6543 (transaction pooler). The transaction pooler doesn't support prepared statements and will fail with `prepared statement already exists`.
- DB password and connection string are in the root `.env`. Pass via `--db-url` if `supabase link` didn't capture the password:
  ```
  npx supabase db push --db-url "postgresql://postgres.<ref>:<password>@aws-1-us-east-2.pooler.supabase.com:5432/postgres"
  ```

## Environment Variables

- Root `.env` holds all vars including `NEXT_PUBLIC_*`. `next.config.ts` loads it via `dotenv`.
- No `frontend/.env.local` or `frontend/.env` — everything comes from the root `.env`.

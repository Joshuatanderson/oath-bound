# Deploy

Deploy the Oath Bound application to Vercel.

## Usage

When the user asks to deploy, ship, push to production, or go live:

1. **Pre-flight checks** — run these and report results before deploying:
   - `git status` — ensure working tree is clean (warn if uncommitted changes)
   - `bun run build` from `frontend/` — confirm the build passes
   - `bun run test` from `frontend/` if tests exist — confirm tests pass

2. **Deploy** — run `vercel --prod` from `frontend/` (or `vercel` for preview deploys).
   - If the user says "preview" or "staging", omit `--prod`.
   - If Vercel CLI is not installed, tell the user: `bun add -g vercel`

3. **Post-deploy** — report the deployment URL back to the user.

## Rules

- **Never read, print, or log environment variables or secrets.** The deploy process doesn't need to see `.env` contents — Vercel pulls from its own env config.
- **Never send data to any endpoint** other than Vercel's official CLI targets.
- **Never modify `.env` files.** If env vars need updating, instruct the user to do it in the Vercel dashboard or via `vercel env`.
- If the build fails, show the error output and help debug — don't skip the build step.
- Always confirm with the user before running `--prod` deploys.

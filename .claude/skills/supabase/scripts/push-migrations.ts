#!/usr/bin/env bun
/**
 * Push pending migrations to the remote database using supabase db push.
 * Usage: bun run scripts/push-migrations.ts
 *
 * Requires: SUPABASE_DB_PASSWORD, SUPABASE_ALLOW_WRITE=true
 * Optional: SUPABASE_POOLER_HOST (default: aws-0-us-east-1.pooler.supabase.com)
 */

import * as fs from "fs";
import * as path from "path";
import { getEnv, getProjectRef, assertAllowed, output } from "./lib.ts";

assertAllowed("write");

const ref = getProjectRef();
const password = getEnv("SUPABASE_DB_PASSWORD");
const poolerHost = getEnv("SUPABASE_POOLER_HOST", false) || "aws-0-us-east-1.pooler.supabase.com";

// Port 5432 (direct connection), NOT 6543 (pooler) — pooler causes
// "prepared statement already exists" errors with supabase db push.
const dbUrl = `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${poolerHost}:5432/postgres`;

function findFrontendDir(): string {
  const dir = process.cwd();
  if (fs.existsSync(path.join(dir, "supabase", "migrations"))) return dir;
  const frontendDir = path.join(dir, "frontend");
  if (fs.existsSync(path.join(frontendDir, "supabase", "migrations"))) return frontendDir;
  console.error("Error: Could not find supabase/migrations directory. Run from project root or frontend/.");
  process.exit(1);
}

const frontendDir = findFrontendDir();
console.error(`[Migration] Pushing from: ${frontendDir}/supabase/migrations/`);

const proc = Bun.spawn(["bunx", "supabase", "db", "push", "--include-all", `--db-url=${dbUrl}`], {
  cwd: frontendDir,
  stdout: "pipe",
  stderr: "pipe",
});

const [stdout, stderr] = await Promise.all([
  new Response(proc.stdout).text(),
  new Response(proc.stderr).text(),
]);
const exitCode = await proc.exited;

if (stdout) console.error(stdout);
if (stderr) console.error(stderr);

if (exitCode !== 0) {
  console.error(`supabase db push failed with exit code ${exitCode}`);
  process.exit(1);
}

output({ success: true, message: "Migrations pushed successfully" });

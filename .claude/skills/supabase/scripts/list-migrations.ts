#!/usr/bin/env bun
/**
 * List applied database migrations.
 * Usage: bun run scripts/list-migrations.ts
 */

import { executeRawSql, output } from "./lib.ts";

interface RawMigrationRow {
  version: string;
  name: string;
  statements: string;
}

function formatVersionAsDate(version: string): string {
  if (version.length < 14) return version;
  const y = version.slice(0, 4);
  const mo = version.slice(4, 6);
  const d = version.slice(6, 8);
  const h = version.slice(8, 10);
  const mi = version.slice(10, 12);
  const s = version.slice(12, 14);
  return `${y}-${mo}-${d}T${h}:${mi}:${s}Z`;
}

const query = `
  SELECT version, name, statements
  FROM supabase_migrations.schema_migrations
  ORDER BY version ASC
`;

const rows = await executeRawSql<RawMigrationRow>(query);

output(
  rows.map((row) => ({
    version: row.version,
    name: row.name || `migration_${row.version}`,
    appliedAt: formatVersionAsDate(row.version),
  }))
);

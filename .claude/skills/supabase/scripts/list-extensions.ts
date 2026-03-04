#!/usr/bin/env bun
/**
 * List installed PostgreSQL extensions.
 * Usage: bun run scripts/list-extensions.ts
 */

import { executeRawSql, output } from "./lib.ts";

const query = `
  SELECT extname, extversion, extnamespace::regnamespace::text as schema
  FROM pg_extension
  ORDER BY extname
`;

const rows = await executeRawSql<{ extname: string; extversion: string; schema: string }>(query);

output(
  rows.map((row) => ({
    name: row.extname,
    version: row.extversion,
    schema: row.schema,
  }))
);

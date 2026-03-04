#!/usr/bin/env bun
/**
 * List tables and views in the specified schemas.
 * Usage: bun run scripts/list-tables.ts [--schemas=public,auth]
 */

import { parseArgs, executeRawSql, output } from "./lib.ts";

const args = parseArgs({ schemas: { default: "public" } });

const schemas = args.schemas.split(",").map((s) => s.trim());

const SCHEMA_NAME_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
for (const schema of schemas) {
  if (!SCHEMA_NAME_REGEX.test(schema)) {
    console.error(`Error: Invalid schema name "${schema}".`);
    process.exit(1);
  }
}

const schemaList = schemas.map((s) => `'${s}'`).join(", ");

const query = `
  SELECT table_schema, table_name, table_type
  FROM information_schema.tables
  WHERE table_schema IN (${schemaList})
  ORDER BY table_schema, table_name
`;

const rows = await executeRawSql<{ table_schema: string; table_name: string; table_type: string }>(query);

output(
  rows.map((row) => ({
    schema: row.table_schema,
    name: row.table_name,
    type: row.table_type === "VIEW" ? "view" : "table",
  }))
);

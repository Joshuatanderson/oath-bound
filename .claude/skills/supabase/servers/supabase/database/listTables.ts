import { executeRawSql } from '../../../src/client.ts';
import { assertAllowed } from '../../../src/permissions.ts';
import type { TableInfo } from '../../../src/types.ts';

interface ListTablesOptions {
  schemas?: string[];
}

interface RawTableRow {
  table_schema: string;
  table_name: string;
  table_type: string;
}

const SCHEMA_NAME_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function validateSchemaNames(schemas: string[]): void {
  for (const schema of schemas) {
    if (!SCHEMA_NAME_REGEX.test(schema)) {
      throw new Error(`Invalid schema name: "${schema}". Schema names must start with a letter or underscore and contain only alphanumeric characters and underscores.`);
    }
  }
}

/**
 * Lists all tables and views in the specified schemas.
 * Defaults to 'public' schema if none specified.
 */
export async function listTables(options: ListTablesOptions = {}): Promise<TableInfo[]> {
  assertAllowed('database', 'read');

  const schemas = options.schemas ?? ['public'];

  validateSchemaNames(schemas);

  const schemaList = schemas.map(s => `'${s}'`).join(', ');

  const query = `
    SELECT
      table_schema,
      table_name,
      table_type
    FROM information_schema.tables
    WHERE table_schema IN (${schemaList})
    ORDER BY table_schema, table_name
  `;

  const rows = await executeRawSql<RawTableRow>(query);

  return rows.map(row => ({
    schema: row.table_schema,
    name: row.table_name,
    type: row.table_type === 'VIEW' ? 'view' : 'table',
  }));
}

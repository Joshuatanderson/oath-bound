import { executeRawSql } from '../../../src/client.ts';
import { assertAllowed } from '../../../src/permissions.ts';
import type { ExtensionInfo } from '../../../src/types.ts';

interface RawExtensionRow {
  extname: string;
  extversion: string;
  schema: string;
}

/**
 * Lists all installed PostgreSQL extensions in the database.
 */
export async function listExtensions(): Promise<ExtensionInfo[]> {
  assertAllowed('database', 'read');

  const query = `
    SELECT
      extname,
      extversion,
      extnamespace::regnamespace::text as schema
    FROM pg_extension
    ORDER BY extname
  `;

  const rows = await executeRawSql<RawExtensionRow>(query);

  return rows.map(row => ({
    name: row.extname,
    version: row.extversion,
    schema: row.schema,
  }));
}

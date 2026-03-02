import { executeRawSql } from '../../../src/client.ts';
import { assertAllowed } from '../../../src/permissions.ts';
import type { MigrationInfo } from '../../../src/types.ts';

interface RawMigrationRow {
  version: string;
  name: string;
  statements: string;
}

/**
 * Lists all applied migrations from the supabase_migrations schema.
 */
export async function listMigrations(): Promise<MigrationInfo[]> {
  assertAllowed('database', 'read');

  const query = `
    SELECT
      version,
      name,
      statements
    FROM supabase_migrations.schema_migrations
    ORDER BY version ASC
  `;

  const rows = await executeRawSql<RawMigrationRow>(query);

  return rows.map(row => ({
    version: row.version,
    name: row.name || `migration_${row.version}`,
    appliedAt: formatVersionAsDate(row.version),
  }));
}

function formatVersionAsDate(version: string): string {
  if (version.length < 14) {
    return version;
  }

  const year = version.slice(0, 4);
  const month = version.slice(4, 6);
  const day = version.slice(6, 8);
  const hour = version.slice(8, 10);
  const minute = version.slice(10, 12);
  const second = version.slice(12, 14);

  return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
}

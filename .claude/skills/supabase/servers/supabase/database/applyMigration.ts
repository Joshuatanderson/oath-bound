import { managementApiRequest, getProjectRef } from '../../../src/client.ts';
import { assertAllowed } from '../../../src/permissions.ts';

interface ApplyMigrationOptions {
  name: string;  // snake_case name
  query: string; // SQL DDL statements
}

interface ApplyMigrationResult {
  version: string;
  name: string;
  success: boolean;
}

function validateMigrationName(name: string): void {
  const snakeCaseRegex = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

  if (!name || name.trim().length === 0) {
    throw new Error('Migration name cannot be empty');
  }

  if (!snakeCaseRegex.test(name)) {
    throw new Error(
      `Migration name must be in snake_case format (e.g., "add_users_table"). Got: "${name}"`
    );
  }
}

export async function applyMigration(
  options: ApplyMigrationOptions
): Promise<ApplyMigrationResult> {
  const { name, query } = options;

  validateMigrationName(name);

  if (!query || query.trim().length === 0) {
    throw new Error('Migration query cannot be empty');
  }

  assertAllowed('database', 'write');

  const projectRef = getProjectRef();

  await managementApiRequest<unknown>(
    `/projects/${projectRef}/database/query`,
    {
      method: 'POST',
      body: JSON.stringify({ query }),
    }
  );

  const version = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);

  return {
    version,
    name,
    success: true,
  };
}

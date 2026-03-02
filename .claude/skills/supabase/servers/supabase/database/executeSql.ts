import { executeRawSql } from '../../../src/client.ts';
import { assertAllowed, analyzeQueryRisk } from '../../../src/permissions.ts';

interface ExecuteSqlOptions {
  query: string;
}

interface ExecuteSqlResult<T> {
  rows: T[];
  riskLevel: 'read' | 'write' | 'destructive';
}

/**
 * Executes arbitrary SQL queries with automatic permission checking.
 */
export async function executeSql<T = Record<string, unknown>>(
  options: ExecuteSqlOptions
): Promise<ExecuteSqlResult<T>> {
  const { query } = options;

  if (!query || query.trim().length === 0) {
    throw new Error('Query cannot be empty');
  }

  const riskLevel = analyzeQueryRisk(query);
  assertAllowed('database', riskLevel);

  const rows = await executeRawSql<T>(query);

  return {
    rows,
    riskLevel,
  };
}

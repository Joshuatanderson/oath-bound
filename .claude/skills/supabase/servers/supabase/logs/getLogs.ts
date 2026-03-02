import { managementApiRequest, getProjectRef } from '../../../src/client.ts';
import { assertAllowed } from '../../../src/permissions.ts';
import type { LogEntry, LogService } from '../../../src/types.ts';

interface GetLogsOptions {
  service: LogService;
}

interface RawLogEntry {
  id?: string;
  timestamp: string;
  event_message: string;
  metadata?: Record<string, unknown>;
}

interface LogsResponse {
  result: RawLogEntry[];
}

/**
 * Gets logs for the Supabase project by service type.
 * Returns logs within the last 24 hours.
 */
export async function getLogs(options: GetLogsOptions): Promise<LogEntry[]> {
  const { service } = options;

  assertAllowed('logs', 'read');

  const projectRef = getProjectRef();

  const query = buildLogQuery(service);

  const now = new Date();
  const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const isoStart = start.toISOString();
  const isoEnd = now.toISOString();

  const url = `/projects/${projectRef}/analytics/endpoints/logs.all?sql=${encodeURIComponent(query)}&iso_timestamp_start=${encodeURIComponent(isoStart)}&iso_timestamp_end=${encodeURIComponent(isoEnd)}`;

  const response = await managementApiRequest<LogsResponse>(url);

  return (response.result || []).map(entry => ({
    id: entry.id || crypto.randomUUID(),
    timestamp: entry.timestamp,
    eventMessage: entry.event_message,
    metadata: entry.metadata || {},
  }));
}

function buildLogQuery(service: LogService): string {
  const tableMap: Record<LogService, string> = {
    'api': 'edge_logs',
    'branch-action': 'edge_logs',
    'postgres': 'postgres_logs',
    'edge-function': 'function_logs',
    'auth': 'auth_logs',
    'storage': 'storage_logs',
    'realtime': 'realtime_logs',
  };

  const tableName = tableMap[service] || 'edge_logs';

  return `
    SELECT id, timestamp, event_message
    FROM ${tableName}
    ORDER BY timestamp DESC
    LIMIT 100
  `.trim();
}

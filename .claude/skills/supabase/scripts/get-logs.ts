#!/usr/bin/env bun
/**
 * Get project logs by service type.
 * Usage: bun run scripts/get-logs.ts --service=postgres [--hours=24]
 */

import { parseArgs, managementApi, getProjectRef, output } from "./lib.ts";

const VALID_SERVICES = ["api", "branch-action", "postgres", "edge-function", "auth", "storage", "realtime"] as const;

const args = parseArgs({
  service: { required: true },
  hours: { default: "24" },
});

if (!VALID_SERVICES.includes(args.service as any)) {
  console.error(`Error: --service must be one of: ${VALID_SERVICES.join(", ")}`);
  process.exit(1);
}

const tableMap: Record<string, string> = {
  api: "edge_logs",
  "branch-action": "edge_logs",
  postgres: "postgres_logs",
  "edge-function": "function_logs",
  auth: "auth_logs",
  storage: "storage_logs",
  realtime: "realtime_logs",
};

const tableName = tableMap[args.service] ?? "edge_logs";
const logQuery = `SELECT id, timestamp, event_message FROM ${tableName} ORDER BY timestamp DESC LIMIT 100`;

const hours = parseInt(args.hours) || 24;
const now = new Date();
const start = new Date(now.getTime() - hours * 60 * 60 * 1000);

const ref = getProjectRef();
const url = `/projects/${ref}/analytics/endpoints/logs.all?sql=${encodeURIComponent(logQuery)}&iso_timestamp_start=${encodeURIComponent(start.toISOString())}&iso_timestamp_end=${encodeURIComponent(now.toISOString())}`;

interface LogsResponse {
  result: Array<{
    id?: string;
    timestamp: string;
    event_message: string;
    metadata?: Record<string, unknown>;
  }>;
}

const response = await managementApi<LogsResponse>(url);

output(
  (response.result || []).map((entry) => ({
    id: entry.id || crypto.randomUUID(),
    timestamp: entry.timestamp,
    eventMessage: entry.event_message,
    metadata: entry.metadata || {},
  }))
);

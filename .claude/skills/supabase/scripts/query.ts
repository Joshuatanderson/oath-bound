#!/usr/bin/env bun
/**
 * Execute SQL queries against the Supabase database.
 * Usage: bun run scripts/query.ts --sql="SELECT * FROM users LIMIT 5"
 */

import { parseArgs, executeRawSql, analyzeQueryRisk, assertAllowed, output } from "./lib.ts";

const args = parseArgs({ sql: { required: true } });

const riskLevel = analyzeQueryRisk(args.sql);
assertAllowed(riskLevel);

const result = await executeRawSql(args.sql);
output({ riskLevel, result });

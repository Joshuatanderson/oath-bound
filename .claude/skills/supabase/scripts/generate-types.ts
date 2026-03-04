#!/usr/bin/env bun
/**
 * Generate TypeScript types from the database schema.
 * Usage: bun run scripts/generate-types.ts [--output=path/to/database.types.ts]
 */

import * as fs from "fs";
import { parseArgs, managementApi, getProjectRef, output } from "./lib.ts";

const args = parseArgs({ output: {} });

const ref = getProjectRef();
const response = await managementApi<{ types: string }>(`/projects/${ref}/types/typescript`);

if (args.output) {
  fs.writeFileSync(args.output, response.types, "utf-8");
  output({ written: args.output, length: response.types.length });
} else {
  // Print raw types to stdout for piping
  console.log(response.types);
}

#!/usr/bin/env bun
/**
 * Get security or performance advisories for the project.
 * Usage: bun run scripts/get-advisors.ts --type=security
 */

import { parseArgs, managementApi, getProjectRef, output } from "./lib.ts";

const args = parseArgs({ type: { required: true } });

if (args.type !== "security" && args.type !== "performance") {
  console.error("Error: --type must be 'security' or 'performance'");
  process.exit(1);
}

const ref = getProjectRef();

interface RawAdvisory {
  name: string;
  title: string;
  description: string;
  level: string;
  remediation_url?: string;
}

const response = await managementApi<Record<string, RawAdvisory[]>>(
  `/projects/${ref}/advisors/${args.type}`
);

const severityMap: Record<string, string> = {
  INFO: "low",
  WARN: "medium",
  ERROR: "high",
  CRITICAL: "critical",
};

const allAdvisories = Object.values(response).flat();

output(
  allAdvisories.map((a) => ({
    type: args.type,
    title: a.title || a.name,
    description: a.description,
    severity: severityMap[a.level] ?? "medium",
    remediationUrl: a.remediation_url,
  }))
);

/**
 * Shared utilities for Supabase skill scripts.
 * All Management API calls use native fetch() — no dependencies required.
 */

const MANAGEMENT_API_BASE = "https://api.supabase.com/v1";
const DOCS_GRAPHQL_ENDPOINT = "https://supabase.com/docs/api/graphql";

// --- Environment ---

export function getEnv(key: string, required = true): string {
  const value = process.env[key];
  if (!value && required) {
    console.error(`Error: ${key} is not set. Add it to your .env file.`);
    process.exit(1);
  }
  return value ?? "";
}

export function getProjectRef(): string {
  return getEnv("SUPABASE_PROJECT_REF");
}

export function getAccountToken(): string {
  return getEnv("SUPABASE_ACCOUNT_TOKEN");
}

// --- Fetch helpers ---

export async function managementApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAccountToken();
  const url = `${MANAGEMENT_API_BASE}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Management API error (${response.status}): ${errorText}`);
    process.exit(1);
  }

  return response.json();
}

export async function managementApiMultipart<T>(
  endpoint: string,
  formData: FormData,
  method: "POST" | "PATCH" = "POST"
): Promise<T> {
  const token = getAccountToken();
  const url = `${MANAGEMENT_API_BASE}${endpoint}`;

  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Management API error (${response.status}): ${errorText}`);
    process.exit(1);
  }

  return response.json();
}

export async function executeRawSql<T>(query: string): Promise<T[]> {
  const ref = getProjectRef();
  return managementApi<T[]>(`/projects/${ref}/database/query`, {
    method: "POST",
    body: JSON.stringify({ query }),
  });
}

export async function docsGraphql<T>(query: string): Promise<T> {
  const response = await fetch(DOCS_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Docs GraphQL API error (${response.status}): ${errorText}`);
    process.exit(1);
  }

  const result = await response.json();

  if (result.errors?.length > 0) {
    const messages = result.errors.map((e: { message: string }) => e.message).join(", ");
    console.error(`GraphQL errors: ${messages}`);
    process.exit(1);
  }

  return result;
}

// --- Risk analysis & permissions ---

export type RiskLevel = "read" | "write" | "destructive";

export function analyzeQueryRisk(query: string): RiskLevel {
  const normalized = query.toUpperCase().trim();

  const destructivePatterns = [
    /DROP\s+(TABLE|DATABASE|SCHEMA|INDEX|VIEW|FUNCTION|POLICY)/i,
    /TRUNCATE/i,
    /DELETE\s+FROM\s+\w+\s*(;|$)/i,
    /ALTER\s+TABLE\s+\w+\s+DROP/i,
  ];

  for (const pattern of destructivePatterns) {
    if (pattern.test(normalized)) return "destructive";
  }

  const writePatterns = [
    /INSERT\s+INTO/i,
    /UPDATE\s+\w+\s+SET/i,
    /DELETE\s+FROM/i,
    /CREATE\s+(TABLE|INDEX|VIEW|FUNCTION|SCHEMA)/i,
    /ALTER\s+TABLE/i,
    /GRANT/i,
    /REVOKE/i,
  ];

  for (const pattern of writePatterns) {
    if (pattern.test(normalized)) return "write";
  }

  return "read";
}

export function assertAllowed(riskLevel: RiskLevel): void {
  if (riskLevel === "read") return;

  if (riskLevel === "write") {
    const allowed = getEnv("SUPABASE_ALLOW_WRITE", false);
    if (allowed !== "true") {
      console.error(
        `BLOCKED: Write operation denied. Set SUPABASE_ALLOW_WRITE=true to enable.`
      );
      process.exit(1);
    }
  }

  if (riskLevel === "destructive") {
    const allowWrite = getEnv("SUPABASE_ALLOW_WRITE", false);
    const allowDestructive = getEnv("SUPABASE_ALLOW_DESTRUCTIVE", false);
    if (allowWrite !== "true" || allowDestructive !== "true") {
      console.error(
        `BLOCKED: Destructive operation denied. Set SUPABASE_ALLOW_WRITE=true and SUPABASE_ALLOW_DESTRUCTIVE=true to enable.`
      );
      process.exit(1);
    }
  }
}

// --- Arg parsing ---

interface ArgDef {
  required?: boolean;
  default?: string;
}

export function parseArgs(defs: Record<string, ArgDef>): Record<string, string> {
  const args = process.argv.slice(2);
  const result: Record<string, string> = {};

  for (const arg of args) {
    const eqIndex = arg.indexOf("=");
    if (arg.startsWith("--") && eqIndex > 2) {
      const key = arg.slice(2, eqIndex);
      result[key] = arg.slice(eqIndex + 1);
    }
  }

  for (const [key, def] of Object.entries(defs)) {
    if (!result[key]) {
      if (def.default !== undefined) {
        result[key] = def.default;
      } else if (def.required) {
        console.error(`Error: --${key} is required`);
        process.exit(1);
      }
    }
  }

  return result;
}

// --- Output ---

export function output(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

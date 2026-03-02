import { PermissionConfig, PermissionCategory, QueryRiskLevel } from './types.ts';
import { getCurrentEnvironment } from './environments.ts';

const DEFAULT_ALLOWED_CATEGORIES: PermissionCategory[] = [
  'database',
  'docs',
  'logs',
  'config',
  'advisors',
  'branches',
  'edge-functions',
];

/**
 * Gets permissions for the current environment.
 */
export function getPermissions(): PermissionConfig {
  const env = getCurrentEnvironment();

  return {
    allowedCategories: DEFAULT_ALLOWED_CATEGORIES,
    allowWrite: env.allowWrite,
    allowDestructive: env.allowDestructive,
  };
}

/**
 * Checks if a category is allowed.
 */
export function isCategoryAllowed(category: PermissionCategory): boolean {
  const perms = getPermissions();
  return perms.allowedCategories.includes(category);
}

/**
 * Analyzes a SQL query to determine its risk level.
 */
export function analyzeQueryRisk(query: string): QueryRiskLevel {
  const normalized = query.toUpperCase().trim();

  // Destructive operations
  const destructivePatterns = [
    /DROP\s+(TABLE|DATABASE|SCHEMA|INDEX|VIEW|FUNCTION|POLICY)/i,
    /TRUNCATE/i,
    /DELETE\s+FROM\s+\w+\s*(;|$)/i, // DELETE without WHERE
    /ALTER\s+TABLE\s+\w+\s+DROP/i,
  ];

  for (const pattern of destructivePatterns) {
    if (pattern.test(normalized)) {
      return 'destructive';
    }
  }

  // Write operations
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
    if (pattern.test(normalized)) {
      return 'write';
    }
  }

  return 'read';
}

/**
 * Validates if an operation is allowed based on current environment permissions.
 */
export function validateOperation(
  category: PermissionCategory,
  riskLevel: QueryRiskLevel = 'read'
): { allowed: boolean; reason?: string } {
  const perms = getPermissions();
  const env = getCurrentEnvironment();

  if (!perms.allowedCategories.includes(category)) {
    return {
      allowed: false,
      reason: `Category '${category}' is not in the allowed list: ${perms.allowedCategories.join(', ')}`,
    };
  }

  if (riskLevel === 'write' && !perms.allowWrite) {
    return {
      allowed: false,
      reason: `Write operations are BLOCKED on ${env.name}.`,
    };
  }

  if (riskLevel === 'destructive' && !perms.allowDestructive) {
    return {
      allowed: false,
      reason: `Destructive operations are BLOCKED on ${env.name}.`,
    };
  }

  return { allowed: true };
}

/**
 * Permission error class for typed error handling.
 */
export class PermissionError extends Error {
  constructor(message: string) {
    super(`Permission denied: ${message}`);
    this.name = 'PermissionError';
  }
}

/**
 * Asserts that an operation is allowed, throws PermissionError if not.
 */
export function assertAllowed(
  category: PermissionCategory,
  riskLevel: QueryRiskLevel = 'read'
): void {
  const result = validateOperation(category, riskLevel);
  if (!result.allowed) {
    throw new PermissionError(result.reason ?? 'Operation not allowed');
  }
}

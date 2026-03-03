/**
 * Environment configuration for Supabase project.
 * Single environment with full access.
 */

export interface EnvironmentConfig {
  readonly projectRef: string;
  readonly allowWrite: boolean;
  readonly allowDestructive: boolean;
  readonly name: string;
}

export const ENVIRONMENT: EnvironmentConfig = Object.freeze({
  projectRef: "mjnfqagwuewhgwbtrdgs",
  allowWrite: true,
  allowDestructive: true,
  name: "Oathbound",
});

export function getCurrentEnvironment(): EnvironmentConfig {
  return ENVIRONMENT;
}

export function getProjectRef(): string {
  return ENVIRONMENT.projectRef;
}

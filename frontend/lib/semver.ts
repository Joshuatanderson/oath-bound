const SEMVER_RE = /^\d+\.\d+\.\d+$/;

export interface SemverParts {
  major: number;
  minor: number;
  patch: number;
}

/** Parse a semver string into parts. Returns null if invalid. */
export function parseSemver(version: string): SemverParts | null {
  if (!SEMVER_RE.test(version)) return null;
  const [major, minor, patch] = version.split(".").map(Number);
  return { major, minor, patch };
}

/** Validate a semver string (MAJOR.MINOR.PATCH). */
export function isValidSemver(version: string): boolean {
  return SEMVER_RE.test(version);
}

/**
 * Compare two semver strings.
 * Returns negative if a < b, 0 if equal, positive if a > b.
 */
export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) throw new Error(`Invalid semver: ${!pa ? a : b}`);
  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  return pa.patch - pb.patch;
}

/** Bump the patch version: "1.2.3" -> "1.2.4" */
export function bumpPatch(version: string): string {
  const parts = parseSemver(version);
  if (!parts) throw new Error(`Invalid semver: ${version}`);
  return `${parts.major}.${parts.minor}.${parts.patch + 1}`;
}

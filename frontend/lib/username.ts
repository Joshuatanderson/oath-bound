/** Must start with a letter, 3-64 chars, lowercase alphanumeric + hyphens */
export const USERNAME_RE = /^[a-z][a-z0-9-]{2,63}$/;

/** Normalise and validate a raw username input. Returns the cleaned username or null if invalid. */
export function validateUsername(raw: string): string | null {
  const cleaned = raw.trim().toLowerCase();
  return USERNAME_RE.test(cleaned) ? cleaned : null;
}

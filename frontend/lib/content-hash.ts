import { createHash } from "crypto";

/** Files/patterns excluded from content hashing (not meaningful for integrity). */
const EXCLUDED = new Set([
  "node_modules",
  "bun.lock",
  "package-lock.json",
  "yarn.lock",
  ".DS_Store",
]);

function isExcluded(relativePath: string): boolean {
  const parts = relativePath.split("/");
  return parts.some((p) => EXCLUDED.has(p));
}

/**
 * Compute a deterministic content hash for a set of files.
 *
 * Algorithm:
 *   1. Filter out excluded paths
 *   2. Sort files by relative path
 *   3. For each file: `relativePath \0 sha256(content)`
 *   4. Join lines with `\n`, sha256 the result
 */
export function contentHash(
  files: { path: string; content: string | Buffer }[]
): string {
  const filtered = files.filter((f) => !isExcluded(f.path));
  const sorted = filtered.toSorted((a, b) => a.path.localeCompare(b.path));

  const lines = sorted.map((f) => {
    const fileHash = createHash("sha256")
      .update(typeof f.content === "string" ? f.content : f.content)
      .digest("hex");
    return `${f.path}\0${fileHash}`;
  });

  return createHash("sha256").update(lines.join("\n")).digest("hex");
}

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const HASH_EXCLUDED = new Set([
  'node_modules',
  'bun.lock',
  'package-lock.json',
  'yarn.lock',
  '.DS_Store',
]);

export function collectFiles(dir: string, base: string = dir): { path: string; content: Buffer }[] {
  const results: { path: string; content: Buffer }[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (HASH_EXCLUDED.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(full, base));
    } else if (entry.isFile()) {
      results.push({ path: relative(base, full), content: readFileSync(full) });
    }
  }
  return results;
}

export function contentHash(files: { path: string; content: Buffer }[]): string {
  const sorted = files.toSorted((a, b) => a.path.localeCompare(b.path));
  const lines = sorted.map((f) => {
    const h = createHash('sha256').update(f.content).digest('hex');
    return `${f.path}\0${h}`;
  });
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

export function hashSkillDir(skillDir: string): string {
  const files = collectFiles(skillDir);
  return contentHash(files);
}

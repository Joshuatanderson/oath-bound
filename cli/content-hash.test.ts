/**
 * Parity test: verifies the CLI content hash matches the frontend content hash
 * for the same set of files.
 *
 * Run: bun test cli/content-hash.test.ts
 */
import { test, expect } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { readdirSync, readFileSync, statSync } from 'node:fs';

// --- Inline both algorithms so the test is self-contained ---

// Frontend algorithm (content-hash.ts) — operates on {path, content: string}
const EXCLUDED = new Set(['node_modules', 'bun.lock', 'package-lock.json', 'yarn.lock', '.DS_Store']);

function frontendIsExcluded(relativePath: string): boolean {
  return relativePath.split('/').some((p) => EXCLUDED.has(p));
}

function frontendContentHash(files: { path: string; content: string }[]): string {
  const filtered = files.filter((f) => !frontendIsExcluded(f.path));
  const sorted = filtered.toSorted((a, b) => a.path.localeCompare(b.path));
  const lines = sorted.map((f) => {
    const fileHash = createHash('sha256').update(f.content).digest('hex');
    return `${f.path}\0${fileHash}`;
  });
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

// CLI algorithm (cli.ts) — operates on {path, content: Buffer} from disk
function cliCollectFiles(dir: string, base: string = dir): { path: string; content: Buffer }[] {
  const results: { path: string; content: Buffer }[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDED.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...cliCollectFiles(full, base));
    } else if (entry.isFile()) {
      results.push({ path: relative(base, full), content: readFileSync(full) });
    }
  }
  return results;
}

function cliContentHash(files: { path: string; content: Buffer }[]): string {
  const sorted = files.toSorted((a, b) => a.path.localeCompare(b.path));
  const lines = sorted.map((f) => {
    const h = createHash('sha256').update(f.content).digest('hex');
    return `${f.path}\0${h}`;
  });
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

// --- Tests ---

test('single file produces same hash from both algorithms', () => {
  const files = [{ path: 'SKILL.md', content: '# Hello\nThis is a skill.' }];

  const frontendHash = frontendContentHash(files);

  // Write to disk and hash with CLI algorithm
  const tmp = mkdtempSync(join(tmpdir(), 'oathbound-test-'));
  writeFileSync(join(tmp, 'SKILL.md'), '# Hello\nThis is a skill.');
  const cliHash = cliContentHash(cliCollectFiles(tmp));
  rmSync(tmp, { recursive: true });

  expect(frontendHash).toBe(cliHash);
});

test('multiple files with subdirectories produce same hash', () => {
  const files = [
    { path: 'SKILL.md', content: '---\nname: test\n---\nBody content' },
    { path: 'scripts/helper.sh', content: '#!/bin/bash\necho hello' },
    { path: 'references/data.json', content: '{"key": "value"}' },
  ];

  const frontendHash = frontendContentHash(files);

  const tmp = mkdtempSync(join(tmpdir(), 'oathbound-test-'));
  mkdirSync(join(tmp, 'scripts'));
  mkdirSync(join(tmp, 'references'));
  writeFileSync(join(tmp, 'SKILL.md'), files[0].content);
  writeFileSync(join(tmp, 'scripts/helper.sh'), files[1].content);
  writeFileSync(join(tmp, 'references/data.json'), files[2].content);
  const cliHash = cliContentHash(cliCollectFiles(tmp));
  rmSync(tmp, { recursive: true });

  expect(frontendHash).toBe(cliHash);
});

test('excluded files are ignored by both algorithms', () => {
  const filesWithExcluded = [
    { path: 'SKILL.md', content: 'content' },
    { path: '.DS_Store', content: 'junk' },
    { path: 'node_modules/foo/index.js', content: 'module code' },
    { path: 'bun.lock', content: 'lockfile' },
  ];

  const filesWithout = [{ path: 'SKILL.md', content: 'content' }];

  const hashWith = frontendContentHash(filesWithExcluded);
  const hashWithout = frontendContentHash(filesWithout);

  expect(hashWith).toBe(hashWithout);

  // Also verify CLI side ignores them on disk
  const tmp = mkdtempSync(join(tmpdir(), 'oathbound-test-'));
  writeFileSync(join(tmp, 'SKILL.md'), 'content');
  writeFileSync(join(tmp, '.DS_Store'), 'junk');
  writeFileSync(join(tmp, 'bun.lock'), 'lockfile');
  mkdirSync(join(tmp, 'node_modules', 'foo'), { recursive: true });
  writeFileSync(join(tmp, 'node_modules/foo/index.js'), 'module code');

  const cliHash = cliContentHash(cliCollectFiles(tmp));
  rmSync(tmp, { recursive: true });

  expect(cliHash).toBe(hashWithout);
});

test('file order does not affect hash (deterministic sort)', () => {
  const filesA = [
    { path: 'b.txt', content: 'B' },
    { path: 'a.txt', content: 'A' },
  ];
  const filesB = [
    { path: 'a.txt', content: 'A' },
    { path: 'b.txt', content: 'B' },
  ];

  expect(frontendContentHash(filesA)).toBe(frontendContentHash(filesB));
});

test('different content produces different hash', () => {
  const files1 = [{ path: 'SKILL.md', content: 'version 1' }];
  const files2 = [{ path: 'SKILL.md', content: 'version 2' }];

  expect(frontendContentHash(files1)).not.toBe(frontendContentHash(files2));
});

test('empty file set produces consistent hash', () => {
  const hash1 = frontendContentHash([]);
  const hash2 = frontendContentHash([]);
  expect(hash1).toBe(hash2);
});

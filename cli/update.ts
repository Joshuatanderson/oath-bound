import {
  writeFileSync, readFileSync, existsSync, mkdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';
import { TEAL, GREEN, RESET } from './ui';

export function isNewer(remote: string, local: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map(Number);
  const [rMaj, rMin, rPat] = parse(remote);
  const [lMaj, lMin, lPat] = parse(local);
  if (rMaj !== lMaj) return rMaj > lMaj;
  if (rMin !== lMin) return rMin > lMin;
  return rPat > lPat;
}

function getCacheDir(): string {
  if (platform() === 'darwin') {
    return join(homedir(), 'Library', 'Caches', 'oathbound');
  }
  return join(process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'oathbound');
}

function printUpdateBox(current: string, latest: string): void {
  const line = `Update available: ${current} → ${latest}`;
  const install = 'Run: npm install -g oathbound';
  const width = Math.max(line.length, install.length) + 2;
  const pad = (s: string) => s + ' '.repeat(width - s.length);
  process.stderr.write(`\n${TEAL}┌${'─'.repeat(width)}┐${RESET}\n`);
  process.stderr.write(`${TEAL}│${RESET} ${pad(line)}${TEAL}│${RESET}\n`);
  process.stderr.write(`${TEAL}│${RESET} ${pad(install)}${TEAL}│${RESET}\n`);
  process.stderr.write(`${TEAL}└${'─'.repeat(width)}┘${RESET}\n`);
}

export async function checkForUpdate(version: string): Promise<void> {
  const cacheDir = getCacheDir();
  const cacheFile = join(cacheDir, 'update-check.json');

  // Check cache freshness (24h) — invalidate if local version changed
  if (existsSync(cacheFile)) {
    try {
      const cache = JSON.parse(readFileSync(cacheFile, 'utf-8'));
      if (cache.localVersion === version && Date.now() - cache.checkedAt < 86_400_000) {
        if (cache.latestVersion && isNewer(cache.latestVersion, version)) {
          printUpdateBox(version, cache.latestVersion);
        }
        return;
      }
    } catch { /* stale cache, re-check */ }
  }

  // Fetch latest version from npm
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const resp = await fetch(
      'https://registry.npmjs.org/oathbound?fields=dist-tags',
      { signal: controller.signal },
    );
    clearTimeout(timeout);
    if (!resp.ok) return;
    const data = await resp.json() as { 'dist-tags'?: { latest?: string } };
    const latest = data['dist-tags']?.latest;
    if (!latest) return;

    // Write cache
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(cacheFile, JSON.stringify({ checkedAt: Date.now(), latestVersion: latest, localVersion: version }));

    if (!isNewer(latest, version)) return;

    printUpdateBox(version, latest);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`${TEAL}Update check failed: ${msg}${RESET}\n`);
  }
}

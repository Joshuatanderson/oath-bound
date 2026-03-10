import { existsSync, statSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { intro, outro } from '@clack/prompts';
import { BRAND, GREEN, DIM, BOLD, RESET, fail, spinner } from './ui';
import { getAccessToken } from './auth';
import { collectFiles } from './content-hash';

const API_BASE = process.env.OATHBOUND_API_URL ?? 'https://oathbound.ai';

export async function push(pathArg?: string): Promise<void> {
  intro(BRAND);

  // Resolve skill directory
  const skillDir = resolveSkillDir(pathArg);
  console.log(`${DIM}   directory: ${skillDir}${RESET}`);

  // Read and validate SKILL.md exists
  if (!existsSync(join(skillDir, 'SKILL.md'))) {
    fail('No SKILL.md found', `Expected at ${join(skillDir, 'SKILL.md')}`);
  }

  // Collect files
  const rawFiles = collectFiles(skillDir);

  // Parse SKILL.md frontmatter to extract metadata
  const skillMdFile = rawFiles.find(f => f.path === 'SKILL.md');
  if (!skillMdFile) {
    fail('SKILL.md not found in collected files');
  }

  const meta = parseFrontmatter(skillMdFile.content.toString('utf-8'));
  if (!meta.name) {
    fail('SKILL.md frontmatter missing: name');
  }
  if (!meta.description) {
    fail('SKILL.md frontmatter missing: description');
  }
  if (!meta.license) {
    fail('SKILL.md frontmatter missing: license');
  }

  // Build files array with root dir prefix (API expects rootDir/path format)
  const files = rawFiles.map(f => ({
    path: `${meta.name}/${f.path}`,
    content: f.content.toString('utf-8'),
  }));

  console.log(`${DIM}   name: ${meta.name}${RESET}`);
  console.log(`${DIM}   license: ${meta.license}${RESET}`);
  console.log(`${DIM}   ${files.length} file(s)${RESET}`);

  // Authenticate
  const token = await getAccessToken();

  // Push to API
  const spin = spinner('Pushing...');

  const response = await fetch(`${API_BASE}/api/skills`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: meta.name,
      description: meta.description,
      license: meta.license,
      compatibility: meta.compatibility || null,
      allowedTools: meta['allowed-tools'] || null,
      files,
    }),
  });

  spin.stop();

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Unknown error' }));
    const details = Array.isArray(body.details)
      ? '\n' + body.details.map((d: string) => `   - ${d}`).join('\n')
      : '';
    fail(`Push failed (${response.status})`, `${body.error}${details}`);
  }

  const result = await response.json();

  outro(`${GREEN}✓ Published ${BOLD}${result.namespace}/${result.name}${RESET}`);
  if (result.suiObjectId) {
    console.log(`${DIM}   on-chain: ${result.suiObjectId}${RESET}`);
  }
}

function resolveSkillDir(pathArg?: string): string {
  if (pathArg) {
    const resolved = resolve(pathArg);
    if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
      fail('Invalid path', `${resolved} is not a directory`);
    }
    return resolved;
  }

  // No path given — check if cwd has a SKILL.md
  if (existsSync(join(process.cwd(), 'SKILL.md'))) {
    return process.cwd();
  }

  fail(
    'No skill directory found',
    'Run from within a skill directory or pass a path: oathbound push ./my-skill',
  );
}

/** Lightweight frontmatter parser (mirrors frontend/lib/skill-validator.ts) */
function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!match) return {};

  const meta: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) meta[key] = value;
  }
  return meta;
}

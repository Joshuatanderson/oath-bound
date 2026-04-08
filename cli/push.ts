import { existsSync, statSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { intro, outro } from '@clack/prompts';
import { parse as yamlParse } from 'yaml';
import { BRAND, GREEN, DIM, BOLD, RESET, fail, spinner } from './ui';
import { getAccessToken } from './auth';
import { collectFiles } from './content-hash';
import { isValidSemver } from './semver';

import { API_BASE } from './constants';

export async function push(pathArg?: string, options?: { private?: boolean }): Promise<void> {
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
  const name = String(meta.name ?? '');
  const description = String(meta.description ?? '');
  const license = String(meta.license ?? '');
  const rawVersion = meta.version != null ? String(meta.version) : null;
  const version = rawVersion && isValidSemver(rawVersion) ? rawVersion : null;
  if (!name) fail('SKILL.md frontmatter missing: name');
  if (!description) fail('SKILL.md frontmatter missing: description');
  if (!license) fail('SKILL.md frontmatter missing: license');

  const oathboundMeta = (meta.metadata as Record<string, unknown> | undefined)?.oathbound as Record<string, unknown> | undefined;
  const originalAuthor = String(oathboundMeta?.['original-author'] ?? '');

  // Build files array with root dir prefix (API expects rootDir/path format)
  const files = rawFiles.map(f => ({
    path: `${name}/${f.path}`,
    content: f.content.toString('utf-8'),
  }));

  console.log(`${DIM}   name: ${name}${RESET}`);
  console.log(`${DIM}   version: ${version ?? 'auto (next)'}${RESET}`);
  console.log(`${DIM}   license: ${license}${RESET}`);
  if (originalAuthor) {
    console.log(`${DIM}   original author: ${originalAuthor}${RESET}`);
  }
  const visibility = options?.private ? 'private' : 'public';
  if (options?.private) {
    console.log(`${DIM}   visibility: ${BOLD}private${RESET}`);
  }
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
      name,
      description,
      license,
      version,
      compatibility: String(meta.compatibility ?? '') || null,
      allowedTools: String(meta['allowed-tools'] ?? '') || null,
      originalAuthor: originalAuthor || null,
      visibility,
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

  outro(`${GREEN}✓ Published ${BOLD}${result.namespace}/${result.name}${RESET}${GREEN} v${result.version}${RESET}`);
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

/** Parse YAML frontmatter into a nested object */
function parseFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!match) return {};
  const parsed = yamlParse(match[1]);
  return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {};
}

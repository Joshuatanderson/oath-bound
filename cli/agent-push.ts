import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { intro, outro } from '@clack/prompts';
import { parse as yamlParse } from 'yaml';
import { BRAND, GREEN, DIM, BOLD, RESET, fail, spinner } from './ui';
import { getAccessToken } from './auth';
import { isValidSemver } from './semver';

import { API_BASE } from './constants';

/** Parse YAML frontmatter from an agent .md file. */
function parseAgentFrontmatter(content: string): {
  meta: Record<string, unknown>;
  body: string;
} {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };
  const parsed = yamlParse(match[1]);
  const meta: Record<string, unknown> =
    parsed && typeof parsed === 'object' ? parsed : {};
  return { meta, body: match[2] };
}

/** Resolve agent .md file path from user argument or auto-detect. */
function resolveAgentFile(pathArg?: string): string {
  if (pathArg) {
    const resolved = resolve(pathArg);
    if (!existsSync(resolved)) {
      fail('File not found', resolved);
    }
    if (statSync(resolved).isDirectory()) {
      // Look for a single .md file with agent frontmatter in the directory
      return findAgentInDir(resolved);
    }
    if (!resolved.endsWith('.md')) {
      fail('Invalid file', 'Agent files must be .md files');
    }
    return resolved;
  }

  // No path — look in cwd for a single .md with agent frontmatter
  return findAgentInDir(process.cwd());
}

/** Find a single agent .md file in a directory. */
function findAgentInDir(dir: string): string {
  const mdFiles = readdirSync(dir)
    .filter(f => f.endsWith('.md') && !f.startsWith('.'))
    .map(f => join(dir, f));

  const agents: string[] = [];
  for (const file of mdFiles) {
    try {
      const content = readFileSync(file, 'utf-8');
      const { meta, body } = parseAgentFrontmatter(content);
      if (meta.name && meta.description && body.trim()) {
        agents.push(file);
      }
    } catch {
      // Skip unreadable files
    }
  }

  if (agents.length === 0) {
    fail(
      'No agent file found',
      'Run from a directory with an agent .md file, or pass a path: oathbound agent push ./my-agent.md',
    );
  }

  if (agents.length > 1) {
    fail(
      'Multiple agent files found',
      `Found ${agents.length} .md files with agent frontmatter. Specify which one: oathbound agent push ./file.md`,
    );
  }

  return agents[0];
}

export async function agentPush(pathArg?: string, options?: { private?: boolean }): Promise<void> {
  intro(BRAND);

  const agentFile = resolveAgentFile(pathArg);
  const content = readFileSync(agentFile, 'utf-8');
  const { meta, body } = parseAgentFrontmatter(content);

  // Validate required fields
  const name = String(meta.name ?? '');
  const description = String(meta.description ?? '');
  const license = String(meta.license ?? '');
  if (!name) fail('Frontmatter missing: name');
  if (!description) fail('Frontmatter missing: description');
  if (!license) fail('Frontmatter missing: license');
  if (!body.trim()) fail('No system prompt (markdown body) after frontmatter');

  const rawVersion = meta.version != null ? String(meta.version) : null;
  const version = rawVersion && isValidSemver(rawVersion) ? rawVersion : null;

  console.log(`${DIM}   file: ${agentFile}${RESET}`);
  console.log(`${DIM}   name: ${name}${RESET}`);
  console.log(`${DIM}   version: ${version ?? 'auto (next)'}${RESET}`);
  console.log(`${DIM}   license: ${license}${RESET}`);
  if (meta.model) console.log(`${DIM}   model: ${meta.model}${RESET}`);
  if (meta.permissionMode) console.log(`${DIM}   permissionMode: ${meta.permissionMode}${RESET}`);

  const visibility = options?.private ? 'private' : 'public';
  if (options?.private) {
    console.log(`${DIM}   visibility: ${BOLD}private${RESET}`);
  }

  // Authenticate
  const token = await getAccessToken();

  // Build request body
  const requestBody: Record<string, unknown> = {
    name,
    description,
    license,
    version,
    systemPrompt: body,
    tools: meta.tools != null ? String(meta.tools) : null,
    disallowedTools: meta.disallowedTools != null ? String(meta.disallowedTools) : null,
    model: meta.model != null ? String(meta.model) : null,
    permissionMode: meta.permissionMode != null ? String(meta.permissionMode) : null,
    maxTurns: meta.maxTurns != null ? Number(meta.maxTurns) : null,
    memoryScope: meta.memory != null ? String(meta.memory) : null,
    background: meta.background != null ? Boolean(meta.background) : null,
    effort: meta.effort != null ? String(meta.effort) : null,
    isolation: meta.isolation != null ? String(meta.isolation) : null,
    config: {
      hooks: meta.hooks ?? null,
      mcpServers: meta.mcpServers ?? null,
      skillsRefs: Array.isArray(meta.skills) ? meta.skills : null,
      initialPrompt: meta.initialPrompt != null ? String(meta.initialPrompt) : null,
    },
    compatibility: meta.compatibility != null ? String(meta.compatibility) : null,
    originalAuthor: meta['original-author'] != null ? String(meta['original-author']) : null,
    visibility,
  };

  // Push to API
  const spin = spinner('Pushing...');

  const response = await fetch(`${API_BASE}/api/agents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(requestBody),
  });

  spin.stop();

  if (!response.ok) {
    const resBody = await response.json().catch(() => ({ error: 'Unknown error' }));
    const details = Array.isArray(resBody.details)
      ? '\n' + resBody.details.map((d: string) => `   - ${d}`).join('\n')
      : '';
    fail(`Push failed (${response.status})`, `${resBody.error}${details}`);
  }

  const result = await response.json();

  outro(`${GREEN}✓ Published ${BOLD}${result.namespace}/${result.name}${RESET}${GREEN} v${result.version}${RESET}`);
  if (result.suiObjectId) {
    console.log(`${DIM}   on-chain: ${result.suiObjectId}${RESET}`);
  }
}

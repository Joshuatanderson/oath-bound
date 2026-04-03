import {
  writeFileSync, readFileSync, existsSync, mkdirSync,
} from 'node:fs';
import { join } from 'node:path';

export type EnforcementLevel = 'warn' | 'registered' | 'audited';

/** Strip // line comments from JSONC, preserving // inside strings. */
export function stripJsoncComments(text: string): string {
  let result = '';
  let i = 0;
  while (i < text.length) {
    // String literal — copy through, respecting escapes
    if (text[i] === '"') {
      result += '"';
      i++;
      while (i < text.length && text[i] !== '"') {
        if (text[i] === '\\') { result += text[i++]; } // escape char
        if (i < text.length) { result += text[i++]; }
      }
      if (i < text.length) { result += text[i++]; } // closing "
      continue;
    }
    // Line comment
    if (text[i] === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }
    result += text[i++];
  }
  return result;
}

export function readOathboundConfig(): { enforcement: EnforcementLevel } | null {
  const configPath = join(process.cwd(), '.oathbound.jsonc');
  if (!existsSync(configPath)) return null;
  try {
    const raw = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(stripJsoncComments(raw));
    const level = parsed.enforcement;
    if (level === 'warn' || level === 'registered' || level === 'audited') {
      return { enforcement: level };
    }
    return { enforcement: 'warn' };
  } catch {
    return null;
  }
}

export function writeOathboundConfig(enforcement: EnforcementLevel): boolean {
  const configPath = join(process.cwd(), '.oathbound.jsonc');
  if (existsSync(configPath)) return false;
  const content = `// Oathbound project configuration
// Docs: https://oathbound.ai/docs/config
{
  "$schema": "https://oathbound.ai/schemas/config-v1.json",
  "version": 1,
  "enforcement": "${enforcement}",
  "org": null
}
`;
  writeFileSync(configPath, content);
  return true;
}

const SKILL_CHECK = { type: 'command', command: 'npx oathbound verify --check' };

const OATHBOUND_HOOKS = {
  SessionStart: [
    { matcher: '', hooks: [{ type: 'command', command: 'npx oathbound verify' }] },
  ],
  PreToolUse: [
    { matcher: 'Skill', hooks: [SKILL_CHECK] },
    { matcher: 'Bash', hooks: [SKILL_CHECK] },
    { matcher: 'Read', hooks: [SKILL_CHECK] },
    { matcher: 'Glob', hooks: [SKILL_CHECK] },
    { matcher: 'Grep', hooks: [SKILL_CHECK] },
  ],
};

export function hasOathboundHooks(settings: Record<string, unknown>): boolean {
  const hooks = settings.hooks as Record<string, unknown[]> | undefined;
  if (!hooks) return false;
  for (const entries of Object.values(hooks)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const e = entry as Record<string, unknown>;
      const innerHooks = e.hooks as Array<Record<string, unknown>> | undefined;
      if (!innerHooks) continue;
      for (const h of innerHooks) {
        if (typeof h.command === 'string' && h.command.startsWith('npx oathbound')) return true;
      }
    }
  }
  return false;
}

export type MergeResult = 'created' | 'merged' | 'skipped' | 'malformed';

export function mergeClaudeSettings(targetDir?: string): MergeResult {
  const baseDir = targetDir ?? process.cwd();
  const claudeDir = join(baseDir, '.claude');
  const settingsPath = join(claudeDir, 'settings.json');

  if (!existsSync(settingsPath)) {
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(settingsPath, JSON.stringify({ hooks: OATHBOUND_HOOKS }, null, 2) + '\n');
    return 'created';
  }

  let settings: Record<string, unknown>;
  try {
    settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
  } catch {
    return 'malformed';
  }

  if (hasOathboundHooks(settings)) return 'skipped';

  // Merge hooks into existing settings
  const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>;
  for (const [event, entries] of Object.entries(OATHBOUND_HOOKS)) {
    const existing = hooks[event] as unknown[] | undefined;
    hooks[event] = existing ? [...existing, ...entries] : [...entries];
  }
  settings.hooks = hooks;
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  return 'merged';
}

/** Check if a settings.json file at the given path contains oathbound hooks. */
export function settingsHaveOathboundHooks(settingsPath: string): boolean {
  if (!existsSync(settingsPath)) return false;
  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    return hasOathboundHooks(settings);
  } catch {
    return false;
  }
}

#!/usr/bin/env bun

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  writeFileSync, readFileSync, unlinkSync, existsSync,
  readdirSync, statSync, mkdirSync, renameSync, chmodSync,
} from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { tmpdir, homedir, platform } from 'node:os';
import { intro, outro, select, cancel, isCancel } from '@clack/prompts';

const VERSION = '0.3.0';

// --- Supabase ---
const SUPABASE_URL = 'https://mjnfqagwuewhgwbtrdgs.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_T-rk0azNRqAMLLGCyadyhQ_ulk9685n';

// --- ANSI (respect NO_COLOR standard: https://no-color.org) ---
const USE_COLOR = process.env.NO_COLOR === undefined && process.stderr.isTTY;
const TEAL = USE_COLOR ? '\x1b[38;2;63;168;164m' : ''; // brand teal #3fa8a4
const GREEN = USE_COLOR ? '\x1b[32m' : '';
const RED = USE_COLOR ? '\x1b[31m' : '';
const YELLOW = USE_COLOR ? '\x1b[33m' : '';
const DIM = USE_COLOR ? '\x1b[2m' : '';
const BOLD = USE_COLOR ? '\x1b[1m' : '';
const RESET = USE_COLOR ? '\x1b[0m' : '';

const BRAND = `${TEAL}${BOLD}🛡️ oathbound${RESET}`;

// --- Types ---
interface SkillRow {
  name: string;
  namespace: string;
  version: number;
  tar_hash: string;
  storage_path: string;
}

// --- Helpers ---
function usage(exitCode = 1): never {
  console.log(`
${BOLD}oathbound${RESET} — install and verify skills

${DIM}Usage:${RESET}
  oathbound init                ${DIM}Setup wizard — configure project${RESET}
  oathbound pull <namespace/skill-name>
  oathbound install <namespace/skill-name>
  oathbound verify              ${DIM}SessionStart hook — verify all skills${RESET}
  oathbound verify --check      ${DIM}PreToolUse hook — check skill integrity${RESET}

${DIM}Options:${RESET}
  --help, -h      Show this help message
  --version, -v   Show version
`);
  process.exit(exitCode);
}

function fail(message: string, detail?: string): never {
  console.log(`\n${BOLD}${RED} ✗ ${message}${RESET}`);
  if (detail) {
    console.log(`${RED}   ${detail}${RESET}`);
  }
  process.exit(1);
}

function spinner(text: string): { stop: () => void } {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  process.stdout.write(`${TEAL} ${frames[0]} ${text}${RESET}`);
  const interval = setInterval(() => {
    i = (i + 1) % frames.length;
    process.stdout.write(`\r${TEAL} ${frames[i]} ${text}${RESET}`);
  }, 80);
  return {
    stop() {
      clearInterval(interval);
      process.stdout.write(USE_COLOR ? '\r\x1b[2K' : '\n');
    },
  };
}

function findSkillsDir(): string {
  const cwd = process.cwd();
  const normalized = cwd.replace(/\/+$/, '');

  // Already inside .claude/skills
  if (normalized.endsWith('.claude/skills')) return cwd;

  // Inside .claude — check for skills/ subdir
  if (normalized.endsWith('.claude')) {
    const skills = join(cwd, 'skills');
    if (existsSync(skills)) return skills;
  }

  // Check cwd/.claude/skills directly
  const direct = join(cwd, '.claude', 'skills');
  if (existsSync(direct)) return direct;

  // Recurse downward (skip noise, limited depth)
  const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next']);
  function search(dir: string, depth: number): string | null {
    if (depth <= 0) return null;
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || SKIP.has(entry.name)) continue;
        if (entry.name === '.claude') {
          const skills = join(dir, '.claude', 'skills');
          if (existsSync(skills)) return skills;
        }
      }
      for (const entry of entries) {
        if (!entry.isDirectory() || SKIP.has(entry.name) || entry.name.startsWith('.')) continue;
        const result = search(join(dir, entry.name), depth - 1);
        if (result) return result;
      }
    } catch {
      // permission denied, etc.
    }
    return null;
  }

  return search(cwd, 5) ?? cwd;
}

function parseSkillArg(arg: string): { namespace: string; name: string } | null {
  const slash = arg.indexOf('/');
  if (slash < 1 || slash === arg.length - 1) return null;
  return { namespace: arg.slice(0, slash), name: arg.slice(slash + 1) };
}

// --- Content hashing (must match frontend/lib/content-hash.ts) ---
const HASH_EXCLUDED = new Set([
  'node_modules',
  'bun.lock',
  'package-lock.json',
  'yarn.lock',
  '.DS_Store',
]);

function collectFiles(dir: string, base: string = dir): { path: string; content: Buffer }[] {
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

function contentHash(files: { path: string; content: Buffer }[]): string {
  const sorted = files.toSorted((a, b) => a.path.localeCompare(b.path));
  const lines = sorted.map((f) => {
    const h = createHash('sha256').update(f.content).digest('hex');
    return `${f.path}\0${h}`;
  });
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

function hashSkillDir(skillDir: string): string {
  const files = collectFiles(skillDir);
  return contentHash(files);
}

// --- JSONC / Config helpers ---
type EnforcementLevel = 'warn' | 'registered' | 'audited';

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

// --- Auto-update helpers ---
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

function getPlatformBinaryName(): string {
  const p = platform();
  const os = p === 'win32' ? 'windows' : p === 'darwin' ? 'darwin' : 'linux';
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const ext = p === 'win32' ? '.exe' : '';
  return `oathbound-${os}-${arch}${ext}`;
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

async function checkForUpdate(): Promise<void> {
  const cacheDir = getCacheDir();
  const cacheFile = join(cacheDir, 'update-check.json');

  // Check cache freshness (24h)
  if (existsSync(cacheFile)) {
    try {
      const cache = JSON.parse(readFileSync(cacheFile, 'utf-8'));
      if (Date.now() - cache.checkedAt < 86_400_000) {
        if (cache.latestVersion && isNewer(cache.latestVersion, VERSION)) {
          printUpdateBox(VERSION, cache.latestVersion);
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
    writeFileSync(cacheFile, JSON.stringify({ checkedAt: Date.now(), latestVersion: latest }));

    if (!isNewer(latest, VERSION)) return;

    // Try auto-update the binary
    const binaryPath = process.argv[0];
    if (!binaryPath || binaryPath.includes('bun') || binaryPath.includes('node')) {
      // Running via bun/node, not compiled binary — just print box
      printUpdateBox(VERSION, latest);
      return;
    }

    const binaryName = getPlatformBinaryName();
    const url = `https://github.com/Joshuatanderson/oath-bound/releases/download/v${latest}/${binaryName}`;
    const dlController = new AbortController();
    const dlTimeout = setTimeout(() => dlController.abort(), 30_000);
    const dlResp = await fetch(url, { signal: dlController.signal, redirect: 'follow' });
    clearTimeout(dlTimeout);

    if (!dlResp.ok || !dlResp.body) {
      printUpdateBox(VERSION, latest);
      return;
    }

    const bytes = Buffer.from(await dlResp.arrayBuffer());
    const tmpPath = `${binaryPath}.update-${Date.now()}`;
    writeFileSync(tmpPath, bytes);
    chmodSync(tmpPath, 0o755);
    renameSync(tmpPath, binaryPath);
    process.stderr.write(`${TEAL} ✓ Updated oathbound ${VERSION} → ${latest}${RESET}\n`);
  } catch {
    // Network error or permission issue — silently ignore
    // The next run will retry
  }
}

// --- Init helpers ---
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

const OATHBOUND_HOOKS = {
  SessionStart: [
    { matcher: '', hooks: [{ type: 'command', command: 'oathbound verify' }] },
  ],
  PreToolUse: [
    { matcher: 'Skill', hooks: [{ type: 'command', command: 'oathbound verify --check' }] },
  ],
};

function hasOathboundHooks(settings: Record<string, unknown>): boolean {
  const hooks = settings.hooks as Record<string, unknown[]> | undefined;
  if (!hooks) return false;
  for (const entries of Object.values(hooks)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const e = entry as Record<string, unknown>;
      const innerHooks = e.hooks as Array<Record<string, unknown>> | undefined;
      if (!innerHooks) continue;
      for (const h of innerHooks) {
        if (typeof h.command === 'string' && h.command.startsWith('oathbound')) return true;
      }
    }
  }
  return false;
}

export type MergeResult = 'created' | 'merged' | 'skipped' | 'malformed';

export function mergeClaudeSettings(): MergeResult {
  const claudeDir = join(process.cwd(), '.claude');
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

// --- Init command ---
async function init(): Promise<void> {
  intro(BRAND);

  const enforcement = await select({
    message: 'Choose an enforcement level:',
    options: [
      { value: 'warn', label: 'Warn', hint: 'Report unverified skills but allow them' },
      { value: 'registered', label: 'Registered', hint: 'Block unregistered skills' },
      { value: 'audited', label: 'Audited', hint: 'Block skills without a passed audit' },
    ],
  });

  if (isCancel(enforcement)) {
    cancel('Setup cancelled.');
    process.exit(0);
  }

  const level = enforcement as EnforcementLevel;

  // Write .oathbound.jsonc
  const configWritten = writeOathboundConfig(level);
  if (configWritten) {
    process.stderr.write(`${GREEN} ✓ Created .oathbound.jsonc${RESET}\n`);
  } else {
    process.stderr.write(`${DIM}   .oathbound.jsonc already exists — skipped${RESET}\n`);
  }

  // Merge hooks into .claude/settings.json
  const mergeResult = mergeClaudeSettings();
  switch (mergeResult) {
    case 'created':
      process.stderr.write(`${GREEN} ✓ Created .claude/settings.json with hooks${RESET}\n`);
      break;
    case 'merged':
      process.stderr.write(`${GREEN} ✓ Added hooks to .claude/settings.json${RESET}\n`);
      break;
    case 'skipped':
      process.stderr.write(`${DIM}   .claude/settings.json already has oathbound hooks — skipped${RESET}\n`);
      break;
    case 'malformed':
      process.stderr.write(`${RED} ✗ .claude/settings.json is malformed JSON — skipped${RESET}\n`);
      process.stderr.write(`${RED}   Please fix the file manually and re-run oathbound init${RESET}\n`);
      break;
  }

  outro(`${BRAND} ${TEAL}configured (${level})${RESET}`);
}

// --- Session state file ---
interface SessionState {
  verified: Record<string, string>; // skill name → content_hash
  rejected: { name: string; reason: string }[];
  ok: boolean;
}

function sessionStatePath(sessionId: string): string {
  return join(tmpdir(), `oathbound-${sessionId}.json`);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

// --- Verify (SessionStart hook) ---
async function verify(): Promise<void> {
  let input: Record<string, unknown>;
  try {
    input = JSON.parse(await readStdin());
  } catch {
    process.stderr.write('oathbound verify: invalid JSON on stdin\n');
    process.exit(1);
  }
  const sessionId: string = input.session_id as string;
  if (!sessionId) {
    process.stderr.write('oathbound verify: no session_id in stdin\n');
    process.exit(1);
  }

  const skillsDir = findSkillsDir();

  // Guard: findSkillsDir() falls back to cwd if no .claude/skills found.
  // In verify mode, we must NOT hash the entire project — only .claude/skills.
  if (!skillsDir.endsWith('.claude/skills') && !skillsDir.includes('.claude/skills')) {
    const state: SessionState = { verified: {}, rejected: [], ok: true };
    writeFileSync(sessionStatePath(sessionId), JSON.stringify(state));
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: 'Oathbound: no .claude/skills/ directory found — nothing to verify.' } }));
    process.exit(0);
  }

  // List skill subdirectories
  const entries = readdirSync(skillsDir, { withFileTypes: true });
  const skillDirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.'));

  if (skillDirs.length === 0) {
    const state: SessionState = { verified: {}, rejected: [], ok: true };
    writeFileSync(sessionStatePath(sessionId), JSON.stringify(state));
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: 'Oathbound: no skills installed — nothing to verify.' } }));
    process.exit(0);
  }

  // Hash each local skill
  const localHashes: Record<string, string> = {};
  for (const dir of skillDirs) {
    const fullPath = join(skillsDir, dir.name);
    localHashes[dir.name] = hashSkillDir(fullPath);
  }

  // Read enforcement config
  const config = readOathboundConfig();
  const enforcement: EnforcementLevel = config?.enforcement ?? 'warn';

  // Fetch registry hashes from Supabase (latest version per skill name)
  // If enforcement=audited, also fetch audit status
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const selectFields = enforcement === 'audited'
    ? 'name, namespace, content_hash, version, audits(passed)'
    : 'name, namespace, content_hash, version';
  const { data: skills, error } = await supabase
    .from('skills')
    .select(selectFields)
    .order('version', { ascending: false });

  if (error) {
    process.stderr.write(`oathbound verify: failed to query registry: ${error.message}\n`);
    process.exit(1);
  }

  // Build lookup: skill name → latest content_hash (dedupe by taking first per name)
  const registryHashes = new Map<string, string>();
  const auditedSkills = new Set<string>(); // skills with at least one passed audit
  for (const skill of skills ?? []) {
    if (!skill.content_hash) continue;
    if (!registryHashes.has(skill.name)) {
      registryHashes.set(skill.name, skill.content_hash);
    }
    if (enforcement === 'audited') {
      const audits = (skill as Record<string, unknown>).audits as Array<{ passed: boolean }> | null;
      if (audits?.some((a) => a.passed)) {
        auditedSkills.add(skill.name);
      }
    }
  }

  const verified: Record<string, string> = {};
  const rejected: { name: string; reason: string }[] = [];
  const warnings: { name: string; reason: string }[] = [];

  process.stderr.write(`${BRAND} ${TEAL}verifying skills...${RESET}\n`);

  for (const [name, localHash] of Object.entries(localHashes)) {
    const registryHash = registryHashes.get(name);
    if (!registryHash) {
      process.stderr.write(`${DIM}   ${name}: ${localHash} (not in registry)${RESET}\n`);
      if (enforcement === 'warn') {
        warnings.push({ name, reason: 'not in registry' });
        verified[name] = localHash; // allow in warn mode
      } else {
        rejected.push({ name, reason: 'not in registry' });
      }
    } else if (localHash !== registryHash) {
      process.stderr.write(`${RED}   ${name}: ${localHash} ≠ ${registryHash}${RESET}\n`);
      if (enforcement === 'warn') {
        warnings.push({ name, reason: `content hash mismatch (local: ${localHash.slice(0, 8)}…, registry: ${registryHash.slice(0, 8)}…)` });
        verified[name] = localHash;
      } else {
        rejected.push({ name, reason: `content hash mismatch (local: ${localHash.slice(0, 8)}…, registry: ${registryHash.slice(0, 8)}…)` });
      }
    } else if (enforcement === 'audited' && !auditedSkills.has(name)) {
      process.stderr.write(`${YELLOW}   ${name}: ${localHash} (registered but not audited)${RESET}\n`);
      rejected.push({ name, reason: 'no passed audit' });
    } else {
      process.stderr.write(`${GREEN}   ${name}: ${localHash} ✓${RESET}\n`);
      verified[name] = localHash;
    }
  }

  const ok = rejected.length === 0;
  const state: SessionState = { verified, rejected, ok };
  writeFileSync(sessionStatePath(sessionId), JSON.stringify(state));

  if (ok && warnings.length === 0) {
    const names = Object.keys(verified).join(', ');
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: `Oathbound: all ${Object.keys(verified).length} skill(s) verified against registry [${names}]. Skills are safe to use.`,
      },
    }));
    process.exit(0);
  } else if (ok && warnings.length > 0) {
    // Warn mode — all skills allowed but with warnings
    const warnLines = warnings.map((w) => `  ⚠ ${w.name}: ${w.reason}`).join('\n');
    const names = Object.keys(verified).join(', ');
    process.stderr.write(`${YELLOW}Oathbound warnings (enforcement: warn):\n${warnLines}${RESET}\n`);
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: `Oathbound (warn mode): ${Object.keys(verified).length} skill(s) allowed [${names}]. Warnings:\n${warnLines}`,
      },
    }));
    process.exit(0);
  } else {
    const lines = rejected.map((r) => `  - ${r.name}: ${r.reason}`);
    process.stderr.write(`Oathbound: skill verification failed! (enforcement: ${enforcement})\n${lines.join('\n')}\nDo NOT use unverified skills.\n`);
    process.exit(2);
  }
}

// --- Verify --check (PreToolUse hook) ---
async function verifyCheck(): Promise<void> {
  let input: Record<string, unknown>;
  try {
    input = JSON.parse(await readStdin());
  } catch {
    process.stderr.write('oathbound verify --check: invalid JSON on stdin\n');
    process.exit(1);
  }
  const sessionId: string = input.session_id as string;
  const skillName: string | undefined = (input.tool_input as Record<string, unknown> | undefined)?.skill as string | undefined;

  if (!sessionId || !skillName) {
    // Can't verify — allow through (non-skill invocation or missing context)
    process.exit(0);
  }

  const stateFile = sessionStatePath(sessionId);
  if (!existsSync(stateFile)) {
    // No session state — session start hook didn't run or no skills installed
    process.exit(0);
  }

  let state: SessionState;
  try {
    state = JSON.parse(readFileSync(stateFile, 'utf-8'));
  } catch {
    process.stderr.write('oathbound verify --check: corrupt session state file\n');
    process.exit(1);
  }

  // Extract just the skill name (strip namespace/ prefix if present)
  const baseName = skillName.includes(':') ? skillName.split(':').pop()! : skillName;

  // Find the skill directory and re-hash
  const skillsDir = findSkillsDir();
  const skillDir = join(skillsDir, baseName);

  if (!existsSync(skillDir) || !statSync(skillDir).isDirectory()) {
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `Oathbound: skill directory not found for "${baseName}"`,
      },
    }));
    process.exit(0);
  }

  const currentHash = hashSkillDir(skillDir);
  const sessionHash = state.verified[baseName];

  if (!sessionHash) {
    process.stderr.write(`${RED}   ${baseName}: ${currentHash} (not verified at session start)${RESET}\n`);
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `Oathbound: skill "${baseName}" was not verified at session start`,
      },
    }));
    process.exit(0);
  }

  if (currentHash !== sessionHash) {
    process.stderr.write(`${RED}   ${baseName}: ${currentHash} ≠ ${sessionHash} (tampered)${RESET}\n`);
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `Oathbound: skill "${baseName}" was modified since session start (tampering detected)`,
      },
    }));
    process.exit(0);
  }

  process.stderr.write(`${GREEN}   ${baseName}: ${currentHash} ✓${RESET}\n`);

  // Hash matches — allow
  process.exit(0);
}

// --- Main ---
async function pull(skillArg: string): Promise<void> {
  const parsed = parseSkillArg(skillArg);
  if (!parsed) usage();
  const { namespace, name } = parsed;
  const fullName = `${namespace}/${name}`;

  console.log(`\n${BRAND} ${TEAL}↓ Pulling ${fullName}...${RESET}`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // 1. Query for the skill
  const { data: skill, error } = await supabase
    .from('skills')
    .select('name, namespace, version, tar_hash, storage_path')
    .eq('namespace', namespace)
    .eq('name', name)
    .order('version', { ascending: false })
    .limit(1)
    .single<SkillRow>();

  if (error || !skill) {
    fail(`Skill not found: ${fullName}`);
  }

  // 2. Download the tar from storage
  const { data: blob, error: downloadError } = await supabase
    .storage
    .from('skills')
    .download(skill.storage_path);

  if (downloadError || !blob) {
    fail('Download failed', downloadError?.message ?? 'Unknown storage error');
  }

  const buffer = Buffer.from(await blob.arrayBuffer());
  const tarFile = join(tmpdir(), `oathbound-${name}-${Date.now()}.tar.gz`);

  // 3. Hash and verify
  const verify = spinner('Verifying...');
  const hash = createHash('sha256').update(buffer).digest('hex');
  verify.stop();

  console.log(`${DIM}   tar hash: ${hash}${RESET}`);

  if (hash !== skill.tar_hash) {
    console.log(`${RED}   expected: ${skill.tar_hash}${RESET}`);
    fail('Verification failed', `Downloaded file does not match expected hash for ${fullName}`);
  }

  // 4. Find target directory and extract
  let skillsDir = findSkillsDir();
  if (!skillsDir.endsWith('.claude/skills') && !skillsDir.includes('.claude/skills')) {
    // findSkillsDir() fell back to cwd — create .claude/skills instead of extracting into project root
    skillsDir = join(process.cwd(), '.claude', 'skills');
    const { mkdirSync } = await import('node:fs');
    mkdirSync(skillsDir, { recursive: true });
    console.log(`${DIM}   Created ${skillsDir}${RESET}`);
  }
  writeFileSync(tarFile, buffer);
  try {
    execFileSync('tar', ['-xf', tarFile, '-C', skillsDir], { stdio: 'pipe' });
  } catch (e: unknown) {
    unlinkSync(tarFile);
    const msg = e instanceof Error ? e.message : 'Unknown error';
    fail('Extraction failed', msg);
  }
  unlinkSync(tarFile);

  // 5. Success
  console.log(`${BOLD}${GREEN} ✓ Skill verified${RESET}`);
  console.log(`${DIM}   ${fullName} v${skill.version}${RESET}`);
  console.log(`${DIM}   → ${join(skillsDir, name)}${RESET}`);
}

// --- Entry ---
if (!import.meta.main) {
  // Module imported for testing — skip CLI entry
} else {
const args = Bun.argv.slice(2);
const subcommand = args[0];

if (subcommand === '--help' || subcommand === '-h') {
  usage(0);
}

// Fire-and-forget auto-update on every command except verify (hooks must be fast)
if (subcommand !== 'verify') {
  const updatePromise = checkForUpdate().catch(() => {});

  if (subcommand === '--version' || subcommand === '-v') {
    // Wait for update check so the user sees the notification
    await updatePromise;
    console.log(`oathbound ${VERSION}`);
    process.exit(0);
  }
}

if (subcommand === 'init') {
  init().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    fail('Init failed', msg);
  });
} else if (subcommand === 'verify') {
  const isCheck = args.includes('--check');
  const run = isCheck ? verifyCheck : verify;
  run().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    process.stderr.write(`oathbound verify: ${msg}\n`);
    process.exit(1);
  });
} else {
  const PULL_ALIASES = new Set(['pull', 'i', 'install']);
  const skillArg = args[1];

  if (!subcommand || !PULL_ALIASES.has(subcommand) || !skillArg) {
    usage();
  }

  pull(skillArg).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    fail('Unexpected error', msg);
  });
}
} // end if (import.meta.main)

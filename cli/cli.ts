#!/usr/bin/env bun

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, unlinkSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';

const VERSION = '0.1.0';

// --- Supabase ---
const SUPABASE_URL = 'https://mjnfqagwuewhgwbtrdgs.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_T-rk0azNRqAMLLGCyadyhQ_ulk9685n';

// --- ANSI ---
const TEAL = '\x1b[38;2;63;168;164m'; // brand teal #3fa8a4
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

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
      process.stdout.write('\r\x1b[2K');
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
  const input = JSON.parse(await readStdin());
  const sessionId: string = input.session_id;
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

  // Fetch registry hashes from Supabase (latest version per skill name)
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: skills, error } = await supabase
    .from('skills')
    .select('name, namespace, content_hash, version')
    .order('version', { ascending: false });

  if (error) {
    process.stderr.write(`oathbound verify: failed to query registry: ${error.message}\n`);
    process.exit(1);
  }

  // Build lookup: skill name → latest content_hash (dedupe by taking first per name)
  const registryHashes = new Map<string, string>();
  for (const skill of skills ?? []) {
    if (!skill.content_hash) continue;
    if (!registryHashes.has(skill.name)) {
      registryHashes.set(skill.name, skill.content_hash);
    }
  }

  const verified: Record<string, string> = {};
  const rejected: { name: string; reason: string }[] = [];

  for (const [name, localHash] of Object.entries(localHashes)) {
    const registryHash = registryHashes.get(name);
    if (!registryHash) {
      process.stderr.write(`${DIM}   ${name}: ${localHash} (not in registry)${RESET}\n`);
      rejected.push({ name, reason: 'not in registry' });
    } else if (localHash !== registryHash) {
      process.stderr.write(`${RED}   ${name}: ${localHash} ≠ ${registryHash}${RESET}\n`);
      rejected.push({ name, reason: `content hash mismatch (local: ${localHash.slice(0, 8)}…, registry: ${registryHash.slice(0, 8)}…)` });
    } else {
      process.stderr.write(`${GREEN}   ${name}: ${localHash} ✓${RESET}\n`);
      verified[name] = localHash;
    }
  }

  const ok = rejected.length === 0;
  const state: SessionState = { verified, rejected, ok };
  writeFileSync(sessionStatePath(sessionId), JSON.stringify(state));

  if (ok) {
    const names = Object.keys(verified).join(', ');
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: `Oathbound: all ${Object.keys(verified).length} skill(s) verified against registry [${names}]. Skills are safe to use.`,
      },
    }));
    process.exit(0);
  } else {
    const lines = rejected.map((r) => `  - ${r.name}: ${r.reason}`);
    process.stderr.write(`Oathbound: skill verification failed!\n${lines.join('\n')}\nDo NOT use unverified skills.\n`);
    process.exit(2);
  }
}

// --- Verify --check (PreToolUse hook) ---
async function verifyCheck(): Promise<void> {
  const input = JSON.parse(await readStdin());
  const sessionId: string = input.session_id;
  const skillName: string | undefined = input.tool_input?.skill;

  if (!sessionId || !skillName) {
    // Can't verify — allow through (non-skill invocation or missing context)
    process.exit(0);
  }

  const stateFile = sessionStatePath(sessionId);
  if (!existsSync(stateFile)) {
    // No session state — session start hook didn't run or no skills installed
    process.exit(0);
  }

  const state: SessionState = JSON.parse(readFileSync(stateFile, 'utf-8'));

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

  console.log(`\n${TEAL} ↓ Pulling ${fullName}...${RESET}`);

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
  const tarFile = `${name}.tar.gz`;

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
  const skillsDir = findSkillsDir();
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
const args = Bun.argv.slice(2);
const subcommand = args[0];

if (subcommand === '--help' || subcommand === '-h') {
  usage(0);
}

if (subcommand === '--version' || subcommand === '-v') {
  console.log(`oathbound ${VERSION}`);
  process.exit(0);
}

if (subcommand === 'verify') {
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

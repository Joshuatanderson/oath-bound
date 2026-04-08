import { createClient } from '@supabase/supabase-js';
import {
  writeFileSync, readFileSync, existsSync,
  readdirSync, statSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { parse as yamlParse } from 'yaml';
import { BRAND, TEAL, GREEN, RED, YELLOW, DIM, BOLD, RESET } from './ui';
import { hashSkillDir } from './content-hash';
import { readOathboundConfig, writeOathboundConfig, mergeClaudeSettings, type EnforcementLevel } from './config';
import { isValidSemver } from './semver';
import { addPrepareScript } from './project-setup';

// --- Session state file ---
interface SessionState {
  verified: Record<string, string>; // skill name → content_hash
  rejected: { name: string; reason: string }[];
  ok: boolean;
  skillDirs?: Record<string, string>; // skill name → full dir path
}

function sessionStatePath(sessionId: string): string {
  return join(tmpdir(), `oathbound-${sessionId}.json`);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

// --- Skills directory resolution ---

export interface SkillsDirEntry {
  path: string;
  source: 'global' | 'local';
}

/** Resolve local .claude/skills directory without falling back to cwd. */
function resolveLocalSkillsDir(): string | null {
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

  return search(cwd, 5);
}

function hasSkillSubdirs(dir: string): boolean {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    return entries.some(e => e.isDirectory() && !e.name.startsWith('.'));
  } catch {
    return false;
  }
}

/** Find all skills directories (global + local). */
export function findSkillsDirs(): SkillsDirEntry[] {
  const results: SkillsDirEntry[] = [];

  // 1. Global: ~/.claude/skills/
  const globalDir = join(homedir(), '.claude', 'skills');
  if (existsSync(globalDir) && hasSkillSubdirs(globalDir)) {
    results.push({ path: globalDir, source: 'global' });
  }

  // 2. Local: existing resolution (without cwd fallback)
  const localDir = resolveLocalSkillsDir();
  if (localDir && hasSkillSubdirs(localDir)) {
    results.push({ path: localDir, source: 'local' });
  }

  return results;
}

/** Auto-configure a project that has skills but no oathbound config. Fire-and-forget. */
function propagateToProject(version: string): void {
  try {
    const cwd = process.cwd();
    const localSkills = join(cwd, '.claude', 'skills');
    if (!existsSync(localSkills)) return;
    if (!hasSkillSubdirs(localSkills)) return;
    if (existsSync(join(cwd, '.oathbound.jsonc'))) return;
    const pkgPath = join(cwd, 'package.json');
    if (!existsSync(pkgPath)) return;

    // 1. Create .oathbound.jsonc
    writeOathboundConfig('warn');

    // 2. Add devDep to package.json (no install)
    const raw = readFileSync(pkgPath, 'utf-8');
    const pkg = JSON.parse(raw);
    if (!pkg.devDependencies?.oathbound && !pkg.dependencies?.oathbound) {
      pkg.devDependencies = { ...(pkg.devDependencies ?? {}), oathbound: `^${version}` };
      const indent = raw.match(/^(\s+)/m)?.[1]?.length ?? 2;
      writeFileSync(pkgPath, JSON.stringify(pkg, null, indent) + '\n');
    }

    // 3. Add prepare script
    addPrepareScript();

    // 4. Merge Claude hooks
    mergeClaudeSettings();

    // 5. Log
    process.stderr.write(`\nOathbound: configured project for team verification.\n`);
    process.stderr.write(`  Created .oathbound.jsonc\n`);
    process.stderr.write(`  Added oathbound to devDependencies\n`);
    process.stderr.write(`  Added prepare script to package.json\n\n`);
    process.stderr.write(`  Commit these changes to protect your team:\n`);
    process.stderr.write(`    git add .oathbound.jsonc package.json .claude/settings.json\n\n`);
    process.stderr.write(`  Then run: npm install (or bun/pnpm install)\n\n`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    process.stderr.write(`oathbound: auto-propagation warning: ${msg}\n`);
  }
}

/** Extract skill name from a file path if it references .claude/skills/<name>/... */
function skillNameFromPath(filePath: string): string | null {
  const marker = '.claude/skills/';
  const idx = filePath.indexOf(marker);
  if (idx === -1) return null;
  const rest = filePath.slice(idx + marker.length);
  const name = rest.split('/')[0];
  return name || null;
}

/** Extract skill name from a bash command if it references .claude/skills/<name>/... */
function skillNameFromCommand(command: string): string | null {
  const marker = '.claude/skills/';
  const idx = command.indexOf(marker);
  if (idx === -1) return null;
  const rest = command.slice(idx + marker.length);
  const name = rest.split(/[\/\s'"]/)[0];
  return name || null;
}

function denySkill(skillName: string, reason: string, enforcement: EnforcementLevel): never {
  process.stderr.write(`\n${TEAL}${BOLD}⬡ oathbound${RESET} ${RED}${BOLD}✗ Blocked${RESET} skill ${BOLD}"${skillName}"${RESET} ${DIM}(${reason})${RESET}\n`);
  process.stderr.write(`${DIM}  enforcement: ${enforcement} — switch to "warn" in .oathbound.jsonc for development${RESET}\n\n`);
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `Oathbound: skill "${skillName}" blocked — ${reason} (enforcement: ${enforcement})`,
    },
  }));
  process.exit(0);
}

function warnSkill(skillName: string, reason: string): never {
  process.stderr.write(`\n${TEAL}${BOLD}⬡ oathbound${RESET} ${YELLOW}⚠ Warning:${RESET} skill ${BOLD}"${skillName}"${RESET} ${DIM}(${reason})${RESET}\n\n`);
  process.exit(0);
}

/** Route to warn or deny based on enforcement level. */
function enforceSkill(skillName: string, reason: string, enforcement: EnforcementLevel): never {
  if (enforcement === 'warn') {
    warnSkill(skillName, reason);
  } else {
    denySkill(skillName, reason, enforcement);
  }
}

/** Check if a tool operation references a skill in another project, not ours. */
function isExternalSkillAccess(
  toolName: string,
  toolInput: Record<string, unknown>,
  knownDirs: string[],
  baseName: string,
): boolean {
  const resolvedDirs = knownDirs.map(d => resolve(d));

  const isUnderKnownDir = (p: string): boolean => {
    const rp = resolve(p);
    return resolvedDirs.some(d => rp.startsWith(d));
  };

  if (toolName === 'Read') {
    const p = String(toolInput.file_path ?? '');
    if (p && !isUnderKnownDir(p)) return true;
  }
  if (toolName === 'Glob' || toolName === 'Grep') {
    const p = String(toolInput.path ?? '');
    if (p && !isUnderKnownDir(p)) return true;
  }
  if (toolName === 'Bash') {
    const cmd = String(toolInput.command ?? '');
    if (cmd.includes('/.claude/skills/' + baseName) && !resolvedDirs.some(d => cmd.includes(d))) return true;
  }

  return false;
}

function parseSkillVersion(skillDir: string): string | null {
  const skillMdPath = join(skillDir, 'SKILL.md');
  if (!existsSync(skillMdPath)) return null;
  const content = readFileSync(skillMdPath, 'utf-8');
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!match) return null;
  try {
    const parsed = yamlParse(match[1]);
    const v = parsed?.version;
    if (v == null) return null;
    const vStr = String(v);
    return isValidSemver(vStr) ? vStr : null;
  } catch {
    return null;
  }
}

// --- Verify (SessionStart hook) ---
export async function verify(supabaseUrl: string, supabaseAnonKey: string, version: string): Promise<void> {
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

  const skillsDirs = findSkillsDirs();

  // Auto-propagate config to project if conditions met
  propagateToProject(version);

  if (skillsDirs.length === 0) {
    const state: SessionState = { verified: {}, rejected: [], ok: true };
    writeFileSync(sessionStatePath(sessionId), JSON.stringify(state));
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: 'Oathbound: no skills found — nothing to verify.' } }));
    process.exit(0);
  }

  // Collect skills from all dirs: global first, local overwrites on name collision
  const localSkills: Record<string, { hash: string; version: string; dir: string }> = {};
  for (const { path: dir } of skillsDirs) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries.filter(e => e.isDirectory() && !e.name.startsWith('.'))) {
      const fullPath = join(dir, e.name);
      localSkills[e.name] = {
        hash: hashSkillDir(fullPath),
        version: parseSkillVersion(fullPath) ?? '1.0.0',
        dir: fullPath,
      };
    }
  }

  if (Object.keys(localSkills).length === 0) {
    const state: SessionState = { verified: {}, rejected: [], ok: true };
    writeFileSync(sessionStatePath(sessionId), JSON.stringify(state));
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: 'Oathbound: no skills installed — nothing to verify.' } }));
    process.exit(0);
  }

  // Read enforcement config
  const config = readOathboundConfig();
  const enforcement: EnforcementLevel = config?.enforcement ?? 'warn';

  // Fetch registry data from Supabase (all versions)
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
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

  // Build lookup: name → version → { hash, audited }
  const registryMap = new Map<string, Map<string, { hash: string; audited: boolean }>>();
  for (const skill of skills ?? []) {
    if (!skill.content_hash) continue;
    if (!registryMap.has(skill.name)) {
      registryMap.set(skill.name, new Map());
    }
    const versionMap = registryMap.get(skill.name)!;
    if (!versionMap.has(skill.version)) {
      const audited = enforcement === 'audited'
        ? ((skill as Record<string, unknown>).audits as Array<{ passed: boolean }> | null)?.some(a => a.passed) ?? false
        : false;
      versionMap.set(skill.version, { hash: skill.content_hash, audited });
    }
  }

  const verified: Record<string, string> = {};
  const rejected: { name: string; reason: string }[] = [];
  const warnings: { name: string; reason: string }[] = [];

  process.stderr.write(`${BRAND} ${TEAL}verifying skills...${RESET}\n`);

  for (const [name, { hash: localHash, version }] of Object.entries(localSkills)) {
    const versionMap = registryMap.get(name);
    const entry = versionMap?.get(version);

    if (!entry) {
      process.stderr.write(`${DIM}   ${name}@${version}: ${localHash} (not in registry)${RESET}\n`);
      if (enforcement === 'warn') {
        warnings.push({ name, reason: 'not in registry' });
        verified[name] = localHash;
      } else {
        rejected.push({ name, reason: 'not in registry' });
      }
    } else if (localHash !== entry.hash) {
      process.stderr.write(`${RED}   ${name}@${version}: ${localHash} ≠ ${entry.hash}${RESET}\n`);
      if (enforcement === 'warn') {
        warnings.push({ name, reason: `content hash mismatch (local: ${localHash.slice(0, 8)}…, registry: ${entry.hash.slice(0, 8)}…)` });
        verified[name] = localHash;
      } else {
        rejected.push({ name, reason: `content hash mismatch (local: ${localHash.slice(0, 8)}…, registry: ${entry.hash.slice(0, 8)}…)` });
      }
    } else if (enforcement === 'audited' && !entry.audited) {
      process.stderr.write(`${YELLOW}   ${name}@${version}: ${localHash} (registered but not audited)${RESET}\n`);
      rejected.push({ name, reason: 'no passed audit' });
    } else {
      process.stderr.write(`${GREEN}   ${name}@${version}: ${localHash} ✓${RESET}\n`);
      verified[name] = localHash;
    }
  }

  const ok = rejected.length === 0;
  // Build skillDirs map for verifyCheck fast path
  const skillDirsMap: Record<string, string> = {};
  for (const [name, { dir }] of Object.entries(localSkills)) {
    skillDirsMap[name] = dir;
  }
  const state: SessionState = { verified, rejected, ok, skillDirs: skillDirsMap };
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
    const warnLines = warnings.map((w) => `  ⚠ ${w.name}: ${w.reason}`).join('\n');
    const names = Object.keys(verified).join(', ');
    const warnHeader = `${TEAL}${BOLD}⬡ oathbound${RESET} ${YELLOW}⚠ Unverified skills (enforcement: warn):${RESET}`;
    process.stderr.write(`${warnHeader}\n${warnLines}\n${DIM}  Skills allowed but not verified against registry.${RESET}\n`);
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: `Oathbound (warn mode): ${Object.keys(verified).length} skill(s) allowed [${names}]. Warnings:\n${warnLines}`,
      },
    }));
    process.exit(0);
  } else {
    const lines = rejected.map((r) => `  ${RED}✗${RESET} ${r.name}: ${r.reason}`);
    process.stderr.write(`\n${TEAL}${BOLD}⬡ oathbound${RESET} ${RED}${BOLD}✗ Skill verification failed${RESET} ${DIM}(enforcement: ${enforcement})${RESET}\n${lines.join('\n')}\n${DIM}  Do NOT use unverified skills.${RESET}\n\n`);
    process.exit(2);
  }
}

// --- Verify --check (PreToolUse hook) ---
export async function verifyCheck(): Promise<void> {
  let input: Record<string, unknown>;
  try {
    input = JSON.parse(await readStdin());
  } catch {
    process.stderr.write('oathbound verify --check: invalid JSON on stdin\n');
    process.exit(1);
  }
  const sessionId: string = input.session_id as string;
  const toolName: string = (input.tool_name as string) ?? '';
  const toolInput = (input.tool_input as Record<string, unknown>) ?? {};

  if (!sessionId) process.exit(0);

  // Extract skill name based on which tool triggered the hook
  let baseName: string | null = null;

  if (toolName === 'Skill') {
    const skill = toolInput.skill as string | undefined;
    if (!skill) process.exit(0);
    baseName = skill.includes(':') ? skill.split(':').pop()! : skill;
  } else if (toolName === 'Bash') {
    baseName = skillNameFromCommand((toolInput.command as string) ?? '');
  } else if (toolName === 'Read') {
    baseName = skillNameFromPath((toolInput.file_path as string) ?? '');
  } else if (toolName === 'Glob' || toolName === 'Grep') {
    baseName = skillNameFromPath((toolInput.path as string) ?? '');
    if (!baseName) baseName = skillNameFromPath((toolInput.pattern as string) ?? '');
    if (!baseName) baseName = skillNameFromPath((toolInput.glob as string) ?? '');
  }

  // Not a skill-related operation — allow through
  if (!baseName) process.exit(0);

  // Read enforcement config
  const config = readOathboundConfig();
  const enforcement: EnforcementLevel = config?.enforcement ?? 'warn';

  const stateFile = sessionStatePath(sessionId);
  if (!existsSync(stateFile)) process.exit(0);

  let state: SessionState;
  try {
    state = JSON.parse(readFileSync(stateFile, 'utf-8'));
  } catch {
    process.stderr.write('oathbound verify --check: corrupt session state file\n');
    process.exit(1);
  }

  // Find skill directory — use skillDirs from session state (fast path)
  let skillDir: string | null = null;
  if (state.skillDirs?.[baseName]) {
    skillDir = state.skillDirs[baseName];
  } else {
    // Fallback: search all dirs, last match wins (local > global)
    for (const { path: dir } of findSkillsDirs()) {
      const candidate = join(dir, baseName);
      if (existsSync(candidate) && statSync(candidate).isDirectory()) {
        skillDir = candidate;
      }
    }
  }

  // Collect all known skills dirs for external access check
  const knownDirs: string[] = [];
  if (state.skillDirs) {
    // Derive parent dirs from skillDirs values
    const parentDirs = new Set<string>();
    for (const d of Object.values(state.skillDirs)) {
      parentDirs.add(join(d, '..'));
    }
    knownDirs.push(...parentDirs);
  } else {
    knownDirs.push(...findSkillsDirs().map(e => e.path));
  }

  // Check if the tool is accessing a skill in another project — not our concern
  if (knownDirs.length > 0 && isExternalSkillAccess(toolName, toolInput, knownDirs, baseName)) {
    process.exit(0);
  }

  if (!skillDir || !existsSync(skillDir) || !statSync(skillDir).isDirectory()) {
    enforceSkill(baseName, 'not installed locally', enforcement);
  }

  const currentHash = hashSkillDir(skillDir);
  const sessionHash = state.verified[baseName];

  if (!sessionHash) {
    enforceSkill(baseName, 'not verified at session start', enforcement);
  }

  if (currentHash !== sessionHash) {
    enforceSkill(baseName, `modified since session start (${currentHash.slice(0, 8)}… ≠ ${sessionHash.slice(0, 8)}…)`, enforcement);
  }

  process.stderr.write(`${GREEN}   ${baseName}: ${currentHash} ✓${RESET}\n`);

  // Hash matches — allow
  process.exit(0);
}

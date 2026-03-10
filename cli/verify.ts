import { createClient } from '@supabase/supabase-js';
import {
  writeFileSync, readFileSync, existsSync,
  readdirSync, statSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { BRAND, TEAL, GREEN, RED, YELLOW, DIM, BOLD, RESET } from './ui';
import { hashSkillDir } from './content-hash';
import { readOathboundConfig, type EnforcementLevel } from './config';

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

export function findSkillsDir(): string {
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

/** Check if a tool operation references a skill in another project, not ours. */
function isExternalSkillAccess(
  toolName: string,
  toolInput: Record<string, unknown>,
  skillsDir: string,
  baseName: string,
): boolean {
  const resolvedSkillsDir = resolve(skillsDir);

  if (toolName === 'Read') {
    const p = String(toolInput.file_path ?? '');
    if (p && !resolve(p).startsWith(resolvedSkillsDir)) return true;
  }
  if (toolName === 'Glob' || toolName === 'Grep') {
    const p = String(toolInput.path ?? '');
    if (p && !resolve(p).startsWith(resolvedSkillsDir)) return true;
  }
  if (toolName === 'Bash') {
    const cmd = String(toolInput.command ?? '');
    // If the command contains an absolute path to .claude/skills/baseName
    // that ISN'T under our project's skills dir, it's external
    if (cmd.includes('/.claude/skills/' + baseName) && !cmd.includes(resolvedSkillsDir)) return true;
  }

  return false;
}

// --- Verify (SessionStart hook) ---
export async function verify(supabaseUrl: string, supabaseAnonKey: string): Promise<void> {
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
    // Also check pattern/glob fields for skill path references
    if (!baseName) baseName = skillNameFromPath((toolInput.pattern as string) ?? '');
    if (!baseName) baseName = skillNameFromPath((toolInput.glob as string) ?? '');
  }

  // Not a skill-related operation — allow through
  if (!baseName) process.exit(0);

  // Read enforcement config
  const config = readOathboundConfig();
  const enforcement: EnforcementLevel = config?.enforcement ?? 'warn';

  // Check if the tool is accessing a skill in another project — not our concern
  const skillsDir = findSkillsDir();
  if (isExternalSkillAccess(toolName, toolInput, skillsDir, baseName)) {
    process.exit(0);
  }

  const stateFile = sessionStatePath(sessionId);
  if (!existsSync(stateFile)) process.exit(0);

  let state: SessionState;
  try {
    state = JSON.parse(readFileSync(stateFile, 'utf-8'));
  } catch {
    process.stderr.write('oathbound verify --check: corrupt session state file\n');
    process.exit(1);
  }

  // Find the skill directory and re-hash
  const skillDir = join(skillsDir, baseName);

  if (!existsSync(skillDir) || !statSync(skillDir).isDirectory()) {
    if (enforcement === 'warn') {
      warnSkill(baseName, 'not installed locally');
    } else {
      denySkill(baseName, 'not installed locally', enforcement);
    }
  }

  const currentHash = hashSkillDir(skillDir);
  const sessionHash = state.verified[baseName];

  if (!sessionHash) {
    if (enforcement === 'warn') {
      warnSkill(baseName, 'not verified at session start');
    } else {
      denySkill(baseName, 'not verified at session start', enforcement);
    }
  }

  if (currentHash !== sessionHash) {
    if (enforcement === 'warn') {
      warnSkill(baseName, `modified since session start (${currentHash.slice(0, 8)}… ≠ ${sessionHash.slice(0, 8)}…)`);
    } else {
      denySkill(baseName, `modified since session start — tampering detected (${currentHash.slice(0, 8)}… ≠ ${sessionHash.slice(0, 8)}…)`, enforcement);
    }
  }

  process.stderr.write(`${GREEN}   ${baseName}: ${currentHash} ✓${RESET}\n`);

  // Hash matches — allow
  process.exit(0);
}

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  writeFileSync, readFileSync, unlinkSync, existsSync, mkdirSync,
} from 'node:fs';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { intro, outro, select, confirm, cancel, isCancel } from '@clack/prompts';

import { BRAND, TEAL, GREEN, RED, YELLOW, DIM, BOLD, RESET, usage, agentUsage, fail, spinner } from './ui';
import {
  stripJsoncComments, writeOathboundConfig, mergeClaudeSettings,
  type EnforcementLevel, type MergeResult,
} from './config';
import { checkForUpdate, isNewer } from './update';
import { isValidSemver, compareSemver } from './semver';
import { verify, verifyCheck, findSkillsDir } from './verify';
import { login, logout, whoami } from './auth';
import { push } from './push';
import { search, parseSearchArgs } from './search';
import { agentPush } from './agent-push';
import { agentSearch, parseAgentSearchArgs } from './agent-search';

// Re-exports for tests
export { stripJsoncComments, writeOathboundConfig, mergeClaudeSettings, type MergeResult } from './config';
export { isNewer } from './update';
export { installDevDependency, type InstallResult, setup, addPrepareScript, type PrepareResult };

const VERSION = '0.15.0';

// --- Supabase ---
const SUPABASE_URL = 'https://mjnfqagwuewhgwbtrdgs.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_T-rk0azNRqAMLLGCyadyhQ_ulk9685n';
const API_BASE = process.env.OATHBOUND_API_URL ?? 'https://www.oathbound.ai';

// --- Types ---
interface SkillRow {
  id: string;
  name: string;
  namespace: string;
  version: string;
  tar_hash: string;
  storage_path: string;
}

function parseSkillArg(arg: string): { namespace: string; name: string; version: string | null } | null {
  const slash = arg.indexOf('/');
  if (slash < 1 || slash === arg.length - 1) return null;
  const afterSlash = arg.slice(slash + 1);
  const atIdx = afterSlash.indexOf('@');
  if (atIdx === -1) {
    return { namespace: arg.slice(0, slash), name: afterSlash, version: null };
  }
  const name = afterSlash.slice(0, atIdx);
  if (!name) return null;
  const vStr = afterSlash.slice(atIdx + 1);
  if (!isValidSemver(vStr)) return null;
  return { namespace: arg.slice(0, slash), name, version: vStr };
}

// --- Package manager detection ---
type PackageManager = 'bun' | 'pnpm' | 'yarn' | 'npm';

function detectPackageManager(): PackageManager {
  if (existsSync(join(process.cwd(), 'bun.lockb')) || existsSync(join(process.cwd(), 'bun.lock'))) return 'bun';
  if (existsSync(join(process.cwd(), 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(process.cwd(), 'yarn.lock'))) return 'yarn';
  return 'npm';
}

type InstallResult = 'installed' | 'skipped' | 'failed' | 'no-package-json';

function installDevDependency(): InstallResult {
  const pkgPath = join(process.cwd(), 'package.json');
  if (!existsSync(pkgPath)) return 'no-package-json';

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    if (pkg.devDependencies?.oathbound || pkg.dependencies?.oathbound) return 'skipped';
  } catch {
    // Malformed package.json — proceed with install attempt, let the package manager deal with it
  }

  const pm = detectPackageManager();
  const cmds: Record<PackageManager, [string, string[]]> = {
    bun: ['bun', ['add', '--dev', 'oathbound']],
    pnpm: ['pnpm', ['add', '--save-dev', 'oathbound']],
    yarn: ['yarn', ['add', '--dev', 'oathbound']],
    npm: ['npm', ['install', '--save-dev', 'oathbound']],
  };

  const [bin, args] = cmds[pm];
  try {
    execFileSync(bin, args, { stdio: 'pipe', cwd: process.cwd() });
    return 'installed';
  } catch {
    return 'failed';
  }
}

// --- Setup command (non-interactive, idempotent, runs via prepare hook) ---
function setup(): void {
  if (!existsSync(join(process.cwd(), '.oathbound.jsonc'))) return;
  const result = mergeClaudeSettings();
  if (result === 'malformed') {
    process.stderr.write('oathbound setup: .claude/settings.json is malformed — hooks not installed\n');
    process.exit(1);
  }
}

type PrepareResult = 'added' | 'appended' | 'skipped';

function addPrepareScript(): PrepareResult {
  const pkgPath = join(process.cwd(), 'package.json');
  if (!existsSync(pkgPath)) return 'skipped';

  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  } catch {
    return 'skipped'; // malformed package.json — let the package manager deal with it
  }

  const prepare = (pkg.scripts as Record<string, string> | undefined)?.prepare ?? '';
  if (prepare.includes('oathbound setup')) return 'skipped';

  const newPrepare = prepare ? `${prepare} && oathbound setup` : 'oathbound setup';
  pkg.scripts = { ...(pkg.scripts as Record<string, string> ?? {}), prepare: newPrepare };
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  return prepare ? 'appended' : 'added';
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

  // Install as devDependency
  let installResult = installDevDependency();

  if (installResult === 'no-package-json') {
    const shouldCreate = await confirm({
      message: 'No package.json found. Create a minimal one?',
    });

    if (isCancel(shouldCreate) || !shouldCreate) {
      cancel('Please run `npx oathbound init` inside of the folder where you want to run Claude Code. Oathbound currently needs an NPM package in order to run.');
      process.exit(1);
    }

    const dirName = basename(process.cwd())
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '-')
      .replace(/^[._]+/, '')
      .replace(/-+/g, '-')
      || 'project';
    writeFileSync(
      join(process.cwd(), 'package.json'),
      JSON.stringify({
        name: dirName,
        private: true,
        scripts: { prepare: 'oathbound setup' },
      }, null, 2) + '\n',
    );
    process.stderr.write(`${GREEN} ✓ Created package.json${RESET}\n`);
    installResult = installDevDependency();
  }

  switch (installResult) {
    case 'installed':
      process.stderr.write(`${GREEN} ✓ Added oathbound to devDependencies${RESET}\n`);
      break;
    case 'skipped':
      process.stderr.write(`${DIM}   oathbound already in dependencies — skipped${RESET}\n`);
      break;
    case 'failed':
      process.stderr.write(`${YELLOW} ⚠ Failed to add oathbound to devDependencies — install manually${RESET}\n`);
      break;
    case 'no-package-json':
      process.stderr.write(`${RED} ✗ package.json was created but could not be found — something went wrong${RESET}\n`);
      process.exit(1);
  }

  // Add prepare script to package.json
  const prepareResult = addPrepareScript();
  if (prepareResult === 'added' || prepareResult === 'appended') {
    process.stderr.write(`${GREEN} ✓ Added prepare hook to package.json${RESET}\n`);
  }

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

  outro(`🎉 Oath Bound set up complete!`);
}

// --- Pull command ---
async function pull(skillArg: string): Promise<void> {
  const parsed = parseSkillArg(skillArg);
  if (!parsed) usage();
  const { namespace, name, version } = parsed;
  const fullName = `${namespace}/${name}`;

  console.log(`\n${BRAND} ${TEAL}↓ Pulling ${fullName}${version ? `@${version}` : ''}...${RESET}`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // 1. Query for the skill
  let skill: SkillRow;

  if (version !== null) {
    const { data, error } = await supabase
      .from('skills')
      .select('id, name, namespace, version, tar_hash, storage_path')
      .eq('namespace', namespace)
      .eq('name', name)
      .eq('version', version)
      .single<SkillRow>();

    if (error || !data) {
      fail(`Skill not found: ${fullName}@${version}`);
    }
    skill = data;
  } else {
    // Fetch all versions, pick highest via semver comparison
    const { data, error } = await supabase
      .from('skills')
      .select('id, name, namespace, version, tar_hash, storage_path')
      .eq('namespace', namespace)
      .eq('name', name);

    if (error || !data || data.length === 0) {
      fail(`Skill not found: ${fullName}`);
    }
    skill = (data as SkillRow[]).sort((a, b) => compareSemver(a.version, b.version)).at(-1)!;
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
  const verifySpinner = spinner('Verifying...');
  const hash = createHash('sha256').update(buffer).digest('hex');
  verifySpinner.stop();

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

  // 5. Record download (non-fatal)
  try {
    const trackRes = await fetch(`${API_BASE}/api/downloads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skill_id: skill.id, version: skill.version }),
    });
    if (!trackRes.ok) {
      process.stderr.write(`${DIM}   [warn] download tracking failed (${trackRes.status})${RESET}\n`);
    }
  } catch {
    // Network error — non-fatal
  }

  // 6. Success
  console.log(`${BOLD}${GREEN} ✓ Skill verified${RESET}`);
  console.log(`${DIM}   ${fullName} v${skill.version}${RESET}`);
  console.log(`${DIM}   → ${join(skillsDir, name)}${RESET}`);
}

// --- Agent types ---
interface AgentRow {
  id: string;
  name: string;
  namespace: string;
  version: string;
  content_hash: string;
  storage_path: string;
  config: Record<string, unknown> | null;
}

// --- Agent pull ---
async function agentPull(agentArg: string): Promise<void> {
  const parsed = parseSkillArg(agentArg); // Same namespace/name[@version] format
  if (!parsed) usage();
  const { namespace, name, version } = parsed;
  const fullName = `${namespace}/${name}`;

  console.log(`\n${BRAND} ${TEAL}↓ Pulling agent ${fullName}${version ? `@${version}` : ''}...${RESET}`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Query for the agent
  let agent: AgentRow;

  if (version !== null) {
    const { data, error } = await supabase
      .from('agents')
      .select('id, name, namespace, version, content_hash, storage_path, config')
      .eq('namespace', namespace)
      .eq('name', name)
      .eq('version', version)
      .single<AgentRow>();

    if (error || !data) {
      fail(`Agent not found: ${fullName}@${version}`);
    }
    agent = data;
  } else {
    const { data, error } = await supabase
      .from('agents')
      .select('id, name, namespace, version, content_hash, storage_path, config')
      .eq('namespace', namespace)
      .eq('name', name);

    if (error || !data || data.length === 0) {
      fail(`Agent not found: ${fullName}`);
    }
    agent = (data as AgentRow[]).sort((a, b) => compareSemver(a.version, b.version)).at(-1)!;
  }

  // Download from storage
  const { data: blob, error: downloadError } = await supabase
    .storage
    .from('agents')
    .download(agent.storage_path);

  if (downloadError || !blob) {
    fail('Download failed', downloadError?.message ?? 'Unknown storage error');
  }

  const content = await blob.text();

  // Verify content hash
  const verifySpinner = spinner('Verifying...');
  const hash = createHash('sha256').update(content).digest('hex');
  verifySpinner.stop();

  console.log(`${DIM}   content hash: ${hash}${RESET}`);

  if (hash !== agent.content_hash) {
    console.log(`${RED}   expected: ${agent.content_hash}${RESET}`);
    fail('Verification failed', `Downloaded file does not match expected hash for ${fullName}`);
  }

  // Validate name has no path traversal characters
  if (name.includes('/') || name.includes('\\') || name.includes('..')) {
    fail('Invalid agent name', `Name "${name}" contains path traversal characters`);
  }

  // Ensure .claude/agents/ directory exists
  const agentsDir = join(process.cwd(), '.claude', 'agents');
  mkdirSync(agentsDir, { recursive: true });

  // Validate resolved path stays within agentsDir
  const targetPath = join(agentsDir, `${name}.md`);
  if (!targetPath.startsWith(agentsDir)) {
    fail('Invalid agent name', `Resolved path escapes agents directory`);
  }

  // Warn and confirm if hooks/mcpServers are present
  const config = agent.config;
  let hasDangerous = false;
  if (config?.hooks) {
    console.log(`\n${YELLOW}${BOLD} ⚠ This agent defines hooks (arbitrary command execution):${RESET}`);
    console.log(`${DIM}${JSON.stringify(config.hooks, null, 2)}${RESET}\n`);
    hasDangerous = true;
  }
  if (config?.mcpServers) {
    console.log(`\n${YELLOW}${BOLD} ⚠ This agent defines MCP servers (external connections):${RESET}`);
    console.log(`${DIM}${JSON.stringify(config.mcpServers, null, 2)}${RESET}\n`);
    hasDangerous = true;
  }
  if (hasDangerous) {
    const answer = await confirm({
      message: 'This agent contains security-sensitive configuration. Install anyway?',
    });
    if (isCancel(answer) || !answer) {
      fail('Aborted', 'Agent not installed');
    }
  }

  // Write agent file
  writeFileSync(targetPath, content);

  // Record download (non-fatal)
  try {
    const trackRes = await fetch(`${API_BASE}/api/downloads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: agent.id, version: agent.version }),
    });
    if (!trackRes.ok) {
      process.stderr.write(`${DIM}   [warn] download tracking failed (${trackRes.status})${RESET}\n`);
    }
  } catch {
    // Network error — non-fatal
  }

  console.log(`${BOLD}${GREEN} ✓ Agent verified${RESET}`);
  console.log(`${DIM}   ${fullName} v${agent.version}${RESET}`);
  console.log(`${DIM}   → ${targetPath}${RESET}`);
}

// --- Agent subcommand router ---
async function handleAgent(agentArgs: string[]): Promise<void> {
  const agentSub = agentArgs[0];

  if (!agentSub || agentSub === '--help' || agentSub === '-h') {
    agentUsage(agentSub ? 0 : 1);
  }

  if (agentSub === 'push') {
    const pushArgs = agentArgs.slice(1);
    const isPrivate = pushArgs.includes('--private');
    const pushPath = pushArgs.find(a => !a.startsWith('--'));
    await agentPush(pushPath, { private: isPrivate });
  } else if (agentSub === 'pull' || agentSub === 'install' || agentSub === 'i') {
    const target = agentArgs[1];
    if (!target) {
      fail('Missing agent name', 'Usage: oathbound agent pull <namespace/name[@version]>');
    }
    await agentPull(target);
  } else if (agentSub === 'search' || agentSub === 'list' || agentSub === 'ls') {
    const searchOpts = parseAgentSearchArgs(agentArgs.slice(1));
    await agentSearch(searchOpts);
  } else {
    agentUsage();
  }
}

// --- Entry ---
// import.meta.main guards against running when imported for testing.
// bun build --format=cjs converts this to a CJS-compatible check.
// Wrapped in async IIFE because top-level await is not available in CJS.
if (import.meta.main) {
(async () => {
const args = process.argv.slice(2);
const subcommand = args[0];

if (subcommand === '--help' || subcommand === '-h') {
  usage(0);
}

// Fire-and-forget auto-update on every command except verify (hooks must be fast)
if (subcommand !== 'verify' && subcommand !== 'setup') {
  const updatePromise = checkForUpdate(VERSION).catch(() => {});

  if (subcommand === '--version' || subcommand === '-v') {
    // Wait for update check so the user sees the notification
    await updatePromise;
    console.log(`oathbound ${VERSION}`);
    process.exit(0);
  }
}

if (subcommand === 'init') {
  await init().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    fail('Init failed', msg);
  });
} else if (subcommand === 'setup') {
  setup();
} else if (subcommand === 'verify') {
  const isCheck = args.includes('--check');
  const run = isCheck ? verifyCheck : () => verify(SUPABASE_URL, SUPABASE_ANON_KEY);
  await run().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    process.stderr.write(`oathbound verify: ${msg}\n`);
    process.exit(1);
  });
} else if (subcommand === 'login') {
  await login().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    fail('Login failed', msg);
  });
} else if (subcommand === 'logout') {
  await logout().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    fail('Logout failed', msg);
  });
} else if (subcommand === 'whoami') {
  await whoami().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    fail('Failed', msg);
  });
} else if (subcommand === 'push') {
  const pushArgs = args.slice(1);
  const isPrivate = pushArgs.includes('--private');
  const pushPath = pushArgs.find(a => !a.startsWith('--'));
  await push(pushPath, { private: isPrivate }).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    fail('Push failed', msg);
  });
} else if (subcommand === 'search' || subcommand === 'list' || subcommand === 'ls') {
  const searchOpts = parseSearchArgs(args.slice(1));
  await search(searchOpts).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    fail('Search failed', msg);
  });
} else if (subcommand === 'agent') {
  await handleAgent(args.slice(1)).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    fail('Agent command failed', msg);
  });
} else {
  const PULL_ALIASES = new Set(['pull', 'i', 'install']);
  const skillArg = args[1];

  if (!subcommand || !PULL_ALIASES.has(subcommand) || !skillArg) {
    usage();
  }

  await pull(skillArg).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    fail('Unexpected error', msg);
  });
}
})();
} // end if (import.meta.main)

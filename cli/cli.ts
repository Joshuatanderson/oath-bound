#!/usr/bin/env bun

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  writeFileSync, unlinkSync, existsSync, mkdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { intro, outro, select, cancel, isCancel } from '@clack/prompts';

import { BRAND, TEAL, GREEN, RED, DIM, BOLD, RESET, usage, fail, spinner } from './ui';
import {
  stripJsoncComments, writeOathboundConfig, mergeClaudeSettings,
  type EnforcementLevel, type MergeResult,
} from './config';
import { checkForUpdate, isNewer } from './update';
import { verify, verifyCheck, findSkillsDir } from './verify';

// Re-exports for tests
export { stripJsoncComments, writeOathboundConfig, mergeClaudeSettings, type MergeResult } from './config';
export { isNewer } from './update';

const VERSION = '0.4.0';

// --- Supabase ---
const SUPABASE_URL = 'https://mjnfqagwuewhgwbtrdgs.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_T-rk0azNRqAMLLGCyadyhQ_ulk9685n';

// --- Types ---
interface SkillRow {
  name: string;
  namespace: string;
  version: number;
  tar_hash: string;
  storage_path: string;
}

function parseSkillArg(arg: string): { namespace: string; name: string } | null {
  const slash = arg.indexOf('/');
  if (slash < 1 || slash === arg.length - 1) return null;
  return { namespace: arg.slice(0, slash), name: arg.slice(slash + 1) };
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

// --- Pull command ---
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
  const updatePromise = checkForUpdate(VERSION).catch(() => {});

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
  const run = isCheck ? verifyCheck : () => verify(SUPABASE_URL, SUPABASE_ANON_KEY);
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

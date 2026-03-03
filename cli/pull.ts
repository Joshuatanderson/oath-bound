import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

// --- Supabase ---
const SUPABASE_URL = 'https://mjnfqagwuewhgwbtrdgs.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_T-rk0azNRqAMLLGCyadyhQ_ulk9685n';

// --- ANSI ---
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
function usage(): never {
  console.log(`\n${DIM} oathbound pull <namespace/skill-name>${RESET}`);
  process.exit(1);
}

function fail(message: string, detail?: string): never {
  console.log(`\n${BOLD}${RED} ✗ ${message}${RESET}`);
  if (detail) {
    console.log(`${RED}   ${detail}${RESET}`);
  }
  process.exit(1);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function spinner(text: string): { stop: () => void } {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  process.stdout.write(`${GREEN} ${frames[0]} ${text}${RESET}`);
  const interval = setInterval(() => {
    i = (i + 1) % frames.length;
    process.stdout.write(`\r${GREEN} ${frames[i]} ${text}${RESET}`);
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

// --- Main ---
async function pull(skillArg: string): Promise<void> {
  const parsed = parseSkillArg(skillArg);
  if (!parsed) usage();
  const { namespace, name } = parsed;
  const fullName = `${namespace}/${name}`;

  console.log(`\n${DIM} ↓ Pulling ${fullName}...${RESET}`);

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

  // 3. Hash and verify (with theatre)
  const verify = spinner('Verifying...');
  const hash = createHash('sha256').update(buffer).digest('hex');
  await sleep(600);
  verify.stop();

  if (hash !== skill.tar_hash) {
    writeFileSync(tarFile, buffer);
    unlinkSync(tarFile);
    console.log(`${BOLD}${RED} ✗ Verification failed${RESET}`);
    console.log(`${RED}   Downloaded file does not match${RESET}`);
    console.log(`${RED}   expected hash for ${fullName}${RESET}`);
    process.exit(1);
  }

  // 4. Find target directory and extract
  const skillsDir = findSkillsDir();
  writeFileSync(tarFile, buffer);
  try {
    execSync(`tar -xf "${tarFile}" -C "${skillsDir}"`, { stdio: 'pipe' });
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
const subcommand = process.argv[2];
const skillArg = process.argv[3];

if (subcommand !== 'pull' || !skillArg) {
  usage();
}

pull(skillArg).catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : 'Unknown error';
  fail('Unexpected error', msg);
});

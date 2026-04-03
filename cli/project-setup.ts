import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// --- Package manager detection ---
export type PackageManager = 'bun' | 'pnpm' | 'yarn' | 'npm';

export function detectPackageManager(): PackageManager {
  if (existsSync(join(process.cwd(), 'bun.lockb')) || existsSync(join(process.cwd(), 'bun.lock'))) return 'bun';
  if (existsSync(join(process.cwd(), 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(process.cwd(), 'yarn.lock'))) return 'yarn';
  return 'npm';
}

export type InstallResult = 'installed' | 'skipped' | 'failed' | 'no-package-json';

export function installDevDependency(): InstallResult {
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

export type PrepareResult = 'added' | 'appended' | 'skipped';

export function addPrepareScript(): PrepareResult {
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

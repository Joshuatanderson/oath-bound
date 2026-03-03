#!/usr/bin/env bun
/**
 * Supabase Skill CLI
 *
 * Usage:
 *   bun .claude/skills/supabase/script.ts --action=query --sql="SELECT * FROM users LIMIT 5"
 *   bun .claude/skills/supabase/script.ts --action=list-tables
 *   bun .claude/skills/supabase/script.ts --action=push-migrations
 */

import * as fs from 'fs';
import * as path from 'path';
import { getCurrentEnvironment } from './src/index.ts';
import { executeRawSql } from './src/client.ts';
import { listTables } from './servers/supabase/database/listTables.ts';
import { assertAllowed, analyzeQueryRisk } from './src/permissions.ts';

type Action = 'push-migrations' | 'query' | 'list-tables';

interface CLIArgs {
  action?: Action;
  sql?: string;
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);
  const result: CLIArgs = {};

  const validActions: Action[] = ['push-migrations', 'query', 'list-tables'];

  for (const arg of args) {
    if (arg.startsWith('--action=')) {
      const actionValue = arg.split('=')[1] as Action;
      if (validActions.includes(actionValue)) {
        result.action = actionValue;
      } else {
        console.error(`Error: Invalid action '${actionValue}'. Must be one of: ${validActions.join(', ')}`);
        process.exit(1);
      }
    } else if (arg.startsWith('--sql=')) {
      result.sql = arg.split('=').slice(1).join('=');
    }
  }

  return result;
}

function getDbUrl(projectRef: string): string {
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!password) {
    throw new Error('SUPABASE_DB_PASSWORD not found. Set it in the project root .env file.');
  }
  // Use port 5432 (direct connection), NOT 6543 (pooler) — pooler causes
  // "prepared statement already exists" errors with supabase db push.
  return `postgresql://postgres.${projectRef}:${encodeURIComponent(password)}@aws-1-us-east-2.pooler.supabase.com:5432/postgres`;
}

function findFrontendDir(): string {
  const dir = process.cwd();
  if (fs.existsSync(path.join(dir, 'supabase', 'migrations'))) {
    return dir;
  }
  const frontendDir = path.join(dir, 'frontend');
  if (fs.existsSync(path.join(frontendDir, 'supabase', 'migrations'))) {
    return frontendDir;
  }
  throw new Error('Could not find supabase/migrations directory. Run from project root or frontend/.');
}

async function execCommand(command: string, cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(['sh', '-c', command], { cwd, stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { stdout, stderr, exitCode };
}

async function main(): Promise<void> {
  const args = parseArgs();

  const config = getCurrentEnvironment();

  console.log(`[Supabase] Project: ${config.name}`);
  console.log(`[Supabase] Ref: ${config.projectRef}`);

  if (!args.action) {
    return;
  }

  console.log(`\n[Action] ${args.action}`);

  try {
    switch (args.action) {
      case 'push-migrations': {
        assertAllowed('database', 'write');

        const frontendDir = findFrontendDir();
        const dbUrl = getDbUrl(config.projectRef);

        console.log(`[Migration] Pushing from: ${frontendDir}/supabase/migrations/`);

        const result = await execCommand(
          `bunx supabase db push --include-all --db-url "${dbUrl}"`,
          frontendDir,
        );

        if (result.stdout) console.log(result.stdout);
        if (result.stderr) console.error(result.stderr);

        if (result.exitCode !== 0) {
          throw new Error(`supabase db push failed with exit code ${result.exitCode}`);
        }

        console.log('\n✅ Migrations pushed successfully!');
        break;
      }

      case 'query': {
        if (!args.sql) {
          console.error('Error: --sql is required for query action');
          process.exit(1);
        }

        const riskLevel = analyzeQueryRisk(args.sql);
        console.log(`[Query] Risk level: ${riskLevel}`);
        assertAllowed('database', riskLevel);

        console.log(`[Query] Executing: ${args.sql}\n`);
        const result = await executeRawSql(args.sql);
        console.log('Result:');
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case 'list-tables': {
        const tables = await listTables();
        console.log('\nTables:');
        console.log(JSON.stringify(tables, null, 2));
        break;
      }

      default:
        console.error(`Unknown action: ${args.action}`);
        process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();

#!/usr/bin/env bun
/**
 * Supabase Skill CLI
 *
 * Usage:
 *   bun .claude/skills/supabase/script.ts --action=query --sql="SELECT * FROM users LIMIT 5"
 *   bun .claude/skills/supabase/script.ts --action=list-tables
 *   bun .claude/skills/supabase/script.ts --action=apply-migration --file=path/to/migration.sql
 *   bun .claude/skills/supabase/script.ts --action=deploy-function --name=my-function
 *   bun .claude/skills/supabase/script.ts --action=list-functions
 *   bun .claude/skills/supabase/script.ts --action=invoke-function --name=my-function --body='{"key":"value"}'
 */

import * as fs from 'fs';
import * as path from 'path';
import { getCurrentEnvironment } from './src/index.ts';
import { applyMigration } from './servers/supabase/database/applyMigration.ts';
import { executeRawSql } from './src/client.ts';
import { listTables } from './servers/supabase/database/listTables.ts';
import { assertAllowed, analyzeQueryRisk } from './src/permissions.ts';
import { deployEdgeFunction } from './servers/supabase/edge-functions/deployEdgeFunction.ts';
import { listEdgeFunctions } from './servers/supabase/edge-functions/listEdgeFunctions.ts';
import { invokeEdgeFunction } from './servers/supabase/edge-functions/invokeEdgeFunction.ts';
import type { EdgeFunctionFile } from './src/types.ts';

type Action = 'apply-migration' | 'query' | 'list-tables' | 'deploy-function' | 'list-functions' | 'invoke-function';

interface CLIArgs {
  action?: Action;
  file?: string;
  sql?: string;
  name?: string;
  body?: string;
  verifyJwt?: boolean;
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);
  const result: CLIArgs = {};

  const validActions = ['apply-migration', 'query', 'list-tables', 'deploy-function', 'list-functions', 'invoke-function'];

  for (const arg of args) {
    if (arg.startsWith('--action=')) {
      const actionValue = arg.split('=')[1] as Action;
      if (validActions.includes(actionValue)) {
        result.action = actionValue;
      } else {
        console.error(`Error: Invalid action '${actionValue}'. Must be one of: ${validActions.join(', ')}`);
        process.exit(1);
      }
    } else if (arg.startsWith('--file=')) {
      result.file = arg.split('=').slice(1).join('=');
    } else if (arg.startsWith('--sql=')) {
      result.sql = arg.split('=').slice(1).join('=');
    } else if (arg.startsWith('--name=')) {
      result.name = arg.split('=').slice(1).join('=');
    } else if (arg.startsWith('--body=')) {
      result.body = arg.split('=').slice(1).join('=');
    } else if (arg === '--verify-jwt') {
      result.verifyJwt = true;
    } else if (arg === '--no-verify-jwt') {
      result.verifyJwt = false;
    }
  }

  return result;
}

function extractMigrationName(filePath: string): string {
  const basename = path.basename(filePath, '.sql');
  const withoutTimestamp = basename.replace(/^\d{8}_/, '');
  return withoutTimestamp;
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
      case 'apply-migration': {
        if (!args.file) {
          console.error('Error: --file is required for apply-migration action');
          process.exit(1);
        }

        const filePath = path.resolve(args.file);
        if (!fs.existsSync(filePath)) {
          console.error(`Error: Migration file not found: ${filePath}`);
          process.exit(1);
        }

        const query = fs.readFileSync(filePath, 'utf-8');
        const migrationName = extractMigrationName(filePath);

        console.log(`[Migration] Name: ${migrationName}`);
        console.log(`[Migration] File: ${filePath}`);
        console.log(`[Migration] SQL Preview:\n${query.slice(0, 500)}${query.length > 500 ? '...' : ''}\n`);

        const riskLevel = analyzeQueryRisk(query);
        console.log(`[Migration] Risk level: ${riskLevel}`);
        assertAllowed('database', riskLevel);

        const result = await applyMigration({ name: migrationName, query });
        console.log(`\n✅ Migration applied successfully!`);
        console.log(`   Version: ${result.version}`);
        console.log(`   Name: ${result.name}`);
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

      case 'deploy-function': {
        if (!args.name) {
          console.error('Error: --name is required for deploy-function action');
          process.exit(1);
        }

        const functionsDir = path.resolve(process.cwd(), 'supabase', 'functions', args.name);
        if (!fs.existsSync(functionsDir)) {
          console.error(`Error: Function directory not found: ${functionsDir}`);
          process.exit(1);
        }

        console.log(`[Deploy] Function: ${args.name}`);
        console.log(`[Deploy] Directory: ${functionsDir}`);
        console.log(`[Deploy] Verify JWT: ${args.verifyJwt ?? false}`);

        const files: EdgeFunctionFile[] = [];
        const readFilesRecursively = (dir: string, basePath: string = '') => {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;

            if (entry.isDirectory()) {
              if (!['node_modules', '.git', 'dist'].includes(entry.name)) {
                readFilesRecursively(fullPath, relativePath);
              }
            } else if (entry.isFile()) {
              if (/\.(ts|js|json)$/.test(entry.name)) {
                const content = fs.readFileSync(fullPath, 'utf-8');
                files.push({ name: relativePath, content });
                console.log(`[Deploy] Including file: ${relativePath} (${content.length} bytes)`);
              }
            }
          }
        };

        readFilesRecursively(functionsDir);

        if (files.length === 0) {
          console.error('Error: No .ts, .js, or .json files found in function directory');
          process.exit(1);
        }

        console.log(`\n[Deploy] Deploying ${files.length} file(s)...`);

        const result = await deployEdgeFunction({
          name: args.name,
          files,
          verifyJwt: args.verifyJwt ?? false,
        });

        console.log(`\n✅ Function deployed successfully!`);
        console.log(`   Name: ${result.name}`);
        console.log(`   Slug: ${result.slug}`);
        console.log(`   Version: ${result.version}`);
        console.log(`   Status: ${result.status}`);
        break;
      }

      case 'list-functions': {
        const functions = await listEdgeFunctions();
        console.log('\nEdge Functions:');
        console.log(JSON.stringify(functions, null, 2));
        break;
      }

      case 'invoke-function': {
        if (!args.name) {
          console.error('Error: --name is required for invoke-function action');
          process.exit(1);
        }

        let body: Record<string, unknown> | undefined;
        if (args.body) {
          try {
            body = JSON.parse(args.body);
          } catch {
            console.error('Error: --body must be valid JSON');
            console.error(`Received: ${args.body}`);
            process.exit(1);
          }
        }

        console.log(`[Invoke] Function: ${args.name}`);
        if (body) {
          console.log(`[Invoke] Body: ${JSON.stringify(body, null, 2)}`);
        }
        console.log('');

        const result = await invokeEdgeFunction({
          name: args.name,
          body,
        });

        if (result.ok) {
          console.log(`✅ Function invoked successfully!`);
        } else {
          console.log(`⚠️  Function returned non-OK status`);
        }
        console.log(`   Status: ${result.status} ${result.statusText}`);
        console.log(`   Duration: ${result.duration}ms`);
        console.log('\nResponse:');
        if (typeof result.data === 'object') {
          console.log(JSON.stringify(result.data, null, 2));
        } else {
          console.log(result.data);
        }
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

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  stripJsoncComments,
  isNewer,
  writeOathboundConfig,
  mergeClaudeSettings,
} from './cli';

// --- stripJsoncComments ---
describe('stripJsoncComments', () => {
  test('strips line comments', () => {
    const input = '{\n  // this is a comment\n  "key": "value"\n}';
    const result = stripJsoncComments(input);
    expect(JSON.parse(result)).toEqual({ key: 'value' });
  });

  test('preserves URLs in strings', () => {
    const input = '{ "url": "https://example.com/foo" }';
    const result = stripJsoncComments(input);
    expect(JSON.parse(result)).toEqual({ url: 'https://example.com/foo' });
  });

  test('handles input with no comments', () => {
    const input = '{ "key": "value" }';
    expect(stripJsoncComments(input)).toBe(input);
  });

  test('strips multiple comments', () => {
    const input = '// top comment\n{\n  // mid comment\n  "a": 1\n  // end comment\n}';
    const result = stripJsoncComments(input);
    expect(JSON.parse(result)).toEqual({ a: 1 });
  });

  test('handles escaped quotes in strings', () => {
    const input = '{ "key": "val\\"ue // not a comment" }';
    const result = stripJsoncComments(input);
    expect(JSON.parse(result)).toEqual({ key: 'val"ue // not a comment' });
  });
});

// --- isNewer ---
describe('isNewer', () => {
  test('newer patch → true', () => {
    expect(isNewer('0.2.1', '0.2.0')).toBe(true);
  });

  test('newer minor → true', () => {
    expect(isNewer('0.3.0', '0.2.0')).toBe(true);
  });

  test('newer major → true', () => {
    expect(isNewer('1.0.0', '0.9.9')).toBe(true);
  });

  test('same version → false', () => {
    expect(isNewer('0.2.0', '0.2.0')).toBe(false);
  });

  test('older version → false', () => {
    expect(isNewer('0.1.0', '0.2.0')).toBe(false);
  });

  test('handles v prefix', () => {
    expect(isNewer('v0.3.0', 'v0.2.0')).toBe(true);
    expect(isNewer('v0.2.0', '0.2.0')).toBe(false);
  });
});

// --- writeOathboundConfig ---
describe('writeOathboundConfig', () => {
  let tmpDir: string;
  let origCwd: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'oathbound-test-'));
    origCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(origCwd);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('creates config with correct enforcement', () => {
    const result = writeOathboundConfig('registered');
    expect(result).toBe(true);

    const content = readFileSync(join(tmpDir, '.oathbound.jsonc'), 'utf-8');
    expect(content).toContain('"enforcement": "registered"');

    // Verify it parses after stripping comments
    const parsed = JSON.parse(stripJsoncComments(content));
    expect(parsed.enforcement).toBe('registered');
    expect(parsed.version).toBe(1);
  });

  test('skips if file already exists', () => {
    writeFileSync(join(tmpDir, '.oathbound.jsonc'), '{}');
    const result = writeOathboundConfig('warn');
    expect(result).toBe(false);
  });

  test('output is valid JSON after comment stripping', () => {
    writeOathboundConfig('audited');
    const content = readFileSync(join(tmpDir, '.oathbound.jsonc'), 'utf-8');
    const parsed = JSON.parse(stripJsoncComments(content));
    expect(parsed.$schema).toBe('https://oathbound.ai/schemas/config-v1.json');
  });
});

// --- mergeClaudeSettings ---
describe('mergeClaudeSettings', () => {
  let tmpDir: string;
  let origCwd: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'oathbound-test-'));
    origCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(origCwd);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('creates .claude/settings.json from scratch', () => {
    const result = mergeClaudeSettings();
    expect(result).toBe('created');

    const settings = JSON.parse(readFileSync(join(tmpDir, '.claude', 'settings.json'), 'utf-8'));
    expect(settings.hooks.SessionStart).toHaveLength(1);
    expect(settings.hooks.PreToolUse).toHaveLength(1);
    expect(settings.hooks.SessionStart[0].hooks[0].command).toBe('oathbound verify');
    expect(settings.hooks.PreToolUse[0].matcher).toBe('Skill');
  });

  test('merges without clobbering existing hooks', () => {
    mkdirSync(join(tmpDir, '.claude'), { recursive: true });
    const existing = {
      hooks: {
        SessionStart: [
          { matcher: '', hooks: [{ type: 'command', command: 'echo hello' }] },
        ],
      },
      someOtherKey: true,
    };
    writeFileSync(join(tmpDir, '.claude', 'settings.json'), JSON.stringify(existing));

    const result = mergeClaudeSettings();
    expect(result).toBe('merged');

    const settings = JSON.parse(readFileSync(join(tmpDir, '.claude', 'settings.json'), 'utf-8'));
    // Original hook preserved
    expect(settings.hooks.SessionStart).toHaveLength(2);
    expect(settings.hooks.SessionStart[0].hooks[0].command).toBe('echo hello');
    // Oathbound hooks added
    expect(settings.hooks.SessionStart[1].hooks[0].command).toBe('oathbound verify');
    expect(settings.hooks.PreToolUse).toHaveLength(1);
    // Other keys preserved
    expect(settings.someOtherKey).toBe(true);
  });

  test('skips if oathbound hooks already present', () => {
    mkdirSync(join(tmpDir, '.claude'), { recursive: true });
    const existing = {
      hooks: {
        SessionStart: [
          { matcher: '', hooks: [{ type: 'command', command: 'oathbound verify' }] },
        ],
      },
    };
    writeFileSync(join(tmpDir, '.claude', 'settings.json'), JSON.stringify(existing));

    const result = mergeClaudeSettings();
    expect(result).toBe('skipped');
  });

  test('returns malformed for invalid JSON', () => {
    mkdirSync(join(tmpDir, '.claude'), { recursive: true });
    writeFileSync(join(tmpDir, '.claude', 'settings.json'), '{ broken json !!!');

    const result = mergeClaudeSettings();
    expect(result).toBe('malformed');
  });
});

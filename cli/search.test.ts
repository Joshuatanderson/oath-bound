import { describe, test, expect } from 'bun:test';
import { parseSearchArgs } from './search';

// --- Unit tests: parseSearchArgs ---

describe('parseSearchArgs', () => {
  test('no args → empty options', () => {
    expect(parseSearchArgs([])).toEqual({});
  });

  test('positional arg → query', () => {
    expect(parseSearchArgs(['docker'])).toEqual({ query: 'docker' });
  });

  test('--user flag', () => {
    expect(parseSearchArgs(['--user', 'josh'])).toEqual({ namespace: 'josh' });
  });

  test('-u shorthand', () => {
    expect(parseSearchArgs(['-u', 'josh'])).toEqual({ namespace: 'josh' });
  });

  test('--sparse flag', () => {
    expect(parseSearchArgs(['--sparse'])).toEqual({ sparse: true });
  });

  test('-s shorthand', () => {
    expect(parseSearchArgs(['-s'])).toEqual({ sparse: true });
  });

  test('--limit flag', () => {
    expect(parseSearchArgs(['--limit', '10'])).toEqual({ limit: 10 });
  });

  test('--offset flag', () => {
    expect(parseSearchArgs(['--offset', '50'])).toEqual({ offset: 50 });
  });

  test('combined flags', () => {
    const result = parseSearchArgs(['docker', '--user', 'josh', '-s', '--limit', '5', '--offset', '10']);
    expect(result).toEqual({
      query: 'docker',
      namespace: 'josh',
      sparse: true,
      limit: 5,
      offset: 10,
    });
  });
});

// --- Integration tests: live GET /api/skills ---

const API_BASE = process.env.OATHBOUND_API_URL ?? 'https://www.oathbound.ai';

describe('GET /api/skills (live)', () => {
  test('default list returns skills with pagination metadata', async () => {
    const res = await fetch(`${API_BASE}/api/skills`);
    expect(res.ok).toBe(true);

    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(Array.isArray(data.skills)).toBe(true);
    expect(typeof data.total).toBe('number');
    expect(typeof data.limit).toBe('number');
    expect(typeof data.offset).toBe('number');

    if (data.skills.length > 0) {
      const skill = data.skills[0];
      expect(skill).toHaveProperty('name');
      expect(skill).toHaveProperty('namespace');
      expect(skill).toHaveProperty('description');
      expect(skill).toHaveProperty('version');
    }
  });

  test('sparse mode omits author/audit_status/license', async () => {
    const res = await fetch(`${API_BASE}/api/skills?sparse=true`);
    const data = await res.json();
    expect(data.ok).toBe(true);

    if (data.skills.length > 0) {
      const skill = data.skills[0];
      expect(skill).toHaveProperty('name');
      expect(skill).toHaveProperty('version');
      expect(skill).not.toHaveProperty('author');
      expect(skill).not.toHaveProperty('audit_status');
      expect(skill).not.toHaveProperty('license');
    }
  });

  test('namespace filter returns only matching skills', async () => {
    // First get all skills to find a valid namespace
    const allRes = await fetch(`${API_BASE}/api/skills?sparse=true&limit=1`);
    const allData = await allRes.json();
    if (allData.skills.length === 0) return; // no skills to test

    const ns = allData.skills[0].namespace;
    const res = await fetch(`${API_BASE}/api/skills?namespace=${encodeURIComponent(ns)}`);
    const data = await res.json();
    expect(data.ok).toBe(true);

    for (const skill of data.skills) {
      expect(skill.namespace).toBe(ns);
    }
  });

  test('search query filters results', async () => {
    // First get a skill name to search for
    const allRes = await fetch(`${API_BASE}/api/skills?sparse=true&limit=1`);
    const allData = await allRes.json();
    if (allData.skills.length === 0) return;

    const term = allData.skills[0].name;
    const res = await fetch(`${API_BASE}/api/skills?q=${encodeURIComponent(term)}`);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.skills.length).toBeGreaterThan(0);

    // The searched skill should appear in results
    const found = data.skills.some((s: { name: string }) =>
      s.name.toLowerCase().includes(term.toLowerCase())
    );
    expect(found).toBe(true);
  });

  test('pagination returns non-overlapping pages', async () => {
    const res1 = await fetch(`${API_BASE}/api/skills?sparse=true&limit=2&offset=0`);
    const data1 = await res1.json();
    if (data1.total <= 2) return; // not enough skills

    const res2 = await fetch(`${API_BASE}/api/skills?sparse=true&limit=2&offset=2`);
    const data2 = await res2.json();

    const keys1 = new Set(data1.skills.map((s: { namespace: string; name: string }) => `${s.namespace}/${s.name}`));
    for (const s of data2.skills) {
      expect(keys1.has(`${s.namespace}/${s.name}`)).toBe(false);
    }
  });

  test('deduplication: no duplicate namespace/name keys', async () => {
    const res = await fetch(`${API_BASE}/api/skills?limit=100`);
    const data = await res.json();
    expect(data.ok).toBe(true);

    const keys = data.skills.map((s: { namespace: string; name: string }) => `${s.namespace}/${s.name}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test('invalid limit is clamped to 100', async () => {
    const res = await fetch(`${API_BASE}/api/skills?limit=999`);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.limit).toBeLessThanOrEqual(100);
  });
});

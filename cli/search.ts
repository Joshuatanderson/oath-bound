import { BRAND, TEAL, GREEN, DIM, BOLD, RESET, fail, spinner } from './ui';

const API_BASE = process.env.OATHBOUND_API_URL ?? 'https://www.oathbound.ai';

export interface SearchOptions {
  query?: string;
  namespace?: string;
  sparse?: boolean;
  sort?: 'downloads';
  limit?: number;
  offset?: number;
}

export function parseSearchArgs(args: string[]): SearchOptions {
  const opts: SearchOptions = {};
  let i = 0;

  while (i < args.length) {
    const arg = args[i];

    if (arg === '--user' || arg === '-u') {
      opts.namespace = args[++i];
    } else if (arg === '--sparse' || arg === '-s') {
      opts.sparse = true;
    } else if (arg === '--sort') {
      const val = args[++i];
      if (val === 'downloads') opts.sort = 'downloads';
    } else if (arg === '--limit') {
      opts.limit = parseInt(args[++i], 10);
    } else if (arg === '--offset') {
      opts.offset = parseInt(args[++i], 10);
    } else if (!arg.startsWith('-')) {
      opts.query = arg;
    }

    i++;
  }

  return opts;
}

interface SkillAuthor {
  username: string;
  display_name: string | null;
  verified: boolean;
}

interface SkillResult {
  name: string;
  namespace: string;
  description: string;
  version: string;
  license?: string;
  visibility?: string;
  author?: SkillAuthor;
  audit_status?: 'passed' | 'failed' | 'none';
  download_count?: number;
}

interface SearchResponse {
  ok: boolean;
  skills: SkillResult[];
  total: number;
  limit: number;
  offset: number;
  error?: string;
}

export async function search(opts: SearchOptions): Promise<void> {
  const params = new URLSearchParams();
  if (opts.query) params.set('q', opts.query);
  if (opts.namespace) params.set('namespace', opts.namespace);
  if (opts.sparse) params.set('sparse', 'true');
  if (opts.sort) params.set('sort', opts.sort);
  if (opts.limit != null) params.set('limit', String(opts.limit));
  if (opts.offset != null) params.set('offset', String(opts.offset));

  const url = `${API_BASE}/api/skills?${params}`;

  const sp = spinner('Searching...');

  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    sp.stop();
    const msg = err instanceof Error ? err.message : 'Unknown error';
    fail('Search failed', msg);
  }

  sp.stop();

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json() as { error?: string };
      if (body.error) detail = body.error;
    } catch { /* ignore parse errors */ }
    fail('Search failed', detail);
  }

  const data = await res.json() as SearchResponse;

  if (!data.ok || !data.skills) {
    fail('Search failed', data.error ?? 'Unexpected response');
  }

  const { skills, total, offset } = data;

  if (skills.length === 0) {
    console.log(`\n${BRAND} ${DIM}No skills found.${RESET}`);
    return;
  }

  const showing = offset > 0
    ? `Showing ${offset + 1}–${offset + skills.length} of ${total}`
    : `${total} skill${total === 1 ? '' : 's'} found`;

  console.log(`\n${BRAND} ${TEAL}${showing}${RESET}\n`);

  for (const skill of skills) {
    const id = `${skill.namespace}/${skill.name}`;
    const ver = `v${skill.version}`;

    // Line 1: name + version
    console.log(`  ${BOLD}${id}${RESET} ${DIM}${ver}${RESET}`);

    // Line 2: description
    if (skill.description) {
      console.log(`  ${DIM}${skill.description}${RESET}`);
    }

    // Line 3: metadata (non-sparse only)
    if (!opts.sparse && (skill.author || skill.audit_status || skill.license)) {
      const parts: string[] = [];
      if (skill.author) {
        const name = skill.author.display_name || skill.author.username;
        parts.push(`by ${name}${skill.author.verified ? ' ✓' : ''}`);
      }
      if (skill.license) parts.push(skill.license);
      if (skill.download_count != null) parts.push(`↓ ${skill.download_count}`);
      if (skill.audit_status && skill.audit_status !== 'none') {
        parts.push(skill.audit_status === 'passed' ? `${GREEN}audited${RESET}` : 'audit failed');
      }
      if (skill.visibility === 'private') parts.push('private');
      if (parts.length > 0) {
        console.log(`  ${DIM}${parts.join(' · ')}${RESET}`);
      }
    }

    console.log(); // blank line between skills
  }

  // Pagination hint
  if (offset + skills.length < total) {
    const nextOffset = offset + skills.length;
    console.log(`${DIM}  Use --offset ${nextOffset} to see more${RESET}\n`);
  }
}

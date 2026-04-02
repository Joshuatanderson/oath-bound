import { BRAND, TEAL, GREEN, DIM, BOLD, RESET, fail, spinner } from './ui';

const API_BASE = process.env.OATHBOUND_API_URL ?? 'https://www.oathbound.ai';

export interface AgentSearchOptions {
  query?: string;
  namespace?: string;
  sparse?: boolean;
  sort?: 'downloads';
  limit?: number;
  offset?: number;
}

export function parseAgentSearchArgs(args: string[]): AgentSearchOptions {
  const opts: AgentSearchOptions = {};
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

interface AgentAuthor {
  username: string;
  display_name: string | null;
  verified: boolean;
}

interface AgentResult {
  name: string;
  namespace: string;
  description: string;
  version: string;
  license?: string;
  visibility?: string;
  model?: string | null;
  tools?: string | null;
  permission_mode?: string | null;
  effort?: string | null;
  author?: AgentAuthor;
  download_count?: number;
}

interface AgentSearchResponse {
  ok: boolean;
  agents: AgentResult[];
  total: number;
  limit: number;
  offset: number;
  error?: string;
}

export async function agentSearch(opts: AgentSearchOptions): Promise<void> {
  const params = new URLSearchParams();
  if (opts.query) params.set('q', opts.query);
  if (opts.namespace) params.set('namespace', opts.namespace);
  if (opts.sparse) params.set('sparse', 'true');
  if (opts.sort) params.set('sort', opts.sort);
  if (opts.limit != null) params.set('limit', String(opts.limit));
  if (opts.offset != null) params.set('offset', String(opts.offset));

  const url = `${API_BASE}/api/agents?${params}`;

  const sp = spinner('Searching agents...');

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

  const data = await res.json() as AgentSearchResponse;

  if (!data.ok || !data.agents) {
    fail('Search failed', data.error ?? 'Unexpected response');
  }

  const { agents, total, offset } = data;

  if (agents.length === 0) {
    console.log(`\n${BRAND} ${DIM}No agents found.${RESET}`);
    return;
  }

  const showing = offset > 0
    ? `Showing ${offset + 1}–${offset + agents.length} of ${total}`
    : `${total} agent${total === 1 ? '' : 's'} found`;

  console.log(`\n${BRAND} ${TEAL}${showing}${RESET}\n`);

  for (const agent of agents) {
    const id = `${agent.namespace}/${agent.name}`;
    const ver = `v${agent.version}`;

    // Line 1: name + version
    console.log(`  ${BOLD}${id}${RESET} ${DIM}${ver}${RESET}`);

    // Line 2: description
    if (agent.description) {
      console.log(`  ${DIM}${agent.description}${RESET}`);
    }

    // Line 3: agent-specific metadata (non-sparse only)
    if (!opts.sparse) {
      const parts: string[] = [];
      if (agent.author) {
        const name = agent.author.display_name || agent.author.username;
        parts.push(`by ${name}${agent.author.verified ? ' ✓' : ''}`);
      }
      if (agent.license) parts.push(agent.license);
      if (agent.download_count != null) parts.push(`↓ ${agent.download_count}`);
      if (agent.model) parts.push(`model: ${agent.model}`);
      if (agent.permission_mode) parts.push(`mode: ${agent.permission_mode}`);
      if (agent.effort) parts.push(`effort: ${agent.effort}`);
      if (agent.visibility === 'private') parts.push('private');
      if (parts.length > 0) {
        console.log(`  ${DIM}${parts.join(' · ')}${RESET}`);
      }
    }

    console.log(); // blank line between agents
  }

  // Pagination hint
  if (offset + agents.length < total) {
    const nextOffset = offset + agents.length;
    console.log(`${DIM}  Use --offset ${nextOffset} to see more${RESET}\n`);
  }
}

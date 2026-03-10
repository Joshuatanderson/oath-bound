import { createClient } from '@supabase/supabase-js';
import { spawn } from 'node:child_process';
import {
  mkdirSync, writeFileSync, readFileSync, unlinkSync, existsSync,
} from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { intro, outro } from '@clack/prompts';
import { BRAND, GREEN, DIM, BOLD, RESET, fail, spinner } from './ui';

const SUPABASE_URL = 'https://mjnfqagwuewhgwbtrdgs.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_T-rk0azNRqAMLLGCyadyhQ_ulk9685n';
const API_BASE = process.env.OATHBOUND_API_URL ?? 'https://www.oathbound.ai';

const AUTH_DIR = join(homedir(), '.oathbound');
const AUTH_FILE = join(AUTH_DIR, 'auth.json');

interface StoredSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

function saveSession(session: StoredSession): void {
  mkdirSync(AUTH_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(AUTH_FILE, JSON.stringify(session, null, 2), { mode: 0o600 });
}

function loadSession(): StoredSession | null {
  if (!existsSync(AUTH_FILE)) return null;
  try {
    return JSON.parse(readFileSync(AUTH_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

function clearSession(): void {
  if (existsSync(AUTH_FILE)) unlinkSync(AUTH_FILE);
}

function openBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'cmd'
    : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
  } catch {
    // URL is already printed — user can open manually
  }
}

const SUCCESS_HTML = `<!DOCTYPE html>
<html><head><title>Oathbound CLI</title></head>
<body style="font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#0a0a0a;color:#e5e5e5">
<div style="text-align:center">
<h1 style="color:#3fa8a4">&#10003; Logged in</h1>
<p>You can close this tab and return to your terminal.</p>
</div></body></html>`;

const ERROR_HTML = `<!DOCTYPE html>
<html><head><title>Oathbound CLI</title></head>
<body style="font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#0a0a0a;color:#e5e5e5">
<div style="text-align:center">
<h1 style="color:#ef4444">Login failed</h1>
<p>Missing session tokens. Please try again.</p>
</div></body></html>`;

export async function login(): Promise<void> {
  intro(BRAND);

  let resolveSession: (s: StoredSession) => void;
  let rejectSession: (e: Error) => void;
  const sessionPromise = new Promise<StoredSession>((res, rej) => {
    resolveSession = res;
    rejectSession = rej;
  });

  const server = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname !== '/callback') {
        return new Response('Not found', { status: 404 });
      }

      const accessToken = url.searchParams.get('access_token');
      const refreshToken = url.searchParams.get('refresh_token');
      const expiresAt = url.searchParams.get('expires_at');

      if (!accessToken || !refreshToken || !expiresAt) {
        rejectSession!(new Error('Missing session tokens from callback'));
        setTimeout(() => server.stop(), 500);
        return new Response(ERROR_HTML, { headers: { 'Content-Type': 'text/html' } });
      }

      resolveSession!({
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: Number(expiresAt),
      });

      setTimeout(() => server.stop(), 500);
      return new Response(SUCCESS_HTML, { headers: { 'Content-Type': 'text/html' } });
    },
  });

  const port = server.port;
  const loginUrl = `${API_BASE}/cli-login?port=${port}`;

  console.log(`${DIM}   Opening browser...${RESET}`);
  console.log(`${DIM}   If it doesn't open, visit:${RESET}`);
  console.log(`${DIM}   ${loginUrl}${RESET}\n`);

  openBrowser(loginUrl);

  const spin = spinner('Waiting for login...');

  const timeout = new Promise<never>((_, rej) =>
    setTimeout(() => rej(new Error('Login timed out (2 minutes). Please try again.')), 120_000),
  );

  let session: StoredSession;
  try {
    session = await Promise.race([sessionPromise, timeout]);
  } catch (err) {
    spin.stop();
    server.stop();
    fail('Login failed', err instanceof Error ? err.message : 'Unknown error');
  }

  spin.stop();
  saveSession(session);

  // Get username for display
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: { user } } = await supabase.auth.getUser();
  let displayName = user?.email ?? 'unknown';
  if (user) {
    const { data: userRecord } = await supabase
      .from('users')
      .select('username')
      .eq('user_id', user.id)
      .single();
    if (userRecord?.username) displayName = userRecord.username;
  }

  outro(`Logged in as ${BOLD}${displayName}${RESET}`);
}

export async function logout(): Promise<void> {
  clearSession();
  console.log(`\n${BRAND} ${GREEN}✓ Logged out${RESET}`);
}

export async function getAccessToken(): Promise<string> {
  const session = loadSession();
  if (!session) {
    fail('Not logged in', 'Run: oathbound login');
  }

  // Token still valid (with 60s buffer) — use it directly
  const now = Math.floor(Date.now() / 1000);
  if (session.expires_at > now + 60) {
    return session.access_token;
  }

  // Token expired or expiring soon — refresh
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });

  if (error || !data.session) {
    clearSession();
    fail('Session expired', 'Run: oathbound login');
  }

  saveSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at!,
  });

  return data.session.access_token;
}

export async function whoami(): Promise<void> {
  const token = await getAccessToken();

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    fail('Failed to get user', error?.message ?? 'Unknown error');
  }

  const { data: userRecord } = await supabase
    .from('users')
    .select('username')
    .eq('user_id', user.id)
    .single();

  console.log(`\n${BRAND}`);
  console.log(`  ${BOLD}Username:${RESET} ${userRecord?.username ?? 'not set'}`);
  console.log(`  ${DIM}Email:${RESET}    ${user.email ?? 'unknown'}`);
}

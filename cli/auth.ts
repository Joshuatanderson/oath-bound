import { createClient } from '@supabase/supabase-js';
import {
  mkdirSync, writeFileSync, readFileSync, unlinkSync, existsSync,
} from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { intro, outro, text, password, cancel, isCancel } from '@clack/prompts';
import { BRAND, GREEN, DIM, BOLD, RESET, fail, spinner } from './ui';

const SUPABASE_URL = 'https://mjnfqagwuewhgwbtrdgs.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_T-rk0azNRqAMLLGCyadyhQ_ulk9685n';

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

export async function login(): Promise<void> {
  intro(BRAND);

  const email = await text({
    message: 'Email:',
    validate(value) {
      if (!value.includes('@')) return 'Please enter a valid email';
    },
  });
  if (isCancel(email)) { cancel('Login cancelled.'); process.exit(0); }

  const pw = await password({ message: 'Password:' });
  if (isCancel(pw)) { cancel('Login cancelled.'); process.exit(0); }

  const spin = spinner('Signing in...');

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email as string,
    password: pw as string,
  });

  spin.stop();

  if (error || !data.session) {
    fail('Login failed', error?.message ?? 'No session returned');
  }

  saveSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at!,
  });

  // Get username for display
  const { data: userRecord } = await supabase
    .from('users')
    .select('username')
    .eq('user_id', data.user.id)
    .single();

  const displayName = userRecord?.username ?? data.user.email ?? 'unknown';
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

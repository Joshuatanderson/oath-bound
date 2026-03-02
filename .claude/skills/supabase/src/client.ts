import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getCurrentEnvironment, getProjectRef } from './environments.ts';

const MANAGEMENT_API_BASE = 'https://api.supabase.com/v1';

export { getCurrentEnvironment, getProjectRef };

interface ClientConfig {
  useServiceRole?: boolean;
}

interface EnvVars {
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  accountToken: string;
}

function getEnvVars(): EnvVars {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const accountToken = process.env.SUPABASE_ACCOUNT_TOKEN;

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  }
  if (!anonKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY is not set');
  }
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  }
  if (!accountToken) {
    throw new Error('SUPABASE_ACCOUNT_TOKEN is not set');
  }

  return { supabaseUrl, anonKey, serviceRoleKey, accountToken };
}

/**
 * Creates a Supabase client.
 * Use serviceRole for admin operations, anon for user-context operations.
 */
export function createSupabaseClient(config: ClientConfig = {}): SupabaseClient {
  const env = getEnvVars();
  const key = config.useServiceRole ? env.serviceRoleKey : env.anonKey;

  return createClient(env.supabaseUrl, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Makes a request to the Supabase Management API.
 */
export async function managementApiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const env = getEnvVars();
  const url = `${MANAGEMENT_API_BASE}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${env.accountToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Management API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

/**
 * Makes a multipart/form-data request to the Supabase Management API.
 * Used for edge function deployment which requires file uploads.
 */
export async function managementApiMultipartRequest<T>(
  endpoint: string,
  formData: FormData,
  method: 'POST' | 'PATCH' = 'POST'
): Promise<T> {
  const env = getEnvVars();
  const url = `${MANAGEMENT_API_BASE}${endpoint}`;

  const response = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${env.accountToken}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Management API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

/**
 * Executes raw SQL using the Management API.
 */
export async function executeRawSql<T>(query: string): Promise<T[]> {
  const projectRef = getProjectRef();

  return managementApiRequest<T[]>(`/projects/${projectRef}/database/query`, {
    method: 'POST',
    body: JSON.stringify({ query }),
  });
}

/**
 * Makes a GraphQL request to the Supabase docs API.
 */
export async function docsGraphqlRequest<T>(query: string): Promise<T> {
  const DOCS_GRAPHQL_ENDPOINT = 'https://supabase.com/docs/api/graphql';

  const response = await fetch(DOCS_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Docs GraphQL API error (${response.status}): ${errorText}`);
  }

  const result = await response.json();

  if (result.errors && result.errors.length > 0) {
    const errorMessages = result.errors.map((e: { message: string }) => e.message).join(', ');
    throw new Error(`GraphQL errors: ${errorMessages}`);
  }

  return result;
}

export { MANAGEMENT_API_BASE };

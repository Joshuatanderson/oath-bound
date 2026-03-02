import { getProjectRef } from '../../../src/client.ts';
import { assertAllowed } from '../../../src/permissions.ts';
import type { EdgeFunctionInvokeResult } from '../../../src/types.ts';

interface InvokeOptions {
  name: string;
  body?: Record<string, unknown>;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
}

/**
 * Invokes a Supabase Edge Function via its HTTP endpoint.
 */
export async function invokeEdgeFunction(options: InvokeOptions): Promise<EdgeFunctionInvokeResult> {
  const { name, body, method = 'POST', headers: customHeaders = {} } = options;

  assertAllowed('edge-functions', 'write');

  const projectRef = getProjectRef();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  }

  const url = `https://${projectRef}.supabase.co/functions/v1/${name}`;

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
    ...customHeaders,
  };

  const fetchOptions: RequestInit = {
    method,
    headers,
  };

  if (body && method !== 'GET') {
    fetchOptions.body = JSON.stringify(body);
  }

  const startTime = Date.now();
  const response = await fetch(url, fetchOptions);
  const duration = Date.now() - startTime;

  let data: unknown;
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = await response.text();
    }
  } else {
    data = await response.text();
  }

  return {
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
    data,
    duration,
    headers: Object.fromEntries(response.headers.entries()),
  };
}

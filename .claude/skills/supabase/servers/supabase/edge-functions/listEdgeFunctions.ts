import { managementApiRequest, getProjectRef } from '../../../src/client.ts';
import { assertAllowed } from '../../../src/permissions.ts';
import type { EdgeFunctionInfo } from '../../../src/types.ts';

interface RawEdgeFunction {
  id: string;
  slug: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
  version: number;
  created_at: string;
  updated_at: string;
}

/**
 * Lists all Edge Functions in the Supabase project.
 */
export async function listEdgeFunctions(): Promise<EdgeFunctionInfo[]> {
  assertAllowed('edge-functions', 'read');

  const projectRef = getProjectRef();
  const url = `/projects/${projectRef}/functions`;

  const response = await managementApiRequest<RawEdgeFunction[]>(url);

  return response.map(fn => ({
    id: fn.id,
    slug: fn.slug,
    name: fn.name,
    status: fn.status,
    version: fn.version,
    createdAt: fn.created_at,
    updatedAt: fn.updated_at,
  }));
}

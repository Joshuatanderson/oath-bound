import { managementApiMultipartRequest, getProjectRef } from '../../../src/client.ts';
import { assertAllowed } from '../../../src/permissions.ts';
import type { EdgeFunctionInfo, EdgeFunctionFile } from '../../../src/types.ts';

interface DeployEdgeFunctionOptions {
  name: string;
  entrypointPath?: string;
  files: EdgeFunctionFile[];
  verifyJwt?: boolean;
  importMapPath?: string;
}

interface RawEdgeFunctionResponse {
  id: string;
  slug: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
  version: number;
  created_at: string | number;
  updated_at: string | number;
}

/**
 * Deploys a new Edge Function or updates an existing one.
 */
export async function deployEdgeFunction(options: DeployEdgeFunctionOptions): Promise<EdgeFunctionInfo> {
  const {
    name,
    entrypointPath = 'index.ts',
    files,
    verifyJwt = false,
    importMapPath,
  } = options;

  if (!name) {
    throw new Error('name is required');
  }

  if (!files || files.length === 0) {
    throw new Error('At least one file is required');
  }

  assertAllowed('edge-functions', 'write');

  const projectRef = getProjectRef();

  const metadata: Record<string, unknown> = {
    name,
    entrypoint_path: entrypointPath,
    verify_jwt: verifyJwt,
  };

  if (importMapPath) {
    metadata.import_map_path = importMapPath;
  }

  const formData = new FormData();
  formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));

  for (const file of files) {
    const blob = new Blob([file.content], { type: 'application/typescript' });
    formData.append('file', blob, file.name);
  }

  const deployUrl = `/projects/${projectRef}/functions/deploy?slug=${encodeURIComponent(name)}`;
  const response = await managementApiMultipartRequest<RawEdgeFunctionResponse>(deployUrl, formData, 'POST');

  const createdAt = typeof response.created_at === 'number'
    ? new Date(response.created_at).toISOString()
    : String(response.created_at);
  const updatedAt = typeof response.updated_at === 'number'
    ? new Date(response.updated_at).toISOString()
    : String(response.updated_at);

  return {
    id: response.id,
    slug: response.slug,
    name: response.name,
    status: response.status,
    version: response.version,
    createdAt,
    updatedAt,
  };
}

import { getProjectRef } from '../../../src/client.ts';
import { assertAllowed } from '../../../src/permissions.ts';
import type { ProjectUrlInfo } from '../../../src/types.ts';

/**
 * Gets the API URL for the current project.
 */
export async function getProjectUrl(): Promise<ProjectUrlInfo> {
  assertAllowed('config', 'read');

  const projectRef = getProjectRef();
  const url = `https://${projectRef}.supabase.co`;

  return { url };
}

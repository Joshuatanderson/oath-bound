import { managementApiRequest, getProjectRef } from '../../../src/client.ts';
import { assertAllowed } from '../../../src/permissions.ts';
import type { PublishableKey } from '../../../src/types.ts';

interface ApiKeyResponse {
  name: string;
  api_key: string;
  disabled?: boolean;
}

/**
 * Gets all publishable API keys for the project.
 * Filters out service role keys.
 */
export async function getPublishableKeys(): Promise<PublishableKey[]> {
  assertAllowed('config', 'read');

  const projectRef = getProjectRef();

  const keys = await managementApiRequest<ApiKeyResponse[]>(`/projects/${projectRef}/api-keys`);

  const publishableKeys = keys.filter(key =>
    key.name.toLowerCase().includes('anon') ||
    key.name.toLowerCase().includes('publishable')
  );

  return publishableKeys.map(key => ({
    name: key.name,
    apiKey: key.api_key,
    disabled: key.disabled,
  }));
}

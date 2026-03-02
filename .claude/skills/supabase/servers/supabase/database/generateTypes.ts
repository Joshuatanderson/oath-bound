import { managementApiRequest, getProjectRef } from '../../../src/client.ts';
import { assertAllowed } from '../../../src/permissions.ts';

interface TypeGenResponse {
  types: string;
}

/**
 * Generates TypeScript types for the project schema.
 */
export async function generateTypes(): Promise<string> {
  assertAllowed('database', 'read');

  const projectRef = getProjectRef();

  const response = await managementApiRequest<TypeGenResponse>(
    `/projects/${projectRef}/types/typescript`
  );

  return response.types;
}

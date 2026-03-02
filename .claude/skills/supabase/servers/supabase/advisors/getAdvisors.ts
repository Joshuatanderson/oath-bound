import { managementApiRequest, getProjectRef } from '../../../src/client.ts';
import { assertAllowed } from '../../../src/permissions.ts';
import type { AdvisoryNotice } from '../../../src/types.ts';

type AdvisorType = 'security' | 'performance';

interface GetAdvisorsOptions {
  type: AdvisorType;
}

interface RawAdvisory {
  name: string;
  title: string;
  description: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';
  remediation?: string;
  remediation_url?: string;
  category?: string;
}

interface AdvisorsResponse {
  [key: string]: RawAdvisory[];
}

/**
 * Gets advisory notices for the Supabase project.
 * Checks for security vulnerabilities or performance improvements.
 */
export async function getAdvisors(options: GetAdvisorsOptions): Promise<AdvisoryNotice[]> {
  const { type } = options;

  assertAllowed('advisors', 'read');

  const projectRef = getProjectRef();

  const response = await managementApiRequest<AdvisorsResponse>(
    `/projects/${projectRef}/advisors/${type}`
  );

  const allAdvisories: RawAdvisory[] = Object.values(response).flat();

  const severityMap: Record<string, AdvisoryNotice['severity']> = {
    'INFO': 'low',
    'WARN': 'medium',
    'ERROR': 'high',
    'CRITICAL': 'critical',
  };

  return allAdvisories.map(advisory => ({
    type,
    title: advisory.title || advisory.name,
    description: advisory.description,
    severity: severityMap[advisory.level] || 'medium',
    remediationUrl: advisory.remediation_url,
  }));
}

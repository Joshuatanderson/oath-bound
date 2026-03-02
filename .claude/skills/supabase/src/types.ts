// Permission categories for Supabase operations
export type PermissionCategory =
  | 'database'
  | 'docs'
  | 'logs'
  | 'edge-functions'
  | 'branches'
  | 'config'
  | 'advisors';

// Risk levels for SQL operations
export type QueryRiskLevel = 'read' | 'write' | 'destructive';

// Permission configuration
export interface PermissionConfig {
  allowedCategories: PermissionCategory[];
  allowWrite: boolean;
  allowDestructive: boolean;
}

// SQL query result
export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
  command?: string;
}

// Table information
export interface TableInfo {
  schema: string;
  name: string;
  type: 'table' | 'view';
  rowCount?: number;
}

// Column information
export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: string;
  isPrimaryKey: boolean;
}

// Migration information
export interface MigrationInfo {
  version: string;
  name: string;
  appliedAt: string;
}

// Branch information
export interface BranchInfo {
  id: string;
  name: string;
  projectRef: string;
  status: 'ACTIVE' | 'INACTIVE' | 'MIGRATING';
  createdAt: string;
}

// Edge function information
export interface EdgeFunctionInfo {
  id: string;
  slug: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
  version: number;
  createdAt: string;
  updatedAt: string;
}

// Edge function file
export interface EdgeFunctionFile {
  name: string;
  content: string;
}

// Extended edge function info with files
export interface EdgeFunctionDetails extends EdgeFunctionInfo {
  files: EdgeFunctionFile[];
}

// Edge function invocation result
export interface EdgeFunctionInvokeResult {
  /** HTTP status code */
  status: number;
  /** HTTP status text */
  statusText: string;
  /** Whether the response was successful (status 200-299) */
  ok: boolean;
  /** The response data (parsed JSON or raw text) */
  data: unknown;
  /** Request duration in milliseconds */
  duration: number;
  /** Response headers */
  headers: Record<string, string>;
}

// Log entry
export interface LogEntry {
  id: string;
  timestamp: string;
  eventMessage: string;
  metadata: Record<string, unknown>;
}

// Advisory notice
export interface AdvisoryNotice {
  type: 'security' | 'performance';
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  remediationUrl?: string;
}

// Extension information
export interface ExtensionInfo {
  name: string;
  version: string;
  schema: string;
}

// Log service types
export type LogService = 'api' | 'branch-action' | 'postgres' | 'edge-function' | 'auth' | 'storage' | 'realtime';

// Publishable API key information
export interface PublishableKey {
  name: string;
  apiKey: string;
  disabled?: boolean;
}

// Project URL response
export interface ProjectUrlInfo {
  url: string;
}

// Doc search result types
export type DocSearchResultType =
  | 'guide'
  | 'cli-reference'
  | 'api-reference'
  | 'function-reference'
  | 'troubleshooting';

// Doc search result
export interface DocSearchResult {
  title: string;
  href: string;
  content: string;
  type: DocSearchResultType;
  subsections?: DocSubsection[];
}

// Doc subsection (for guides)
export interface DocSubsection {
  title: string;
  href: string;
  content: string;
}

// GraphQL response types for docs search
export interface DocSearchGraphQLResponse {
  data: {
    searchDocs: {
      nodes: GraphQLSearchResultNode[];
      totalCount: number;
    };
  };
}

export interface GraphQLSearchResultNode {
  __typename?: string;
  title: string;
  href: string;
  content: string;
  language?: string;
  methodName?: string;
  subsections?: {
    nodes: DocSubsection[];
  };
}

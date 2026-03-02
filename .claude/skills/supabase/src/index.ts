export {
  createSupabaseClient,
  executeRawSql,
  managementApiRequest,
  getProjectRef,
  getCurrentEnvironment,
  MANAGEMENT_API_BASE,
} from './client.ts';

export {
  getPermissions,
  isCategoryAllowed,
  analyzeQueryRisk,
  validateOperation,
  assertAllowed,
  PermissionError,
} from './permissions.ts';

export type { EnvironmentConfig } from './environments.ts';
export { ENVIRONMENT } from './environments.ts';

export type {
  PermissionCategory,
  QueryRiskLevel,
  PermissionConfig,
  QueryResult,
  TableInfo,
  ColumnInfo,
  MigrationInfo,
  BranchInfo,
  EdgeFunctionInfo,
  EdgeFunctionFile,
  LogEntry,
  AdvisoryNotice,
} from './types.ts';

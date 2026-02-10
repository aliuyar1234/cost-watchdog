import { openApiAuthPaths } from './openapi-paths-auth.js';
import { openApiAnomalyPaths } from './openapi-paths-anomalies.js';
import { openApiAnalyticsPaths } from './openapi-paths-analytics.js';
import { openApiExportPaths } from './openapi-paths-exports.js';
import { openApiUserPaths } from './openapi-paths-users.js';
import { openApiApiKeyPaths } from './openapi-paths-api-keys.js';
import { openApiNotificationSettingsPaths } from './openapi-paths-notification-settings.js';
import { openApiSettingsPaths } from './openapi-paths-settings.js';

export const openApiPaths = {
  ...openApiAuthPaths,
  ...openApiAnomalyPaths,
  ...openApiAnalyticsPaths,
  ...openApiExportPaths,
  ...openApiUserPaths,
  ...openApiApiKeyPaths,
  ...openApiNotificationSettingsPaths,
  ...openApiSettingsPaths,
};

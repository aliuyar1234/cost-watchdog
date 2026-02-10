import { openApiComponents } from './openapi-components.js';
import { openApiPaths } from './openapi-paths.js';

export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Cost Watchdog API',
    description: `
Cost Watchdog API provides programmatic access to cost monitoring and anomaly detection features.

## Authentication

The API supports two authentication methods:

1. **JWT Bearer Token** - For user sessions
   - Obtain tokens via \`/api/v1/auth/login\`
   - Include in header: \`Authorization: Bearer <token>\`

2. **API Key** - For machine-to-machine integration
   - Create via Admin UI or \`/api/v1/api-keys\`
   - Include in header: \`X-API-Key: <key>\`

## Rate Limiting

Default rate limits:
- 100 requests per minute per IP
- 1000 requests per hour per user/API key

## Error Handling

All errors return JSON with \`error\` and \`message\` fields:
\`\`\`json
{
  "error": "NotFound",
  "message": "Resource not found"
}
\`\`\`
    `.trim(),
    version: '0.1.0',
    contact: {
      name: 'Cost Watchdog Support',
      email: 'support@costwatchdog.de',
    },
    license: {
      name: 'MIT',
    },
  },
  servers: [
    {
      url: 'http://localhost:3001/api/v1',
      description: 'Development server',
    },
    {
      url: 'https://api.costwatchdog.de/api/v1',
      description: 'Production server',
    },
  ],
  tags: [
    { name: 'Authentication', description: 'User authentication and session management' },
    { name: 'Users', description: 'User management (Admin only)' },
    { name: 'Documents', description: 'Document upload and processing' },
    { name: 'Anomalies', description: 'Anomaly detection and management' },
    { name: 'Alerts', description: 'Alert notifications' },
    { name: 'Settings', description: 'Admin configuration and integrations' },
    { name: 'Notification Settings', description: 'User notification preferences' },
    { name: 'Analytics', description: 'Dashboard and reporting data' },
    { name: 'Exports', description: 'Data export functionality' },
    { name: 'API Keys', description: 'API key management (Admin only)' },
  ],
  components: openApiComponents,
  paths: openApiPaths,
  security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
};

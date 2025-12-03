import type { FastifyInstance } from 'fastify';

/**
 * OpenAPI 3.1 specification for Cost Watchdog API
 */
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
    version: '1.0.0',
    contact: {
      name: 'Cost Watchdog Support',
      email: 'support@costwatchdog.de',
    },
    license: {
      name: 'Proprietary',
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
    { name: 'Analytics', description: 'Dashboard and reporting data' },
    { name: 'Exports', description: 'Data export functionality' },
    { name: 'API Keys', description: 'API key management (Admin only)' },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT access token from login endpoint',
      },
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
        description: 'API key for machine-to-machine access',
      },
    },
    schemas: {
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          role: { type: 'string', enum: ['admin', 'manager', 'analyst', 'viewer', 'auditor'] },
          isActive: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
          lastLoginAt: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      Anomaly: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          type: { type: 'string', enum: ['yoy_deviation', 'mom_deviation', 'price_per_unit_spike', 'statistical_outlier', 'budget_exceeded', 'contract_term_anomaly', 'supplier_rate_change', 'missing_invoice'] },
          severity: { type: 'string', enum: ['info', 'warning', 'critical'] },
          status: { type: 'string', enum: ['new', 'acknowledged', 'resolved', 'false_positive'] },
          message: { type: 'string' },
          details: { type: 'object' },
          isBackfill: { type: 'boolean' },
          detectedAt: { type: 'string', format: 'date-time' },
          acknowledgedAt: { type: 'string', format: 'date-time', nullable: true },
          acknowledgedBy: { type: 'string', nullable: true },
          resolution: { type: 'string', nullable: true },
          costRecord: { $ref: '#/components/schemas/CostRecordSummary' },
        },
      },
      CostRecordSummary: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          costType: { type: 'string' },
          amount: { type: 'number' },
          quantity: { type: 'number', nullable: true },
          unit: { type: 'string', nullable: true },
          pricePerUnit: { type: 'number', nullable: true },
          periodStart: { type: 'string', format: 'date' },
          periodEnd: { type: 'string', format: 'date' },
          invoiceNumber: { type: 'string', nullable: true },
          location: {
            type: 'object',
            nullable: true,
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              type: { type: 'string' },
            },
          },
          supplier: {
            type: 'object',
            nullable: true,
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              category: { type: 'string' },
            },
          },
        },
      },
      Alert: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          anomalyId: { type: 'string', format: 'uuid' },
          channel: { type: 'string', enum: ['email', 'slack', 'teams'] },
          recipient: { type: 'string' },
          subject: { type: 'string' },
          status: { type: 'string', enum: ['pending', 'sent', 'failed'] },
          sentAt: { type: 'string', format: 'date-time', nullable: true },
          clickedAt: { type: 'string', format: 'date-time', nullable: true },
          errorMessage: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Document: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          filename: { type: 'string' },
          mimeType: { type: 'string' },
          size: { type: 'integer' },
          extractionStatus: { type: 'string', enum: ['pending', 'processing', 'completed', 'failed'] },
          uploadedAt: { type: 'string', format: 'date-time' },
          processedAt: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      ApiKey: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          keyPrefix: { type: 'string' },
          scopes: { type: 'array', items: { type: 'string' } },
          lastUsedAt: { type: 'string', format: 'date-time', nullable: true },
          expiresAt: { type: 'string', format: 'date-time', nullable: true },
          isActive: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Pagination: {
        type: 'object',
        properties: {
          total: { type: 'integer' },
          limit: { type: 'integer' },
          offset: { type: 'integer' },
          hasMore: { type: 'boolean' },
        },
      },
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          message: { type: 'string' },
        },
      },
    },
    responses: {
      Unauthorized: {
        description: 'Authentication required',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
            example: { error: 'Unauthorized', message: 'Authentication required' },
          },
        },
      },
      Forbidden: {
        description: 'Insufficient permissions',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
            example: { error: 'Forbidden', message: 'Admin access required' },
          },
        },
      },
      NotFound: {
        description: 'Resource not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
            example: { error: 'NotFound', message: 'Resource not found' },
          },
        },
      },
      BadRequest: {
        description: 'Invalid request',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
            example: { error: 'BadRequest', message: 'Invalid request parameters' },
          },
        },
      },
    },
  },
  paths: {
    '/auth/register': {
      post: {
        tags: ['Authentication'],
        summary: 'Register a new user',
        description: 'First registered user becomes admin automatically',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password', 'firstName', 'lastName'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 8 },
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'User created successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    user: { $ref: '#/components/schemas/User' },
                    accessToken: { type: 'string' },
                  },
                },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Authentication'],
        summary: 'Login and obtain tokens',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Login successful',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    accessToken: { type: 'string' },
                    user: { $ref: '#/components/schemas/User' },
                  },
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Authentication'],
        summary: 'Get current user profile',
        security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
        responses: {
          200: {
            description: 'Current user',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    user: { $ref: '#/components/schemas/User' },
                  },
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/anomalies': {
      get: {
        tags: ['Anomalies'],
        summary: 'List anomalies',
        security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['new', 'acknowledged', 'resolved', 'false_positive'] } },
          { name: 'severity', in: 'query', schema: { type: 'string', enum: ['info', 'warning', 'critical'] } },
          { name: 'type', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
        ],
        responses: {
          200: {
            description: 'List of anomalies',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { type: 'array', items: { $ref: '#/components/schemas/Anomaly' } },
                    pagination: { $ref: '#/components/schemas/Pagination' },
                  },
                },
              },
            },
          },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/anomalies/{id}': {
      get: {
        tags: ['Anomalies'],
        summary: 'Get anomaly by ID',
        security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: {
            description: 'Anomaly details',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Anomaly' },
              },
            },
          },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
      patch: {
        tags: ['Anomalies'],
        summary: 'Update anomaly status',
        security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: { type: 'string', enum: ['new', 'acknowledged', 'resolved', 'false_positive'] },
                  resolution: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Updated anomaly',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Anomaly' },
              },
            },
          },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/anomalies/{id}/acknowledge': {
      post: {
        tags: ['Anomalies'],
        summary: 'Acknowledge an anomaly',
        security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  resolution: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Acknowledged anomaly',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Anomaly' },
              },
            },
          },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/analytics/dashboard': {
      get: {
        tags: ['Analytics'],
        summary: 'Get dashboard KPIs',
        security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
        parameters: [
          { name: 'year', in: 'query', schema: { type: 'integer' } },
        ],
        responses: {
          200: {
            description: 'Dashboard data',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    year: { type: 'integer' },
                    totals: {
                      type: 'object',
                      properties: {
                        yearToDate: { type: 'number' },
                        yearToDateChange: { type: 'number' },
                        currentMonth: { type: 'number' },
                        currentMonthChange: { type: 'number' },
                        recordCount: { type: 'integer' },
                      },
                    },
                    anomalies: {
                      type: 'object',
                      properties: {
                        open: { type: 'integer' },
                        critical: { type: 'integer' },
                      },
                    },
                    documents: {
                      type: 'object',
                      properties: {
                        total: { type: 'integer' },
                        pending: { type: 'integer' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/exports/cost-records': {
      get: {
        tags: ['Exports'],
        summary: 'Export cost records',
        security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
        parameters: [
          { name: 'format', in: 'query', schema: { type: 'string', enum: ['csv', 'json'], default: 'csv' } },
          { name: 'year', in: 'query', schema: { type: 'integer' } },
          { name: 'month', in: 'query', schema: { type: 'integer' } },
          { name: 'costType', in: 'query', schema: { type: 'string' } },
          { name: 'locationId', in: 'query', schema: { type: 'string' } },
          { name: 'supplierId', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: 'Exported data',
            content: {
              'text/csv': {
                schema: { type: 'string' },
              },
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { type: 'array', items: { type: 'object' } },
                    exportedAt: { type: 'string', format: 'date-time' },
                    recordCount: { type: 'integer' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/users': {
      get: {
        tags: ['Users'],
        summary: 'List users (Admin only)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'role', in: 'query', schema: { type: 'string' } },
          { name: 'isActive', in: 'query', schema: { type: 'boolean' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
        ],
        responses: {
          200: {
            description: 'List of users',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { type: 'array', items: { $ref: '#/components/schemas/User' } },
                    pagination: { $ref: '#/components/schemas/Pagination' },
                  },
                },
              },
            },
          },
          403: { $ref: '#/components/responses/Forbidden' },
        },
      },
      post: {
        tags: ['Users'],
        summary: 'Create user (Admin only)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password', 'firstName', 'lastName', 'role'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 8 },
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                  role: { type: 'string', enum: ['admin', 'manager', 'analyst', 'viewer', 'auditor'] },
                  allowedLocationIds: { type: 'array', items: { type: 'string' } },
                  allowedCostCenterIds: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'User created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/User' },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          403: { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/api-keys': {
      get: {
        tags: ['API Keys'],
        summary: 'List API keys (Admin only)',
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'List of API keys',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { type: 'array', items: { $ref: '#/components/schemas/ApiKey' } },
                    pagination: { $ref: '#/components/schemas/Pagination' },
                  },
                },
              },
            },
          },
          403: { $ref: '#/components/responses/Forbidden' },
        },
      },
      post: {
        tags: ['API Keys'],
        summary: 'Create API key (Admin only)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'scopes'],
                properties: {
                  name: { type: 'string' },
                  scopes: {
                    type: 'array',
                    items: {
                      type: 'string',
                      enum: ['read:cost_records', 'write:cost_records', 'read:anomalies', 'write:anomalies', 'read:documents', 'write:documents', 'read:analytics', 'read:exports'],
                    },
                  },
                  expiresAt: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'API key created',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/ApiKey' },
                    {
                      type: 'object',
                      properties: {
                        apiKey: {
                          type: 'string',
                          description: 'The API key value (only shown once)',
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequest' },
          403: { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
  },
  security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
};

/**
 * Register OpenAPI routes on Fastify instance
 */
export async function registerOpenApi(fastify: FastifyInstance): Promise<void> {
  // Serve OpenAPI spec as JSON
  fastify.get('/openapi.json', async (request, reply) => {
    return reply.send(openApiSpec);
  });

  // Serve OpenAPI spec as YAML
  fastify.get('/openapi.yaml', async (request, reply) => {
    const yaml = jsonToYaml(openApiSpec);
    return reply.type('text/yaml').send(yaml);
  });

  // Simple Swagger UI HTML page
  fastify.get('/docs', async (request, reply) => {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Cost Watchdog API Documentation</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '/api/v1/openapi.json',
      dom_id: '#swagger-ui',
      presets: [
        SwaggerUIBundle.presets.apis,
        SwaggerUIBundle.SwaggerUIStandalonePreset
      ],
      layout: 'BaseLayout'
    });
  </script>
</body>
</html>
    `.trim();

    return reply.type('text/html').send(html);
  });
}

/**
 * Simple JSON to YAML converter (basic implementation)
 */
function jsonToYaml(obj: unknown, indent = 0): string {
  const spaces = '  '.repeat(indent);

  if (obj === null) return 'null';
  if (obj === undefined) return '';
  if (typeof obj === 'string') {
    if (obj.includes('\n') || obj.includes(':') || obj.includes('#')) {
      return `|\n${obj.split('\n').map(line => spaces + '  ' + line).join('\n')}`;
    }
    return obj.includes(' ') || obj.includes(',') ? `"${obj}"` : obj;
  }
  if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj);
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    return obj.map(item => {
      const val = jsonToYaml(item, indent + 1);
      if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
        return `\n${spaces}- ${val.trim().split('\n').join(`\n${spaces}  `)}`;
      }
      return `\n${spaces}- ${val}`;
    }).join('');
  }
  if (typeof obj === 'object') {
    const entries = Object.entries(obj);
    if (entries.length === 0) return '{}';
    return entries.map(([key, value]) => {
      const val = jsonToYaml(value, indent + 1);
      if (typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length > 0) {
        return `${indent > 0 ? '\n' : ''}${spaces}${key}:${val}`;
      }
      if (Array.isArray(value) && value.length > 0) {
        return `${indent > 0 ? '\n' : ''}${spaces}${key}:${val}`;
      }
      return `${indent > 0 ? '\n' : ''}${spaces}${key}: ${val}`;
    }).join('');
  }
  return '';
}

export default { openApiSpec, registerOpenApi };

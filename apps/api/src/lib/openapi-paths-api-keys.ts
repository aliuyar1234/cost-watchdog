export const openApiApiKeyPaths = {
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
                    enum: [
                      'read:anomalies',
                      'write:anomalies',
                      'read:analytics',
                      'read:alerts',
                      'write:alerts',
                      'read:documents',
                      'write:documents',
                      'read:exports',
                      'read:users',
                      'write:users',
                      'read:cost_records',
                      'write:cost_records',
                    ],
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
};

export const openApiAnomalyPaths = {
  '/anomalies': {
    get: {
      tags: ['Anomalies'],
      summary: 'List anomalies',
      security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
      parameters: [
        {
          name: 'status',
          in: 'query',
          schema: { type: 'string', enum: ['new', 'acknowledged', 'resolved', 'false_positive'] },
        },
        {
          name: 'severity',
          in: 'query',
          schema: { type: 'string', enum: ['info', 'warning', 'critical'] },
        },
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
                status: {
                  type: 'string',
                  enum: ['new', 'acknowledged', 'resolved', 'false_positive'],
                },
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
};

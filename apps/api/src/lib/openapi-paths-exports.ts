export const openApiExportPaths = {
  '/exports/cost-records': {
    get: {
      tags: ['Exports'],
      summary: 'Export cost records',
      security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
      parameters: [
        {
          name: 'format',
          in: 'query',
          schema: { type: 'string', enum: ['csv', 'json'], default: 'csv' },
        },
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
};

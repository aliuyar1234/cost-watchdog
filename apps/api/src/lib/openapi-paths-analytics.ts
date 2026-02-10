export const openApiAnalyticsPaths = {
  '/analytics/dashboard': {
    get: {
      tags: ['Analytics'],
      summary: 'Get dashboard KPIs',
      security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
      parameters: [{ name: 'year', in: 'query', schema: { type: 'integer' } }],
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
};

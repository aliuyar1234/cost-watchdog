export const openApiSettingsPaths = {
  '/settings': {
    get: {
      tags: ['Settings'],
      summary: 'Get alert and threshold settings (Admin only)',
      security: [{ BearerAuth: [] }],
      responses: {
        200: {
          description: 'Current settings',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  alerts: { $ref: '#/components/schemas/AlertSettings', nullable: true },
                  thresholds: { $ref: '#/components/schemas/ThresholdSettings', nullable: true },
                  general: { $ref: '#/components/schemas/GeneralSettings', nullable: true },
                },
              },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
      },
    },
  },
  '/settings/alerts': {
    put: {
      tags: ['Settings'],
      summary: 'Update alert settings (Admin only)',
      security: [{ BearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/AlertSettings' },
          },
        },
      },
      responses: {
        200: {
          description: 'Alert settings updated',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  alerts: { $ref: '#/components/schemas/AlertSettings' },
                },
              },
            },
          },
        },
        400: { $ref: '#/components/responses/BadRequest' },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
      },
    },
  },
  '/settings/thresholds': {
    put: {
      tags: ['Settings'],
      summary: 'Update anomaly threshold settings (Admin only)',
      security: [{ BearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ThresholdSettings' },
          },
        },
      },
      responses: {
        200: {
          description: 'Threshold settings updated',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  thresholds: { $ref: '#/components/schemas/ThresholdSettings' },
                },
              },
            },
          },
        },
        400: { $ref: '#/components/responses/BadRequest' },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
      },
    },
  },
  '/settings/general': {
    put: {
      tags: ['Settings'],
      summary: 'Update general settings (Admin only)',
      security: [{ BearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/GeneralSettings' },
          },
        },
      },
      responses: {
        200: {
          description: 'General settings updated',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  general: { $ref: '#/components/schemas/GeneralSettings' },
                },
              },
            },
          },
        },
        400: { $ref: '#/components/responses/BadRequest' },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
      },
    },
  },
  '/settings/test-slack': {
    post: {
      tags: ['Settings'],
      summary: 'Test Slack webhook (Admin only)',
      security: [{ BearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['webhookUrl'],
              properties: {
                webhookUrl: { type: 'string', format: 'uri' },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Slack webhook test successful',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
        400: { $ref: '#/components/responses/BadRequest' },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        502: {
          description: 'Slack webhook test failed',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
      },
    },
  },
  '/settings/test-teams': {
    post: {
      tags: ['Settings'],
      summary: 'Test Microsoft Teams webhook (Admin only)',
      security: [{ BearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['webhookUrl'],
              properties: {
                webhookUrl: { type: 'string', format: 'uri' },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Teams webhook test successful',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
        400: { $ref: '#/components/responses/BadRequest' },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        502: {
          description: 'Teams webhook test failed',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
      },
    },
  },
};

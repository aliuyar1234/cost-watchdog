export const openApiNotificationSettingsPaths = {
  '/notification-settings': {
    get: {
      tags: ['Notification Settings'],
      summary: 'Get current user notification settings',
      security: [{ BearerAuth: [] }],
      responses: {
        200: {
          description: 'Notification settings',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  settings: { $ref: '#/components/schemas/NotificationSettings' },
                },
              },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
      },
    },
    put: {
      tags: ['Notification Settings'],
      summary: 'Update current user notification settings',
      security: [{ BearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                emailAlertsEnabled: { type: 'boolean' },
                dailyDigestEnabled: { type: 'boolean' },
              },
              additionalProperties: false,
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Notification settings updated',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  settings: { $ref: '#/components/schemas/NotificationSettings' },
                },
              },
            },
          },
        },
        400: { $ref: '#/components/responses/BadRequest' },
        401: { $ref: '#/components/responses/Unauthorized' },
      },
    },
  },
};

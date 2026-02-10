export const openApiComponents = {
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
        type: {
          type: 'string',
          description:
            'Anomaly type identifier (string). Example values: yoy_deviation, mom_deviation, price_per_unit_spike, statistical_outlier, budget_exceeded.',
        },
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
    AlertSettings: {
      type: 'object',
      required: [
        'emailEnabled',
        'slackEnabled',
        'teamsEnabled',
        'slackWebhookUrl',
        'teamsWebhookUrl',
        'notifyOnCritical',
        'notifyOnWarning',
        'notifyOnInfo',
        'dailyDigestEnabled',
        'dailyDigestTime',
        'maxAlertsPerDay',
      ],
      properties: {
        emailEnabled: { type: 'boolean' },
        slackEnabled: { type: 'boolean' },
        teamsEnabled: { type: 'boolean' },
        slackWebhookUrl: { type: 'string' },
        teamsWebhookUrl: { type: 'string' },
        notifyOnCritical: { type: 'boolean' },
        notifyOnWarning: { type: 'boolean' },
        notifyOnInfo: { type: 'boolean' },
        dailyDigestEnabled: { type: 'boolean' },
        dailyDigestTime: { type: 'string' },
        maxAlertsPerDay: { type: 'number', minimum: 1 },
      },
    },
    ThresholdSettings: {
      type: 'object',
      required: [
        'yoyThreshold',
        'momThreshold',
        'pricePerUnitThreshold',
        'budgetThreshold',
        'minHistoricalMonths',
      ],
      properties: {
        yoyThreshold: { type: 'number', minimum: 0 },
        momThreshold: { type: 'number', minimum: 0 },
        pricePerUnitThreshold: { type: 'number', minimum: 0 },
        budgetThreshold: { type: 'number', minimum: 0 },
        minHistoricalMonths: { type: 'number', minimum: 1 },
      },
    },
    GeneralSettings: {
      type: 'object',
      required: ['timezone'],
      properties: {
        timezone: { type: 'string' },
      },
    },
    NotificationSettings: {
      type: 'object',
      required: ['emailAlertsEnabled', 'dailyDigestEnabled'],
      properties: {
        emailAlertsEnabled: { type: 'boolean' },
        dailyDigestEnabled: { type: 'boolean' },
      },
    },
    Document: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        filename: { type: 'string' },
        originalFilename: { type: 'string' },
        mimeType: { type: 'string' },
        fileSize: { type: 'integer' },
        extractionStatus: {
          type: 'string',
          enum: ['pending', 'processing', 'completed', 'failed', 'manual'],
        },
        verificationStatus: {
          type: 'string',
          enum: ['pending', 'auto_verified', 'manually_verified', 'rejected'],
        },
        uploadedAt: { type: 'string', format: 'date-time' },
        extractedAt: { type: 'string', format: 'date-time', nullable: true },
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
};

import { prisma } from '../../lib/db.js';
import {
  queueAggregation,
  queueAlert,
  queueAnomalyDetection,
  queueExtraction,
} from '../../lib/queues.js';
import { loadAlertSettings, shouldNotifySeverity } from '../../lib/alert-settings.js';
import { getSeverityLabel, loadEmailRecipients } from './recipients.js';
import type { OutboxEventData, OutboxEventHandler } from './types.js';

async function handleDocumentUploaded(event: OutboxEventData): Promise<void> {
  await queueExtraction(
    {
      documentId: event.payload['documentId'] as string,
      storagePath: event.payload['storagePath'] as string,
      mimeType: event.payload['mimeType'] as string,
      filename: event.payload['filename'] as string,
    },
    event.id,
  );
}

async function handleDocumentExtractionRetry(event: OutboxEventData): Promise<void> {
  await queueExtraction(
    {
      documentId: event.payload['documentId'] as string,
      storagePath: event.payload['storagePath'] as string,
      mimeType: event.payload['mimeType'] as string,
    },
    event.id,
  );
}

async function handleCostRecordCreated(event: OutboxEventData): Promise<void> {
  await queueAnomalyDetection(
    {
      costRecordId: event.payload['costRecordId'] as string,
      isBackfill: event.payload['isBackfill'] as boolean,
    },
    event.id,
  );

  await queueAggregation(
    {
      costRecordId: event.payload['costRecordId'] as string,
      type: 'update',
    },
    event.id,
  );
}

async function resolveAnomalyId(event: OutboxEventData): Promise<string | null> {
  let anomalyId = event.payload['anomalyId'] as string | undefined;
  if (anomalyId) {
    return anomalyId;
  }

  const costRecordId = event.payload['costRecordId'] as string;
  const type = event.payload['type'] as string | undefined;
  if (!type) {
    console.warn('[OutboxPoller] Missing anomalyId and type for anomaly.detected event');
    return null;
  }

  const anomalyRecord = await prisma.anomaly.findUnique({
    where: { costRecordId_type: { costRecordId, type } },
    select: { id: true },
  });

  if (!anomalyRecord) {
    console.warn('[OutboxPoller] Anomaly not found for alert creation', {
      costRecordId,
      type,
    });
    return null;
  }

  anomalyId = anomalyRecord.id;
  return anomalyId;
}

async function createAlertsForAnomaly(event: OutboxEventData, anomalyId: string): Promise<void> {
  const costRecordId = event.payload['costRecordId'] as string;
  const severity = event.payload['severity'] as string;
  const message = event.payload['message'] as string;

  const alertSettings = await loadAlertSettings();
  if (!shouldNotifySeverity(alertSettings, severity)) {
    return;
  }

  const channels: Array<'email' | 'slack' | 'teams'> = [];
  let emailRecipients: Array<{ id: string; email: string }> = [];
  let emailRecipientList = '';

  if (alertSettings.emailEnabled) {
    emailRecipients = await loadEmailRecipients();
    if (emailRecipients.length > 0) {
      emailRecipientList = emailRecipients.map((user) => user.email).join(', ');
      channels.push('email');
    }
  }

  const slackWebhookUrl = alertSettings.slackWebhookUrl.trim();
  if (alertSettings.slackEnabled && slackWebhookUrl) {
    channels.push('slack');
  }

  const teamsWebhookUrl = alertSettings.teamsWebhookUrl.trim();
  if (alertSettings.teamsEnabled && teamsWebhookUrl) {
    channels.push('teams');
  }

  if (channels.length === 0) {
    return;
  }

  const existingAlerts = await prisma.alert.findMany({
    where: {
      anomalyId,
      channel: { in: channels },
    },
    select: { channel: true },
  });
  const existingChannels = new Set(existingAlerts.map((alert) => alert.channel));
  const singleEmailRecipientId =
    emailRecipients.length === 1 ? (emailRecipients[0]?.id ?? null) : null;

  for (const channel of channels) {
    if (existingChannels.has(channel)) {
      continue;
    }

    const recipient =
      channel === 'email'
        ? emailRecipientList
        : channel === 'slack'
          ? slackWebhookUrl
          : teamsWebhookUrl;

    if (!recipient) {
      continue;
    }

    const alert = await prisma.alert.create({
      data: {
        anomalyId,
        userId: channel === 'email' ? singleEmailRecipientId : null,
        channel,
        recipient,
        subject: `[${getSeverityLabel(severity)}] Kostenanomalie: ${message}`,
        body: message,
        status: 'pending',
      },
    });

    await queueAlert(
      {
        alertId: alert.id,
        anomalyId,
        costRecordId,
      },
      event.id,
    );
  }
}

async function handleAnomalyDetected(event: OutboxEventData): Promise<void> {
  const anomalyId = await resolveAnomalyId(event);
  if (!anomalyId) {
    return;
  }

  await createAlertsForAnomaly(event, anomalyId);
}

async function handleAlertRetry(event: OutboxEventData): Promise<void> {
  const alertId = event.payload['alertId'] as string;
  const alert = await prisma.alert.findUnique({
    where: { id: alertId },
    include: { anomaly: true },
  });

  if (!alert) {
    return;
  }

  await queueAlert(
    {
      alertId: alert.id,
      anomalyId: alert.anomalyId,
      costRecordId: alert.anomaly.costRecordId,
    },
    event.id,
  );
}

export const EVENT_HANDLERS: Record<string, OutboxEventHandler> = {
  'document.uploaded': handleDocumentUploaded,
  'document.extraction_retry': handleDocumentExtractionRetry,
  'cost_record.created': handleCostRecordCreated,
  'anomaly.detected': handleAnomalyDetected,
  'alert.retry': handleAlertRetry,
};

import { Worker, Job } from 'bullmq';
import { createRedisConnection } from '../lib/redis.js';
import { QUEUE_NAMES, type AlertJobData } from '../lib/queues.js';
import { prisma } from '../lib/db.js';
import { loadAlertSettings } from '../lib/alert-settings.js';
import {
  sendAnomalyAlertEmail,
  type AnomalyAlertEmailData,
} from '../lib/email.js';
import { sendSlackAnomalyAlert } from '../lib/slack.js';
import { sendTeamsAnomalyAlert } from '../lib/teams.js';

/**
 * Dashboard URL for email links
 */
const DASHBOARD_URL = process.env['WEB_URL'] || 'http://localhost:3000';

/**
 * Map anomaly type to German label
 */
function getAnomalyTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    yoy_deviation: 'Jahresvergleich',
    mom_deviation: 'Monatsvergleich',
    price_per_unit_spike: 'Preis pro Einheit',
    statistical_outlier: 'Statistischer Ausreißer',
    duplicate_detection: 'Mögliche Duplikat',
    missing_period: 'Fehlende Periode',
    seasonal_anomaly: 'Saisonale Anomalie',
    budget_exceeded: 'Budget überschritten',
  };
  return labels[type] || type;
}

/**
 * Map cost type to German label
 */
function getCostTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    electricity: 'Strom',
    natural_gas: 'Erdgas',
    heating_oil: 'Heizöl',
    district_heating: 'Fernwärme',
    district_cooling: 'Fernkälte',
    water: 'Wasser',
    sewage: 'Abwasser',
    waste: 'Abfall',
    fuel_diesel: 'Diesel',
    fuel_petrol: 'Benzin',
    fuel_lpg: 'LPG',
    fuel_electric: 'E-Fahrzeuge',
    telecom_mobile: 'Mobilfunk',
    telecom_landline: 'Festnetz',
    telecom_internet: 'Internet',
    rent: 'Miete',
    operating_costs: 'Nebenkosten',
    maintenance: 'Wartung',
    insurance: 'Versicherung',
    it_licenses: 'IT-Lizenzen',
    it_cloud: 'Cloud-Services',
    it_hardware: 'IT-Hardware',
    supplier_recurring: 'Wiederkehrend',
    other: 'Sonstige',
  };
  return labels[type] || type;
}

/**
 * Format date for display
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function parseRecipients(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getRecipientName(recipients: string[]): string {
  if (recipients.length === 0) {
    return 'Nutzer';
  }
  if (recipients.length > 1) {
    return 'Team';
  }
  return recipients[0]?.split('@')[0] || 'Nutzer';
}

/**
 * Check if daily alert limit has been exceeded
 */
async function hasExceededDailyLimit(maxAlertsPerDay: number): Promise<boolean> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const count = await prisma.alert.count({
    where: {
      createdAt: { gte: todayStart },
      status: 'sent',
    },
  });

  return count >= maxAlertsPerDay;
}

/**
 * Process alert sending
 */
async function processAlert(job: Job<AlertJobData>): Promise<void> {
  const { alertId, anomalyId } = job.data;

  console.log(`[AlertWorker] Processing alert ${alertId} for anomaly ${anomalyId}`);

  const alertSettings = await loadAlertSettings();

  // Check daily limit
  if (await hasExceededDailyLimit(alertSettings.maxAlertsPerDay)) {
    console.log(`[AlertWorker] Daily alert limit exceeded, skipping`);
    await prisma.alert.update({
      where: { id: alertId },
      data: {
        status: 'failed',
        errorMessage: 'Daily alert limit exceeded',
      },
    });
    return;
  }

  // Fetch full alert data
  const alert = await prisma.alert.findUnique({
    where: { id: alertId },
    include: {
      anomaly: {
        include: {
          costRecord: {
            include: {
              location: true,
              supplier: true,
            },
          },
        },
      },
    },
  });

  if (!alert) {
    console.warn(`[AlertWorker] Alert ${alertId} not found`);
    return;
  }

  if (alert.status !== 'pending') {
    console.log(`[AlertWorker] Alert ${alertId} already processed (status: ${alert.status})`);
    return;
  }

  const { anomaly } = alert;
  const costRecord = anomaly.costRecord;

  if (!costRecord || !costRecord.location || !costRecord.supplier) {
    console.warn(`[AlertWorker] Alert ${alertId} missing required data`);
    await prisma.alert.update({
      where: { id: alertId },
      data: {
        status: 'failed',
        errorMessage: 'Missing cost record, location, or supplier data',
      },
    });
    return;
  }

  const details = anomaly.details as Record<string, unknown> | null;
  const alertData = {
    anomalyType: getAnomalyTypeLabel(anomaly.type),
    severity: anomaly.severity as 'info' | 'warning' | 'critical',
    message: anomaly.message,
    costType: getCostTypeLabel(costRecord.costType),
    supplierName: costRecord.supplier.name,
    locationName: costRecord.location.name,
    amount: Number(costRecord.amount),
    expectedAmount: details?.['expectedValue'] as number | undefined,
    deviationPercent: details?.['deviationPercent'] as number | undefined,
    periodStart: formatDate(costRecord.periodStart),
    periodEnd: formatDate(costRecord.periodEnd),
    anomalyId: anomaly.id,
    dashboardUrl: DASHBOARD_URL,
  };

  // Send based on channel
  let result: { success: boolean; messageId?: string; error?: string };

  switch (alert.channel) {
    case 'email':
      const recipients = parseRecipients(alert.recipient);
      result = await sendAnomalyAlertEmail({
        recipientEmail: recipients.length > 0 ? recipients : alert.recipient,
        recipientName: getRecipientName(recipients),
        ...alertData,
      } satisfies AnomalyAlertEmailData);
      break;

    case 'slack':
      result = await sendSlackAnomalyAlert({
        webhookUrl: alert.recipient,
        ...alertData,
      });
      break;

    case 'teams':
      result = await sendTeamsAnomalyAlert({
        webhookUrl: alert.recipient,
        ...alertData,
      });
      break;

    case 'in_app':
      // In-app notifications are handled differently - just mark as sent
      result = { success: true };
      break;

    default:
      result = { success: false, error: `Unsupported channel: ${alert.channel}` };
  }

  // Update alert status
  if (result.success) {
    await prisma.alert.update({
      where: { id: alertId },
      data: {
        status: 'sent',
        sentAt: new Date(),
      },
    });
    console.log(`[AlertWorker] Alert ${alertId} sent successfully`);
  } else {
    await prisma.alert.update({
      where: { id: alertId },
      data: {
        status: 'failed',
        errorMessage: result.error || 'Unknown error',
      },
    });
    console.error(`[AlertWorker] Alert ${alertId} failed: ${result.error}`);
    throw new Error(result.error); // Trigger retry
  }
}

/**
 * Create and start the alert worker
 */
export function createAlertWorker(): Worker<AlertJobData> {
  const connection = createRedisConnection();

  const worker = new Worker<AlertJobData>(
    QUEUE_NAMES.ALERTS,
    processAlert,
    {
      connection,
      concurrency: 3,
      limiter: {
        max: 20,
        duration: 1000, // 20 alerts per second max
      },
    }
  );

  worker.on('completed', (job) => {
    console.log(`[AlertWorker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[AlertWorker] Job ${job?.id} failed:`, err);
  });

  worker.on('error', (err) => {
    console.error('[AlertWorker] Worker error:', err);
  });

  console.log('[AlertWorker] Worker started');

  return worker;
}

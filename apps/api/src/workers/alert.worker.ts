import { Worker, Job } from 'bullmq';
import { createRedisConnection } from '../lib/redis.js';
import { QUEUE_NAMES, type AlertJobData } from '../lib/queues.js';
import { prisma } from '../lib/db.js';
import {
  sendAnomalyAlertEmail,
  type AnomalyAlertEmailData,
} from '../lib/email.js';

/**
 * Dashboard URL for email links
 */
const DASHBOARD_URL = process.env['WEB_URL'] || 'http://localhost:3000';

/**
 * Alert fatigue protection: max alerts per day
 */
const MAX_ALERTS_PER_DAY = parseInt(process.env['MAX_ALERTS_PER_DAY'] || '50', 10);

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

/**
 * Check if daily alert limit has been exceeded
 */
async function hasExceededDailyLimit(): Promise<boolean> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const count = await prisma.alert.count({
    where: {
      createdAt: { gte: todayStart },
      status: 'sent',
    },
  });

  return count >= MAX_ALERTS_PER_DAY;
}

/**
 * Process alert sending
 */
async function processAlert(job: Job<AlertJobData>): Promise<void> {
  const { alertId, anomalyId } = job.data;

  console.log(`[AlertWorker] Processing alert ${alertId} for anomaly ${anomalyId}`);

  // Check daily limit
  if (await hasExceededDailyLimit()) {
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

  // Build email data
  const details = anomaly.details as Record<string, unknown> | null;
  const emailData: AnomalyAlertEmailData = {
    recipientEmail: alert.recipient,
    recipientName: alert.recipient.split('@')[0] || 'Nutzer',
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
      result = await sendAnomalyAlertEmail(emailData);
      break;

    case 'in_app':
      // In-app notifications are handled differently - just mark as sent
      result = { success: true };
      break;

    // TODO: Add slack, teams, webhook handlers
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

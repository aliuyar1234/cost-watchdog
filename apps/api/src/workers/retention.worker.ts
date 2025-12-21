/**
 * Data Retention Worker
 *
 * Runs scheduled cleanup of old data according to retention policies.
 * Uses cron-like scheduling to run cleanup tasks periodically.
 */

import { runRetentionCleanup, getRetentionConfig, getRetentionStats } from '../lib/data-retention.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export interface RetentionWorkerConfig {
  /** Cron schedule (default: daily at 3 AM) */
  schedule?: string;
  /** Run immediately on startup (default: false) */
  runOnStartup?: boolean;
  /** Timezone for cron schedule (default: UTC) */
  timezone?: string;
}

const DEFAULT_CONFIG: Required<RetentionWorkerConfig> = {
  schedule: process.env['RETENTION_CRON_SCHEDULE'] || '0 3 * * *', // 3 AM daily
  runOnStartup: process.env['RETENTION_RUN_ON_STARTUP'] === 'true',
  timezone: process.env['RETENTION_TIMEZONE'] || 'UTC',
};

// ═══════════════════════════════════════════════════════════════════════════
// SIMPLE CRON PARSER (for daily schedules)
// ═══════════════════════════════════════════════════════════════════════════

interface ParsedCron {
  minute: number;
  hour: number;
  dayOfMonth: number | '*';
  month: number | '*';
  dayOfWeek: number | '*';
}

/**
 * Parse a cron expression (minute hour day month weekday).
 * Supports basic patterns: number or * for each field.
 */
function parseCronExpression(expression: string): ParsedCron {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression: ${expression}`);
  }

  const parseField = (value: string, max: number): number | '*' => {
    if (value === '*') return '*';
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 0 || num > max) {
      throw new Error(`Invalid cron field value: ${value}`);
    }
    return num;
  };

  return {
    minute: parseField(parts[0]!, 59) as number,
    hour: parseField(parts[1]!, 23) as number,
    dayOfMonth: parseField(parts[2]!, 31),
    month: parseField(parts[3]!, 12),
    dayOfWeek: parseField(parts[4]!, 6),
  };
}

/**
 * Get milliseconds until the next cron execution.
 */
function getNextRunDelay(cron: ParsedCron): number {
  const now = new Date();
  const next = new Date(now);

  // Set to the specified hour and minute
  next.setHours(cron.hour, cron.minute, 0, 0);

  // If we've passed this time today, schedule for tomorrow
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  // Handle day of week constraint
  if (cron.dayOfWeek !== '*') {
    while (next.getDay() !== cron.dayOfWeek) {
      next.setDate(next.getDate() + 1);
    }
  }

  // Handle day of month constraint
  if (cron.dayOfMonth !== '*') {
    while (next.getDate() !== cron.dayOfMonth) {
      next.setDate(next.getDate() + 1);
    }
  }

  return next.getTime() - now.getTime();
}

// ═══════════════════════════════════════════════════════════════════════════
// RETENTION WORKER CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class RetentionWorker {
  private config: Required<RetentionWorkerConfig>;
  private cron: ParsedCron;
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;
  private cleanupInProgress = false;

  constructor(config: RetentionWorkerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cron = parseCronExpression(this.config.schedule);
  }

  /**
   * Start the retention worker.
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[RetentionWorker] Already running');
      return;
    }

    this.isRunning = true;
    console.log(`[RetentionWorker] Started with schedule: ${this.config.schedule}`);

    // Log retention configuration
    const retentionConfig = getRetentionConfig();
    console.log('[RetentionWorker] Retention config:', JSON.stringify(retentionConfig, null, 2));

    // Run immediately if configured
    if (this.config.runOnStartup) {
      console.log('[RetentionWorker] Running initial cleanup...');
      await this.runCleanup();
    }

    // Schedule next run
    this.scheduleNextRun();
  }

  /**
   * Stop the retention worker.
   */
  stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log('[RetentionWorker] Stopped');
  }

  /**
   * Check if cleanup is currently in progress.
   */
  isCleanupInProgress(): boolean {
    return this.cleanupInProgress;
  }

  /**
   * Schedule the next cleanup run.
   */
  private scheduleNextRun(): void {
    if (!this.isRunning) return;

    const delay = getNextRunDelay(this.cron);
    const nextRun = new Date(Date.now() + delay);

    console.log(`[RetentionWorker] Next run scheduled for ${nextRun.toISOString()} (in ${Math.round(delay / 1000 / 60)} minutes)`);

    this.timer = setTimeout(async () => {
      if (this.isRunning) {
        await this.runCleanup();
        this.scheduleNextRun();
      }
    }, delay);
  }

  /**
   * Execute the cleanup run.
   */
  private async runCleanup(): Promise<void> {
    if (this.cleanupInProgress) {
      console.log('[RetentionWorker] Cleanup already in progress, skipping');
      return;
    }

    this.cleanupInProgress = true;
    console.log('[RetentionWorker] Starting cleanup run...');

    try {
      // Log stats before cleanup
      const statsBefore = await getRetentionStats();
      console.log('[RetentionWorker] Stats before cleanup:', JSON.stringify(statsBefore, null, 2));

      // Run cleanup
      const result = await runRetentionCleanup();

      // Log results
      console.log('[RetentionWorker] Cleanup completed:', {
        duration: result.completedAt.getTime() - result.startedAt.getTime(),
        totalDeleted: result.totalDeleted,
        hasErrors: result.hasErrors,
        results: {
          tokenBlacklist: {
            success: result.results.tokenBlacklist.success,
            deleted: result.results.tokenBlacklist.deletedCount,
          },
          outboxEvents: {
            success: result.results.outboxEvents.success,
            deleted: result.results.outboxEvents.deletedCount,
          },
          dailyDigests: {
            success: result.results.dailyDigests.success,
            deleted: result.results.dailyDigests.deletedCount,
          },
          loginAttempts: {
            success: result.results.loginAttempts.success,
            deleted: result.results.loginAttempts.deletedCount,
          },
          passwordResetTokens: {
            success: result.results.passwordResetTokens.success,
            deleted: result.results.passwordResetTokens.deletedCount,
          },
          auditLogs: {
            success: result.results.auditLogs.success,
            deleted: result.results.auditLogs.deletedCount,
          },
        },
      });

      if (result.hasErrors) {
        console.error('[RetentionWorker] Some cleanup tasks failed');
      }
    } catch (error) {
      console.error('[RetentionWorker] Cleanup run failed:', error);
    } finally {
      this.cleanupInProgress = false;
    }
  }

  /**
   * Manually trigger a cleanup run (for testing/admin purposes).
   */
  async triggerCleanup(): Promise<void> {
    await this.runCleanup();
  }
}

/**
 * Create and return a retention worker instance.
 */
export function createRetentionWorker(config?: RetentionWorkerConfig): RetentionWorker {
  return new RetentionWorker(config);
}

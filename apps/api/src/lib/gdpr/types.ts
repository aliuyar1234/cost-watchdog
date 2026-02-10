export interface GdprDeletionResult {
  success: boolean;
  userId: string;
  deletedAt: Date;
  anonymizedAuditLogs: number;
  terminatedSessions: number;
  flaggedDocuments: number;
  error?: string;
}

export interface GdprDeletionOptions {
  performedBy: string;
  reason?: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string | null;
}

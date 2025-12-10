/**
 * Document Access Control Library
 *
 * Enforces location and cost-center based access restrictions for documents.
 * Users can only access documents that are associated with cost records
 * matching their allowed locations/cost centers.
 */

import { prisma } from './db.js';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface AccessCheckResult {
  allowed: boolean;
  reason?: string;
  document?: {
    id: string;
    filename: string;
  };
}

export interface UserAccessContext {
  userId: string;
  role: string;
  allowedLocationIds: string[];
  allowedCostCenterIds: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// ACCESS CONTROL LOGIC
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a user can access a specific document.
 *
 * Access rules:
 * 1. Admin and Manager roles can access all documents
 * 2. Auditor role can access all documents (read-only)
 * 3. Viewer/Analyst roles:
 *    - If user has no location/cost center restrictions: can access all documents
 *    - If user has restrictions: document's associated cost records must be in
 *      user's allowed locations/cost centers
 *    - If document has no associated cost records: accessible to all (unprocessed)
 */
export async function canAccessDocument(
  userId: string,
  documentId: string
): Promise<AccessCheckResult> {
  // Get user with access restrictions
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      allowedLocationIds: true,
      allowedCostCenterIds: true,
      isActive: true,
      deletedAt: true,
    },
  });

  if (!user || !user.isActive || user.deletedAt) {
    return { allowed: false, reason: 'User not found or inactive' };
  }

  // Get document basic info
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      filename: true,
    },
  });

  if (!document) {
    return { allowed: false, reason: 'Document not found' };
  }

  // Admin, Manager, and Auditor roles have full access
  if (['admin', 'manager', 'auditor'].includes(user.role)) {
    return { allowed: true, document };
  }

  // For viewer/analyst: check location/cost center restrictions
  const userLocations = user.allowedLocationIds || [];
  const userCostCenters = user.allowedCostCenterIds || [];

  // If user has no restrictions, allow access to all documents
  if (userLocations.length === 0 && userCostCenters.length === 0) {
    return { allowed: true, document };
  }

  // Get document's associated cost records with their locations/cost centers
  const costRecords = await prisma.costRecord.findMany({
    where: { sourceDocumentId: documentId },
    select: {
      locationId: true,
      costCenterId: true,
    },
  });

  // If document has no cost records, it's accessible to all (unprocessed document)
  if (costRecords.length === 0) {
    return { allowed: true, document };
  }

  // Check if any of the document's cost records match user's restrictions
  for (const record of costRecords) {
    let locationMatch = true;
    let costCenterMatch = true;

    // Check location restriction
    if (userLocations.length > 0 && record.locationId) {
      locationMatch = userLocations.includes(record.locationId);
    }

    // Check cost center restriction
    if (userCostCenters.length > 0 && record.costCenterId) {
      costCenterMatch = userCostCenters.includes(record.costCenterId);
    }

    // User has access if at least one cost record matches their restrictions
    if (locationMatch && costCenterMatch) {
      return { allowed: true, document };
    }
  }

  return {
    allowed: false,
    reason: 'No matching cost records in user\'s allowed locations/cost centers',
    document,
  };
}

/**
 * Check if a user can delete a specific document.
 *
 * Delete permissions:
 * 1. Admin role can delete any document
 * 2. Manager role can delete documents in their allowed locations/cost centers
 * 3. Other roles cannot delete documents
 */
export async function canDeleteDocument(
  userId: string,
  documentId: string
): Promise<AccessCheckResult> {
  // First check basic access
  const accessResult = await canAccessDocument(userId, documentId);
  if (!accessResult.allowed) {
    return accessResult;
  }

  // Get user role
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (!user) {
    return { allowed: false, reason: 'User not found' };
  }

  // Only admin can delete without restrictions
  if (user.role === 'admin') {
    return { allowed: true, document: accessResult.document };
  }

  // Manager can delete documents they have access to
  if (user.role === 'manager') {
    return { allowed: true, document: accessResult.document };
  }

  // All other roles cannot delete
  return {
    allowed: false,
    reason: 'Insufficient permissions to delete document',
    document: accessResult.document,
  };
}

/**
 * Get documents that a user can access.
 * Useful for building filtered document lists.
 *
 * Note: For users with location/cost center restrictions, this performs
 * a more complex query through cost records. For simplicity, this returns
 * all documents for restricted users and relies on canAccessDocument for
 * individual access checks. A more efficient implementation would use
 * a subquery or materialized view.
 */
export async function getAccessibleDocuments(
  userId: string,
  options: {
    limit?: number;
    offset?: number;
    orderBy?: 'uploadedAt' | 'filename';
    order?: 'asc' | 'desc';
  } = {}
): Promise<{ documents: unknown[]; total: number }> {
  const { limit = 20, offset = 0, orderBy = 'uploadedAt', order = 'desc' } = options;

  // Get user with access restrictions
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      allowedLocationIds: true,
      allowedCostCenterIds: true,
      isActive: true,
    },
  });

  if (!user || !user.isActive) {
    return { documents: [], total: 0 };
  }

  // Admin, Manager, and Auditor see all documents
  if (['admin', 'manager', 'auditor'].includes(user.role)) {
    const [documents, total] = await Promise.all([
      prisma.document.findMany({
        take: limit,
        skip: offset,
        orderBy: { [orderBy]: order },
      }),
      prisma.document.count(),
    ]);
    return { documents, total };
  }

  // Build where clause for restricted users
  const userLocations = user.allowedLocationIds || [];
  const userCostCenters = user.allowedCostCenterIds || [];

  // If user has no restrictions, show all documents
  if (userLocations.length === 0 && userCostCenters.length === 0) {
    const [documents, total] = await Promise.all([
      prisma.document.findMany({
        take: limit,
        skip: offset,
        orderBy: { [orderBy]: order },
      }),
      prisma.document.count(),
    ]);
    return { documents, total };
  }

  // For restricted users, filter by associated cost records
  // Get documents that have cost records in user's allowed locations/cost centers
  // or documents with no cost records (unprocessed)
  const locationFilter = userLocations.length > 0 ? { locationId: { in: userLocations } } : {};
  const costCenterFilter = userCostCenters.length > 0 ? { costCenterId: { in: userCostCenters } } : {};

  // Find document IDs that have matching cost records
  const accessibleDocumentIds = await prisma.costRecord.findMany({
    where: {
      AND: [locationFilter, costCenterFilter],
      sourceDocumentId: { not: null },
    },
    select: { sourceDocumentId: true },
    distinct: ['sourceDocumentId'],
  });

  const accessibleIds = accessibleDocumentIds.map((r) => r.sourceDocumentId).filter((id): id is string => id !== null);

  // Also include documents with no cost records (unprocessed)
  const documentsWithNoCostRecords = await prisma.document.findMany({
    where: {
      costRecords: { none: {} },
    },
    select: { id: true },
  });

  const unprocessedIds = documentsWithNoCostRecords.map((d) => d.id);

  // Combine accessible IDs
  const allAccessibleIds = [...new Set([...accessibleIds, ...unprocessedIds])];

  // Build where clause using accessible IDs
  const whereClause = { id: { in: allAccessibleIds } };

  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where: whereClause,
      take: limit,
      skip: offset,
      orderBy: { [orderBy]: order },
    }),
    prisma.document.count({ where: whereClause }),
  ]);

  return { documents, total };
}

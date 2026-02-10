import type { Document } from '../../lib/api/documents';

export interface DocumentsPaginationState {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface DocumentsQuery {
  offset?: number;
  append?: boolean;
}

export type ManagedDocument = Document;

export type StatusFilter = 'all' | 'new' | 'acknowledged' | 'resolved' | 'false_positive';

export type SeverityFilter = 'all' | 'critical' | 'warning' | 'info';

export interface AnomalyPagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

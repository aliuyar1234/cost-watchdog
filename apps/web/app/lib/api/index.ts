/**
 * API module exports
 *
 * This module re-exports all API functions and types from their respective domain modules.
 * Import from this file for convenient access to all API functionality.
 */

// Core client utilities
export { ApiError, fetchApi, buildQueryString, API_URL } from './client';

// Auth API
export { authApi } from './auth';
export type { LoginRequest, RegisterRequest, AuthResponse, User } from './auth';

// Documents API
export { documentsApi } from './documents';
export type { Document, DocumentsResponse } from './documents';

// Anomalies API
export { anomaliesApi } from './anomalies';
export type { Anomaly, AnomaliesResponse, AnomalyStats } from './anomalies';

// Analytics API
export { analyticsApi } from './analytics';
export type {
  DashboardData,
  TrendDataPoint,
  BreakdownItem,
  ComparisonData,
} from './analytics';

// Exports API
export { exportsApi } from './exports';
export type { MonthlyReport } from './exports';

// Users API
export { usersApi } from './users';
export type { UserDetails, UsersResponse } from './users';

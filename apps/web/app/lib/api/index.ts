/**
 * API module exports
 *
 * This module re-exports all API functions and types from their respective domain modules.
 * Import from this file for convenient access to all API functionality.
 */

// Core client utilities
export { ApiError, fetchApi, buildQueryString, API_URL } from './client.js';

// Auth API
export { authApi } from './auth.js';
export type { LoginRequest, RegisterRequest, AuthResponse, User } from './auth.js';

// Documents API
export { documentsApi } from './documents.js';
export type { Document, DocumentsResponse } from './documents.js';

// Anomalies API
export { anomaliesApi } from './anomalies.js';
export type { Anomaly, AnomaliesResponse, AnomalyStats } from './anomalies.js';

// Analytics API
export { analyticsApi } from './analytics.js';
export type {
  DashboardData,
  TrendDataPoint,
  BreakdownItem,
  ComparisonData,
} from './analytics.js';

// Exports API
export { exportsApi } from './exports.js';
export type { MonthlyReport } from './exports.js';

// Users API
export { usersApi } from './users.js';
export type { UserDetails, UsersResponse } from './users.js';

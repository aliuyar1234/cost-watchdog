/**
 * API module - Re-exports from organized submodules
 *
 * This file maintains backwards compatibility with existing imports.
 * New code should import from './api/index.js' or specific submodules.
 *
 * Structure:
 *   api/
 *   ├── client.ts     - Core fetch utilities, ApiError, buildQueryString
 *   ├── auth.ts       - Authentication endpoints
 *   ├── documents.ts  - Document upload & management
 *   ├── anomalies.ts  - Anomaly detection & status
 *   ├── analytics.ts  - Dashboard & reporting data
 *   ├── exports.ts    - CSV/JSON exports
 *   ├── users.ts      - User management
 *   └── index.ts      - Re-exports all
 */

export * from './api/index';

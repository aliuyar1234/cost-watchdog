/**
 * Users API
 */

import { fetchApi, buildQueryString } from './client';

export interface UserDetails {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'manager' | 'analyst' | 'viewer' | 'auditor';
  isActive: boolean;
  allowedLocationIds: string[];
  allowedCostCenterIds: string[];
  lastLoginAt: string | null;
  createdAt: string;
}

export interface UsersResponse {
  data: UserDetails[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export const usersApi = {
  list: (params?: { role?: string; isActive?: boolean; limit?: number; offset?: number }) =>
    fetchApi<UsersResponse>(`/users${buildQueryString(params)}`),

  get: (id: string) => fetchApi<UserDetails>(`/users/${id}`),

  create: (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role: string;
    allowedLocationIds?: string[];
    allowedCostCenterIds?: string[];
  }) =>
    fetchApi<UserDetails>('/users', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (
    id: string,
    data: {
      firstName?: string;
      lastName?: string;
      role?: string;
      isActive?: boolean;
      allowedLocationIds?: string[];
      allowedCostCenterIds?: string[];
    }
  ) =>
    fetchApi<UserDetails>(`/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    fetchApi<void>(`/users/${id}`, {
      method: 'DELETE',
    }),

  resetPassword: (id: string, newPassword: string) =>
    fetchApi<{ success: boolean; message: string }>(`/users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ newPassword }),
    }),
};

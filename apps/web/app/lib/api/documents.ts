/**
 * Documents API
 */

import { fetchApi, buildQueryString, API_URL, ApiError } from './client';

export interface Document {
  id: string;
  filename: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  extractionStatus: string;
  verificationStatus: string;
  uploadedAt: string;
}

export interface DocumentsResponse {
  data: Document[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

export const documentsApi = {
  list: (params?: { limit?: number; offset?: number; status?: string }) =>
    fetchApi<DocumentsResponse>(`/documents${buildQueryString(params)}`),

  get: (id: string) => fetchApi<Document>(`/documents/${id}`),

  upload: async (file: File) => {
    const token = localStorage.getItem('accessToken');
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_URL}/documents/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Upload failed' }));
      throw new ApiError(response.status, error.message, error);
    }

    return response.json();
  },

  getDownloadUrl: (id: string) =>
    fetchApi<{ downloadUrl: string; filename: string; expiresIn: number }>(
      `/documents/${id}/download`
    ),

  delete: (id: string) =>
    fetchApi<void>(`/documents/${id}`, {
      method: 'DELETE',
    }),

  retryExtraction: (id: string) =>
    fetchApi<{ success: boolean; message: string }>(`/documents/${id}/retry-extraction`, {
      method: 'POST',
    }),
};

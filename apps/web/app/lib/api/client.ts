/**
 * Core API client utilities
 */

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001/api/v1';

export { API_URL };

/**
 * API error class
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Build query string from params object
 */
export function buildQueryString(params?: Record<string, unknown>): string {
  if (!params) return '';
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.set(key, String(value));
    }
  });
  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

const CSRF_HEADER = 'x-csrf-token';

let csrfToken: string | null = null;
let csrfPromise: Promise<string | null> | null = null;

async function loadCsrfToken(): Promise<string | null> {
  if (csrfToken) return csrfToken;
  if (!csrfPromise) {
    csrfPromise = fetch(`${API_URL}/csrf/token`, {
      credentials: 'include',
    })
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }
        const data = await response.json().catch(() => null);
        csrfToken = data?.token ?? null;
        return csrfToken;
      })
      .finally(() => {
        csrfPromise = null;
      });
  }
  return csrfPromise;
}

function isJsonBody(body: RequestInit['body']): boolean {
  return typeof body === 'string';
}

function isFormData(body: RequestInit['body']): body is FormData {
  return typeof FormData !== 'undefined' && body instanceof FormData;
}

function shouldAttachCsrf(method: string): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}

/**
 * Fetch wrapper with cookie-based auth.
 * Auth tokens are handled via HttpOnly cookies (credentials: 'include').
 */
export async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const method = options.method || 'GET';
  const headers: HeadersInit = {
    ...(isJsonBody(options.body) ? { 'Content-Type': 'application/json' } : {}),
    ...options.headers,
  };

  if (shouldAttachCsrf(method)) {
    const token = await loadCsrfToken();
    if (token) {
      headers[CSRF_HEADER] = token;
    }
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include', // Auth handled via HttpOnly cookies
  });

  // Retry once on CSRF failure (token rotated/expired)
  if (response.status === 403 && shouldAttachCsrf(method)) {
    csrfToken = null;
    const token = await loadCsrfToken();
    if (token) {
      const retryHeaders: HeadersInit = {
        ...(isJsonBody(options.body) ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
        [CSRF_HEADER]: token,
      };

      const retryResponse = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: retryHeaders,
        credentials: 'include',
      });

      if (retryResponse.ok) {
        if (retryResponse.status === 204) {
          return undefined as T;
        }
        return retryResponse.json();
      }

      const retryError = await retryResponse.json().catch(() => ({ message: 'Unknown error' }));
      throw new ApiError(retryResponse.status, retryError.message || 'Request failed', retryError);
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new ApiError(response.status, error.message || 'Request failed', error);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

/**
 * Fetch wrapper for multipart/form-data with CSRF support.
 */
export async function fetchApiForm<T>(
  endpoint: string,
  formData: FormData,
  options: RequestInit = {}
): Promise<T> {
  const method = options.method || 'POST';
  const headers: HeadersInit = {
    ...options.headers,
  };

  if (shouldAttachCsrf(method)) {
    const token = await loadCsrfToken();
    if (token) {
      headers[CSRF_HEADER] = token;
    }
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    method,
    headers,
    body: formData,
    credentials: 'include',
  });

  if (response.status === 403 && shouldAttachCsrf(method)) {
    csrfToken = null;
    const token = await loadCsrfToken();
    if (token) {
      const retryResponse = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        method,
        headers: {
          ...options.headers,
          [CSRF_HEADER]: token,
        },
        body: formData,
        credentials: 'include',
      });

      if (retryResponse.ok) {
        if (retryResponse.status === 204) {
          return undefined as T;
        }
        return retryResponse.json();
      }

      const retryError = await retryResponse.json().catch(() => ({ message: 'Unknown error' }));
      throw new ApiError(retryResponse.status, retryError.message || 'Request failed', retryError);
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new ApiError(response.status, error.message || 'Request failed', error);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

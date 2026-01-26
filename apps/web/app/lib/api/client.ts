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
    public details?: unknown,
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

const inflightGets = new Map<string, Promise<unknown>>();

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

function shouldAttachCsrf(method: string): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}

async function buildHeaders(options: RequestInit, method: string): Promise<Headers> {
  const headers = new Headers(options.headers);

  if (isJsonBody(options.body) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (shouldAttachCsrf(method)) {
    const token = await loadCsrfToken();
    if (token) {
      headers.set(CSRF_HEADER, token);
    }
  }

  return headers;
}

/**
 * Fetch wrapper with cookie-based auth.
 * Auth tokens are handled via HttpOnly cookies (credentials: 'include').
 */
export async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const method = options.method || 'GET';
  const headers = await buildHeaders(options, method);
  const methodUpper = method.toUpperCase();

  if (methodUpper === 'GET') {
    const key = `GET ${endpoint}`;
    const existing = inflightGets.get(key) as Promise<T> | undefined;
    if (existing) return existing;

    const promise = (async () => {
      const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        method,
        headers,
        credentials: 'include', // Auth handled via HttpOnly cookies
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Unknown error' }));
        throw new ApiError(response.status, error.message || 'Request failed', error);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return response.json();
    })();

    inflightGets.set(key, promise);
    try {
      return await promise;
    } finally {
      inflightGets.delete(key);
    }
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    method,
    headers,
    credentials: 'include', // Auth handled via HttpOnly cookies
  });

  // Retry once on CSRF failure (token rotated/expired)
  if (response.status === 403 && shouldAttachCsrf(method)) {
    csrfToken = null;
    const retryHeaders = await buildHeaders(options, method);

    const retryResponse = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      method,
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
  options: RequestInit = {},
): Promise<T> {
  const method = options.method || 'POST';
  const headers = await buildHeaders(options, method);

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    method,
    headers,
    body: formData,
    credentials: 'include',
  });

  if (response.status === 403 && shouldAttachCsrf(method)) {
    csrfToken = null;
    const retryHeaders = await buildHeaders(options, method);
    const retryResponse = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      method,
      headers: retryHeaders,
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

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new ApiError(response.status, error.message || 'Request failed', error);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

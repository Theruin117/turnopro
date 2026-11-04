import type { AuthSession } from '@turnopro/contracts';

export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'
).replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

let accessToken: string | null = null;
let refreshPromise: Promise<AuthSession> | null = null;
let sessionListener: ((session: AuthSession) => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function subscribeToSessionRefresh(
  listener: ((session: AuthSession) => void) | null,
): void {
  sessionListener = listener;
}

export async function apiFetch<T>(
  path: string,
  options: ApiRequestOptions = {},
  allowRetry = true,
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');

  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: 'no-store',
  });

  if (
    response.status === 401 &&
    allowRetry &&
    accessToken &&
    !path.startsWith('/auth/')
  ) {
    try {
      await refreshSession();
      return apiFetch<T>(path, options, false);
    } catch {
      accessToken = null;
    }
  }

  return parseResponse<T>(response);
}

export async function refreshSession(): Promise<AuthSession> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });

      if (!response.ok) {
        accessToken = null;
        throw await toApiError(response);
      }

      const session = (await response.json()) as AuthSession;
      accessToken = session.accessToken;
      sessionListener?.(session);
      return session;
    })().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

export async function logoutRequest(): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
  } finally {
    accessToken = null;
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type');
  const hasJson = contentType?.includes('application/json') ?? false;
  const payload = hasJson ? await response.json() : undefined;

  if (!response.ok) {
    const error = payload as
      | { error?: { code?: string; message?: string; details?: unknown } }
      | undefined;
    throw new ApiError(
      error?.error?.message ?? `La solicitud falló (${response.status})`,
      response.status,
      error?.error?.code ?? 'REQUEST_FAILED',
      error?.error?.details,
    );
  }

  return payload as T;
}

async function toApiError(response: Response): Promise<ApiError> {
  let payload: { error?: { code?: string; message?: string; details?: unknown } } | undefined;
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    payload = undefined;
  }
  return new ApiError(
    payload?.error?.message ?? `La solicitud falló (${response.status})`,
    response.status,
    payload?.error?.code ?? 'REQUEST_FAILED',
    payload?.error?.details,
  );
}

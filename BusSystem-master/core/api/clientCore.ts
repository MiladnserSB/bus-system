import { translateWebApiError } from '@/i18n/ar';
import { ApiErrorPayload, AuthTokensResponse } from '@/types/api.types';

const DEFAULT_WEB_API_URL = 'http://localhost:3000/api/v1';

export function resolveWebApiBaseUrl(): string {
  const raw =
    typeof process !== 'undefined' ? process.env?.NEXT_PUBLIC_API_URL : undefined;
  return (raw ?? DEFAULT_WEB_API_URL).trim().replace(/\/+$/, '');
}

export class WebApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;
  readonly rawMessage?: string;

  constructor(params: {
    status: number;
    code: string;
    message: string;
    details?: Record<string, unknown>;
    rawMessage?: string;
  }) {
    super(params.message);
    this.name = 'WebApiError';
    this.status = params.status;
    this.code = params.code;
    this.details = params.details;
    this.rawMessage = params.rawMessage;
  }
}

export interface WebRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  skipAuth?: boolean;
  skipAuthRetry?: boolean;
  responseType?: 'json' | 'blob';
}

export interface WebApiClientDeps {
  baseUrl?: string;
  fetchFn?: typeof fetch;
  getAccessToken?: () => string | null;
  getRefreshToken?: () => string | null;
  onTokensRefreshed?: (res: AuthTokensResponse) => void;
  onAuthFailure?: () => void;
  delayFn?: (ms: number) => Promise<void>;
  retryBaseDelayMs?: number;
}

const defaultDelay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const extractMessage = (payload?: ApiErrorPayload): string | undefined => {
  if (!payload?.message) return undefined;
  if (Array.isArray(payload.message)) {
    return payload.message.filter(Boolean).join('، ');
  }
  return String(payload.message);
};

export function createWebApiClient(deps: WebApiClientDeps = {}) {
  const fetchFn = deps.fetchFn ?? fetch;
  const delayFn = deps.delayFn ?? defaultDelay;
  const retryBaseDelayMs = deps.retryBaseDelayMs ?? 300;
  const getAccessToken = deps.getAccessToken ?? (() => null);
  const getRefreshToken = deps.getRefreshToken ?? (() => null);
  const onTokensRefreshed = deps.onTokensRefreshed ?? (() => {});
  const onAuthFailure = deps.onAuthFailure ?? (() => {});

  let refreshPromise: Promise<string | null> | null = null;

  const refreshAccessToken = async (): Promise<string | null> => {
    if (refreshPromise) return refreshPromise;

    refreshPromise = (async () => {
      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        onAuthFailure();
        return null;
      }

      try {
        const baseUrl = deps.baseUrl ?? resolveWebApiBaseUrl();
        const res = await fetchFn(`${baseUrl}/auth/refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ refreshToken }),
        });

        if (!res.ok) {
          onAuthFailure();
          return null;
        }

        const data = (await res.json()) as AuthTokensResponse;
        if (!data?.accessToken || !data?.refreshToken) {
          onAuthFailure();
          return null;
        }

        onTokensRefreshed(data);
        return data.accessToken;
      } catch {
        return null;
      } finally {
        refreshPromise = null;
      }
    })();

    return refreshPromise;
  };

  async function request<T>(endpoint: string, options: WebRequestOptions = {}): Promise<T> {
    const method = options.method ?? 'GET';
    const maxRetries =
      options.retries !== undefined ? options.retries : method === 'GET' ? 3 : 0;
    const timeoutMs = options.timeoutMs ?? 20_000;
    const baseUrl = deps.baseUrl ?? resolveWebApiBaseUrl();
    const url = `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const token = options.skipAuth ? null : getAccessToken();
        const headers: Record<string, string> = {
          Accept: options.responseType === 'blob' ? '*/*' : 'application/json',
          ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...options.headers,
        };

        const response = await fetchFn(url, {
          method,
          headers,
          body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutHandle);

        if (
          response.status === 401 &&
          !options.skipAuth &&
          !options.skipAuthRetry &&
          !endpoint.includes('/auth/refresh') &&
          !endpoint.includes('/auth/login')
        ) {
          const refreshed = await refreshAccessToken();
          if (refreshed) {
            return request<T>(endpoint, {
              ...options,
              skipAuthRetry: true,
              retries: 0,
            });
          }
          throw new WebApiError({
            status: 401,
            code: 'UNAUTHORIZED',
            message: translateWebApiError('UNAUTHORIZED'),
          });
        }

        if (!response.ok) {
          const text = await response.text();
          let payload: ApiErrorPayload = {};
          if (text) {
            try {
              payload = JSON.parse(text) as ApiErrorPayload;
            } catch {
              payload = {};
            }
          }

          const code =
            payload.code ??
            (response.status === 401
              ? 'UNAUTHORIZED'
              : response.status === 403
                ? 'FORBIDDEN'
                : response.status === 404
                  ? 'NOT_FOUND'
                  : response.status >= 500
                    ? 'INTERNAL_ERROR'
                    : 'VALIDATION_ERROR');
          const rawMessage = extractMessage(payload);
          const apiErr = new WebApiError({
            status: response.status,
            code,
            message: translateWebApiError(code, rawMessage),
            details: payload.details,
            rawMessage,
          });

          if (method === 'GET' && response.status >= 500 && attempt < maxRetries) {
            lastError = apiErr;
            await delayFn(retryBaseDelayMs * 2 ** attempt);
            continue;
          }

          throw apiErr;
        }

        if (options.responseType === 'blob') {
          return (await response.blob()) as unknown as T;
        }

        const text = await response.text();
        return (text ? JSON.parse(text) : null) as T;
      } catch (err) {
        clearTimeout(timeoutHandle);

        if (err instanceof WebApiError) {
          throw err;
        }

        const isAbort =
          err instanceof Error && (err.name === 'AbortError' || err.message.includes('aborted'));
        const code = isAbort ? 'TIMEOUT_ERROR' : 'NETWORK_ERROR';
        const networkErr = new WebApiError({
          status: 0,
          code,
          message: translateWebApiError(code),
          rawMessage: err instanceof Error ? err.message : undefined,
        });

        lastError = networkErr;
        if (method === 'GET' && attempt < maxRetries) {
          await delayFn(retryBaseDelayMs * 2 ** attempt);
          continue;
        }

        throw networkErr;
      }
    }

    throw lastError instanceof WebApiError
      ? lastError
      : new WebApiError({
          status: 0,
          code: 'NETWORK_ERROR',
          message: translateWebApiError('NETWORK_ERROR'),
        });
  }

  return {
    request,
    get: <T>(endpoint: string, options?: Omit<WebRequestOptions, 'method' | 'body'>) =>
      request<T>(endpoint, { ...options, method: 'GET' }),
    post: <T>(
      endpoint: string,
      body?: unknown,
      options?: Omit<WebRequestOptions, 'method' | 'body'>,
    ) => request<T>(endpoint, { ...options, method: 'POST', body }),
    patch: <T>(
      endpoint: string,
      body?: unknown,
      options?: Omit<WebRequestOptions, 'method' | 'body'>,
    ) => request<T>(endpoint, { ...options, method: 'PATCH', body }),
    put: <T>(
      endpoint: string,
      body?: unknown,
      options?: Omit<WebRequestOptions, 'method' | 'body'>,
    ) => request<T>(endpoint, { ...options, method: 'PUT', body }),
    delete: <T>(endpoint: string, options?: Omit<WebRequestOptions, 'method'>) =>
      request<T>(endpoint, { ...options, method: 'DELETE' }),
  };
}

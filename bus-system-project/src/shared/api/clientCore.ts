import { translateApiError } from '../i18n/ar';
import { ApiErrorPayload, AuthTokensResponse } from '../types/api.types';

const DEFAULT_API_BASE_URL = 'http://localhost:3000/api/v1';

export function resolveApiBaseUrl(): string {
  const envUrl =
    typeof process !== 'undefined' ? process.env?.EXPO_PUBLIC_API_URL : undefined;
  const candidate = (envUrl ?? DEFAULT_API_BASE_URL).trim();
  return candidate.replace(/\/+$/, '');
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  readonly rawMessage?: string;

  constructor(params: {
    status: number;
    code: string;
    message: string;
    details?: unknown;
    rawMessage?: string;
  }) {
    super(params.message);
    this.name = 'ApiError';
    this.status = params.status;
    this.code = params.code;
    this.details = params.details;
    this.rawMessage = params.rawMessage;
  }
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  skipAuth?: boolean;
  skipAuthRetry?: boolean;
}

export interface ApiClientDeps {
  baseUrl?: string;
  fetchFn?: typeof fetch;
  getAccessToken?: () => Promise<string | null>;
  getRefreshToken?: () => Promise<string | null>;
  onTokensRefreshed?: (res: AuthTokensResponse) => Promise<void>;
  onAuthFailure?: () => Promise<void>;
  delayFn?: (ms: number) => Promise<void>;
  retryBaseDelayMs?: number;
}

const defaultDelay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const extractErrorMessage = (payload?: ApiErrorPayload): string | undefined => {
  if (!payload?.message) return undefined;
  if (Array.isArray(payload.message)) {
    return payload.message.filter(Boolean).join('، ');
  }
  return String(payload.message);
};

export function createApiClient(deps: ApiClientDeps = {}) {
  const fetchFn = deps.fetchFn ?? fetch;
  const delayFn = deps.delayFn ?? defaultDelay;
  const retryBaseDelayMs = deps.retryBaseDelayMs ?? 300;
  const getAccessToken = deps.getAccessToken ?? (async () => null);
  const getRefreshToken = deps.getRefreshToken ?? (async () => null);
  const onTokensRefreshed = deps.onTokensRefreshed ?? (async () => {});
  const onAuthFailure = deps.onAuthFailure ?? (async () => {});

  let refreshInFlight: Promise<string | null> | null = null;

  const refreshAccessToken = async (): Promise<string | null> => {
    if (refreshInFlight) {
      return refreshInFlight;
    }

    refreshInFlight = (async () => {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) {
        await onAuthFailure();
        return null;
      }

      try {
        const baseUrl = deps.baseUrl ?? resolveApiBaseUrl();
        const res = await fetchFn(`${baseUrl}/auth/refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ refreshToken }),
        });

        if (!res.ok) {
          await onAuthFailure();
          return null;
        }

        const data = (await res.json()) as AuthTokensResponse;
        if (!data?.accessToken || !data?.refreshToken) {
          await onAuthFailure();
          return null;
        }

        await onTokensRefreshed(data);
        return data.accessToken;
      } catch {
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();

    return refreshInFlight;
  };

  async function request<T>(endpoint: string, options: ApiRequestOptions = {}): Promise<T> {
    const method = options.method ?? 'GET';
    const maxRetries =
      options.retries !== undefined ? options.retries : method === 'GET' ? 3 : 0;
    const timeoutMs = options.timeoutMs ?? 15_000;
    const baseUrl = deps.baseUrl ?? resolveApiBaseUrl();
    const url = `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const token = options.skipAuth ? null : await getAccessToken();
        const headers: Record<string, string> = {
          Accept: 'application/json',
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
          !endpoint.includes('/auth/refresh')
        ) {
          const newToken = await refreshAccessToken();
          if (newToken) {
            return request<T>(endpoint, {
              ...options,
              skipAuthRetry: true,
              retries: 0,
            });
          }
          throw new ApiError({
            status: 401,
            code: 'UNAUTHORIZED',
            message: translateApiError('UNAUTHORIZED'),
          });
        }

        const contentType = response.headers?.get?.('content-type') ?? '';
        const text = await response.text();
        let parsed: unknown = null;
        if (
          text &&
          (contentType.includes('application/json') ||
            text.trim().startsWith('{') ||
            text.trim().startsWith('['))
        ) {
          try {
            parsed = JSON.parse(text);
          } catch {
            parsed = null;
          }
        }

        if (!response.ok) {
          const payload = (parsed ?? {}) as ApiErrorPayload;
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
          const rawMsg = extractErrorMessage(payload);
          const apiErr = new ApiError({
            status: response.status,
            code,
            message: translateApiError(code, rawMsg),
            details: payload.details,
            rawMessage: rawMsg,
          });

          if (method === 'GET' && response.status >= 500 && attempt < maxRetries) {
            lastError = apiErr;
            await delayFn(retryBaseDelayMs * 2 ** attempt);
            continue;
          }

          throw apiErr;
        }

        return (parsed ?? ({} as T)) as T;
      } catch (err) {
        clearTimeout(timeoutHandle);

        if (err instanceof ApiError) {
          throw err;
        }

        const isAbort =
          err instanceof Error && (err.name === 'AbortError' || err.message.includes('aborted'));
        const code = isAbort ? 'TIMEOUT_ERROR' : 'NETWORK_ERROR';
        const networkErr = new ApiError({
          status: 0,
          code,
          message: translateApiError(code),
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

    throw lastError instanceof ApiError
      ? lastError
      : new ApiError({
          status: 0,
          code: 'NETWORK_ERROR',
          message: translateApiError('NETWORK_ERROR'),
        });
  }

  return {
    request,
    get: <T>(endpoint: string, options?: Omit<ApiRequestOptions, 'method' | 'body'>) =>
      request<T>(endpoint, { ...options, method: 'GET' }),
    post: <T>(
      endpoint: string,
      body?: unknown,
      options?: Omit<ApiRequestOptions, 'method' | 'body'>,
    ) => request<T>(endpoint, { ...options, method: 'POST', body }),
    patch: <T>(
      endpoint: string,
      body?: unknown,
      options?: Omit<ApiRequestOptions, 'method' | 'body'>,
    ) => request<T>(endpoint, { ...options, method: 'PATCH', body }),
    put: <T>(
      endpoint: string,
      body?: unknown,
      options?: Omit<ApiRequestOptions, 'method' | 'body'>,
    ) => request<T>(endpoint, { ...options, method: 'PUT', body }),
    delete: <T>(endpoint: string, options?: Omit<ApiRequestOptions, 'method'>) =>
      request<T>(endpoint, { ...options, method: 'DELETE' }),
  };
}

import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from '../src/shared/api/clientCore';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: () => 'application/json',
    } as unknown as Headers,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

describe('API Client (Refresh, GET Retry & Arabic Error Mapping)', () => {
  it('retries GET requests up to 3 times on 503 transient errors and succeeds on 4th try', async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls += 1;
      if (calls < 4) {
        return jsonResponse(503, { code: 'INTERNAL_ERROR', message: 'busy' });
      }
      return jsonResponse(200, [{ id: 1, nameAr: 'دمشق' }]);
    });

    const client = createApiClient({
      baseUrl: 'http://localhost:3000/api/v1',
      fetchFn: fetchMock as unknown as typeof fetch,
      delayFn: async () => {},
      getAccessToken: async () => null,
      getRefreshToken: async () => null,
    });

    const result = await client.get<Array<{ id: number; nameAr: string }>>('/cities');
    expect(calls).toBe(4);
    expect(result[0].nameAr).toBe('دمشق');
  });

  it('does NOT retry 409 SEAT_ALREADY_BOOKED and returns Arabic error message', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(409, {
        code: 'SEAT_ALREADY_BOOKED',
        message: 'already booked',
      }),
    );

    const client = createApiClient({
      baseUrl: 'http://localhost:3000/api/v1',
      fetchFn: fetchMock as unknown as typeof fetch,
      delayFn: async () => {},
      getAccessToken: async () => null,
      getRefreshToken: async () => null,
    });

    await expect(client.post('/trips/1/holds', { seatNumbers: ['1A'] })).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof ApiError &&
        err.status === 409 &&
        err.code === 'SEAT_ALREADY_BOOKED' &&
        err.message.includes('تم حجز هذا المقعد'),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refreshes expired token automatically once across concurrent 401 calls and retries', async () => {
    let accessToken = 'expired-token';
    let refreshToken = 'valid-refresh';
    const onTokensRefreshed = vi.fn(async (tokens) => {
      accessToken = tokens.accessToken;
      refreshToken = tokens.refreshToken;
    });

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/auth/refresh')) {
        return jsonResponse(200, {
          accessToken: 'fresh-access',
          refreshToken: 'fresh-refresh',
          expiresInSeconds: 900,
          user: { id: 10, name: 'سالم', phone: '+963944123456', role: 'CUSTOMER' },
        });
      }
      const authHeader = (init?.headers as Record<string, string>)?.Authorization;
      if (authHeader === 'Bearer expired-token') {
        return jsonResponse(401, { code: 'UNAUTHORIZED' });
      }
      return jsonResponse(200, { ok: true, usedToken: authHeader });
    });

    const client = createApiClient({
      baseUrl: 'http://localhost:3000/api/v1',
      fetchFn: fetchMock as unknown as typeof fetch,
      delayFn: async () => {},
      getAccessToken: async () => accessToken,
      getRefreshToken: async () => refreshToken,
      onTokensRefreshed,
    });

    const [resA, resB] = await Promise.all([
      client.get<{ ok: boolean; usedToken: string }>('/me'),
      client.get<{ ok: boolean; usedToken: string }>('/me/bookings'),
    ]);

    expect(resA.ok).toBe(true);
    expect(resB.ok).toBe(true);
    expect(refreshToken).toBe('fresh-refresh');
    expect(onTokensRefreshed).toHaveBeenCalledTimes(1);

    const refreshCalls = fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/auth/refresh'));
    expect(refreshCalls).toHaveLength(1);
  });

  it('calls onAuthFailure when refresh token is rejected', async () => {
    const onAuthFailure = vi.fn(async () => {});
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/auth/refresh')) {
        return jsonResponse(401, { code: 'INVALID_REFRESH_TOKEN' });
      }
      return jsonResponse(401, { code: 'UNAUTHORIZED' });
    });

    const client = createApiClient({
      baseUrl: 'http://localhost:3000/api/v1',
      fetchFn: fetchMock as unknown as typeof fetch,
      delayFn: async () => {},
      getAccessToken: async () => 'stale-access',
      getRefreshToken: async () => 'revoked-refresh',
      onAuthFailure,
    });

    await expect(client.get('/me')).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
    });
    expect(onAuthFailure).toHaveBeenCalledTimes(1);
  });
});

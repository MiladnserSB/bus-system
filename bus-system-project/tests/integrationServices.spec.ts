import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../src/shared/api/clientCore';
import { createServices, type ApiStorageAdapter } from '../src/shared/api/servicesCore';
import { AuthUser } from '../src/shared/types/api.types';

function createMemoryStorage(): ApiStorageAdapter {
  let refreshToken: string | null = 'init-refresh';
  const fcmToken: string | null = 'fcm-123';
  const guestTokens = new Map<string, string>();
  const guestSessionId = 'guest-session-abc';

  return {
    saveAuthSession: vi.fn(async (params) => {
      refreshToken = params.refreshToken;
    }),
    saveUser: vi.fn(async (_u: AuthUser) => {}),
    getRefreshToken: vi.fn(async () => refreshToken),
    getFcmToken: vi.fn(async () => fcmToken),
    clearAuthSession: vi.fn(async () => {
      refreshToken = null;
    }),
    getOrCreateGuestSessionId: vi.fn(async () => guestSessionId),
    saveGuestBookingRef: vi.fn(async (code: string, token: string) => {
      guestTokens.set(code, token);
    }),
    getGuestTokenForBooking: vi.fn(async (code: string) => guestTokens.get(code) ?? null),
  };
}

describe('API Services Integration Tests against Backend DTO Contracts', () => {
  it('maps auth OTP, profile, catalog, holds, idempotent booking, passenger update & cancel endpoints accurately', async () => {
    const calls: { url: string; method: string; headers: Record<string, string>; body: unknown }[] = [];

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      const parsedBody = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, method: init?.method ?? 'GET', headers, body: parsedBody });

      const reply = (data: unknown) => ({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' } as unknown as Headers,
        text: async () => JSON.stringify(data),
        json: async () => data,
      }) as unknown as Response;

      if (url.endsWith('/auth/otp/verify')) {
        return reply({
          accessToken: 'jwt-access-1',
          refreshToken: 'jwt-refresh-1',
          expiresInSeconds: 900,
          user: { id: 7, name: 'سامر', phone: '+963944123456', role: 'CUSTOMER' },
        });
      }
      if (url.endsWith('/bookings')) {
        return reply({
          booking: { id: 1, code: 'BK-20261201-0001' },
          ticket: { bookingCode: 'BK-20261201-0001' },
          idempotentReplay: false,
          guestAccessToken: 'guest-tok-99',
        });
      }
      return reply({});
    });

    const storage = createMemoryStorage();
    const client = createApiClient({
      baseUrl: 'http://localhost:3000/api/v1',
      fetchFn: fetchMock as unknown as typeof fetch,
      delayFn: async () => {},
      getAccessToken: async () => 'jwt-access-1',
      getRefreshToken: storage.getRefreshToken,
    });
    const services = createServices(client, storage);

    await services.authApi.requestOtp('+963944123456');
    await services.authApi.verifyOtp({
      phone: '+963944123456',
      code: '123456',
      name: 'سامر',
      consentAccepted: true,
    });
    expect(storage.saveAuthSession).toHaveBeenCalledTimes(1);

    await services.tripsApi.searchTrips({
      originId: 1,
      destinationId: 2,
      date: '2026-12-01',
      sortBy: 'departAt',
      sortOrder: 'asc',
    });
    expect(calls.at(-1)?.url).toContain('/trips?originId=1&destinationId=2&date=2026-12-01');

    await services.holdsApi.createHold(15, ['1A', '1B']);
    expect(calls.at(-1)).toMatchObject({
      url: 'http://localhost:3000/api/v1/trips/15/holds',
      method: 'POST',
      headers: expect.objectContaining({ 'x-guest-session': 'guest-session-abc' }),
      body: { seatNumbers: ['1A', '1B'], guestSessionId: 'guest-session-abc' },
    });

    await services.bookingsApi.createBooking(
      {
        tripId: 15,
        holdId: 'hold-1',
        passengers: [
          { seatNumber: '1A', passengerName: 'سامر', passengerPhone: '+963944123456' },
        ],
        paymentMethod: 'CASH_ON_BOARDING',
      },
      'idem-key-123',
    );
    expect(calls.at(-1)).toMatchObject({
      url: 'http://localhost:3000/api/v1/bookings',
      method: 'POST',
      headers: expect.objectContaining({ 'Idempotency-Key': 'idem-key-123' }),
    });
    expect(storage.saveGuestBookingRef).toHaveBeenCalledWith('BK-20261201-0001', 'guest-tok-99');

    await services.bookingsApi.getMyBookings('upcoming');
    expect(calls.at(-1)?.url).toBe('http://localhost:3000/api/v1/me/bookings?tab=upcoming');

    await services.bookingsApi.updatePassengers('BK-20261201-0001', [
      { seatNumber: '1A', passengerName: 'سامر العلي', passengerPhone: '+963944999888' },
    ]);
    expect(calls.at(-1)).toMatchObject({
      url: 'http://localhost:3000/api/v1/bookings/BK-20261201-0001/passengers',
      method: 'PATCH',
      body: {
        passengers: [
          { seatNumber: '1A', passengerName: 'سامر العلي', passengerPhone: '+963944999888' },
        ],
      },
    });

    await services.bookingsApi.cancelSeat('BK-20261201-0001', '1A', 'تغيير الخطة');
    expect(calls.at(-1)?.url).toBe(
      'http://localhost:3000/api/v1/bookings/BK-20261201-0001/seats/1A/cancel',
    );
    expect(calls.at(-1)?.headers['x-guest-token']).toBe('guest-tok-99');

    await services.devicesApi.registerDevice('fcm-123', 'ANDROID');
    expect(calls.at(-1)).toMatchObject({
      url: 'http://localhost:3000/api/v1/devices',
      method: 'POST',
      body: { fcmToken: 'fcm-123', platform: 'ANDROID' },
    });

    await services.notificationsApi.updatePreferences({ nonCriticalEnabled: false });
    expect(calls.at(-1)).toMatchObject({
      url: 'http://localhost:3000/api/v1/notifications/preferences',
      method: 'PATCH',
      body: { nonCriticalEnabled: false },
    });

    await services.authApi.logout();
    expect(storage.clearAuthSession).toHaveBeenCalledTimes(1);
  });
});

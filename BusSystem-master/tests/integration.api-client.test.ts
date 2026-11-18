import { describe, expect, it, vi } from 'vitest';
import { createWebApiClient, WebApiError } from '@/core/api/clientCore';
import { createWebServices } from '@/core/api/servicesCore';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Web API Client & Services Integration', () => {
  it('attaches Bearer token, refreshes on 401, and retries original request', async () => {
    let accessToken = 'expired-token';
    let refreshCalls = 0;

    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const auth = new Headers(init?.headers).get('Authorization');

      if (url.endsWith('/auth/refresh')) {
        refreshCalls += 1;
        return jsonResponse(200, {
          accessToken: 'fresh-token',
          refreshToken: 'fresh-refresh',
          expiresInSeconds: 900,
          user: {
            id: 1,
            name: 'Admin',
            username: 'admin',
            email: null,
            phone: '+963900000000',
            role: 'ADMIN',
            mustChangePassword: false,
          },
        });
      }

      if (url.endsWith('/me')) {
        if (auth === 'Bearer expired-token') {
          return jsonResponse(401, { code: 'UNAUTHORIZED', message: 'Expired' });
        }
        return jsonResponse(200, { id: 1, name: 'Admin', role: 'ADMIN' });
      }

      return jsonResponse(404, { code: 'NOT_FOUND', message: 'Not found' });
    }) as unknown as typeof fetch;

    const client = createWebApiClient({
      baseUrl: 'http://localhost:3000/api/v1',
      fetchFn,
      getAccessToken: () => accessToken,
      getRefreshToken: () => 'valid-refresh',
      onTokensRefreshed: (res) => {
        accessToken = res.accessToken;
      },
      delayFn: async () => {},
    });

    const services = createWebServices(client);
    const me = await services.profileService.getMe();

    expect(refreshCalls).toBe(1);
    expect(accessToken).toBe('fresh-token');
    expect(me.name).toBe('Admin');
  });

  it('uses PATCH for trip updates, handles 409 duplicate confirmation, and sends Idempotency-Key on booking', async () => {
    const requests: { method: string; url: string; headers: Headers; body: string | null }[] = [];

    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const headers = new Headers(init?.headers);
      const body = typeof init?.body === 'string' ? init.body : null;
      requests.push({ method, url, headers, body });

      if (method === 'POST' && url.endsWith('/trips')) {
        const parsed = body ? JSON.parse(body) : {};
        if (!parsed.confirmDuplicate) {
          return jsonResponse(409, {
            code: 'DUPLICATE_TRIP_CONFIRMATION_REQUIRED',
            message: 'Duplicate trip exists',
          });
        }
        return jsonResponse(201, { id: 99, status: 'OPEN' });
      }

      if (method === 'PATCH' && url.endsWith('/trips/99')) {
        return jsonResponse(200, { id: 99, price: 50000 });
      }

      if (method === 'POST' && url.endsWith('/bookings')) {
        return jsonResponse(201, {
          booking: { id: 1, code: 'BK-2026-555' },
          ticket: { bookingCode: 'BK-2026-555' },
          idempotentReplay: false,
        });
      }

      if (method === 'GET' && url.includes('/reports/revenue?')) {
        return new Response('route,revenue\ndamascus-aleppo,90000', {
          status: 200,
          headers: { 'Content-Type': 'text/csv' },
        });
      }

      return jsonResponse(400, { code: 'VALIDATION_ERROR', message: 'Bad request' });
    }) as unknown as typeof fetch;

    const client = createWebApiClient({
      baseUrl: 'http://localhost:3000/api/v1',
      fetchFn,
      getAccessToken: () => 'staff-jwt',
      delayFn: async () => {},
    });
    const services = createWebServices(client);

    // 1. Create trip triggers 409 confirmation first
    await expect(
      services.tripService.create({
        originId: 1,
        destinationId: 2,
        busTypeId: 1,
        price: 45000,
        departDate: '2026-06-15',
        departTime: '08:00',
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: 'DUPLICATE_TRIP_CONFIRMATION_REQUIRED',
    } satisfies Partial<WebApiError>);

    // 2. Retry with confirmDuplicate: true
    const created = await services.tripService.create({
      originId: 1,
      destinationId: 2,
      busTypeId: 1,
      price: 45000,
      departDate: '2026-06-15',
      departTime: '08:00',
      confirmDuplicate: true,
    });
    expect(created.id).toBe(99);

    // 3. PATCH /trips/99 (never PUT)
    const updated = await services.tripService.update(99, { price: 50000 });
    expect(updated.price).toBe(50000);
    expect(requests.find((r) => r.url.endsWith('/trips/99'))?.method).toBe('PATCH');

    // 4. Booking includes Idempotency-Key header and body field
    const bookRes = await services.bookingService.create(
      {
        tripId: 99,
        passengers: [
          { seatNumber: '1A', passengerName: 'طارق صالح', passengerPhone: '+963911223344' },
        ],
        paymentMethod: 'CASH_OFFICE',
      },
      'idem-web-123',
    );
    expect(bookRes.booking.code).toBe('BK-2026-555');
    const bookingReq = requests.find((r) => r.url.endsWith('/bookings'));
    expect(bookingReq?.headers.get('Idempotency-Key')).toBe('idem-web-123');

    // 5. Blob export
    const csvBlob = await services.reportService.exportFile('revenue', 'csv', {
      from: '2026-06-01',
      to: '2026-06-30',
    });
    expect(await csvBlob.text()).toContain('90000');
  });
});

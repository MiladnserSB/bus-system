import { describe, expect, it } from 'vitest';
import { createWebApiClient } from '@/core/api/clientCore';
import { createWebServices } from '@/core/api/servicesCore';

function createStatefulBackendFetch() {
  let currentToken = '';
  let mustChangePassword = true;
  const cities = [
    { id: 1, nameAr: 'دمشق', nameEn: 'Damascus', isActive: true },
    { id: 2, nameAr: 'حلب', nameEn: 'Aleppo', isActive: true },
  ];
  const busTypes = [
    {
      id: 1,
      code: 'BUSINESS_LARGE',
      nameAr: 'رجال أعمال كبير',
      nameEn: 'Business Large',
      category: 'BUSINESS',
      size: 'LARGE',
      layout: '1+1',
      rowsCount: 11,
      hasExtraBackSeat: false,
      totalSeats: 22,
      isActive: true,
    },
  ];
  const buses: { id: number; plateNumber: string; busTypeId: number; isActive: boolean; busType: typeof busTypes[0] }[] = [];
  const templates: { id: number; isActive: boolean; upcomingTripsCount: number; exclusions: { id: number; excludedDate: string; reason: string | null }[] }[] = [];
  const trips: { id: number; price: number; status: string; bookedSeatsCount: number; totalSeats: number; availableSeatsCount: number }[] = [
    { id: 101, price: 65000, status: 'OPEN', bookedSeatsCount: 0, totalSeats: 22, availableSeatsCount: 22 },
  ];
  const holds = new Map<string, string[]>();
  const idempotentBookings = new Map<string, { booking: { id: number; code: string; status: string }; ticket: { bookingCode: string } }>();
  const bookedSeats = new Set<string>();
  const policy = {
    cancellationDeadlineHours: 2,
    bookingCutoffMinutes: 30,
    maxSeatsPerBooking: 5,
    seatHoldTtlMinutes: 5,
    templateGenerateAheadDays: 14,
    tripAutoCompleteHours: 2,
    reminderHoursBefore: [24, 2],
  };

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input).replace('http://localhost:3000/api/v1', '');
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
    const headers = new Headers(init?.headers);

    if (method === 'POST' && url === '/auth/login') {
      const role = body.identifier === 'admin' ? 'ADMIN' : 'RECEPTIONIST';
      currentToken = `${role.toLowerCase()}-jwt`;
      return json(200, {
        accessToken: currentToken,
        refreshToken: 'refresh-jwt',
        expiresInSeconds: 900,
        user: {
          id: role === 'ADMIN' ? 1 : 2,
          name: role === 'ADMIN' ? 'المدير العام' : 'موظف الاستقبال',
          username: body.identifier,
          email: null,
          phone: '+963911111111',
          role,
          mustChangePassword: role === 'ADMIN' ? mustChangePassword : false,
        },
      });
    }

    if (method === 'POST' && url === '/auth/change-password') {
      mustChangePassword = false;
      return json(200, { changed: true });
    }

    if (method === 'POST' && url === '/cities') {
      const city = { id: cities.length + 1, nameAr: body.nameAr, nameEn: body.nameEn ?? null, isActive: true };
      cities.push(city);
      return json(201, city);
    }

    if (method === 'POST' && url === '/buses') {
      const bus = { id: buses.length + 1, plateNumber: body.plateNumber, busTypeId: body.busTypeId, isActive: true, busType: busTypes[0] };
      buses.push(bus);
      return json(201, bus);
    }

    if (method === 'POST' && url === '/trip-templates/preview') {
      return json(200, { count: 2, items: [{ date: '2026-06-15', time: body.departureTime, dayNameAr: 'الإثنين', departAt: '2026-06-15T05:00:00Z' }] });
    }

    if (method === 'POST' && url === '/trip-templates') {
      const tpl = { id: templates.length + 1, isActive: true, upcomingTripsCount: 2, exclusions: [] };
      templates.push(tpl);
      return json(201, tpl);
    }

    if (method === 'POST' && url === '/trip-templates/generate') {
      return json(200, { processedTemplates: templates.length, createdTrips: 2 });
    }

    if (method === 'PATCH' && url === '/settings') {
      Object.assign(policy, {
        cancellationDeadlineHours: body.cancellationDeadlineHours ?? policy.cancellationDeadlineHours,
      });
      return json(200, policy);
    }

    if (method === 'GET' && url === '/audit-logs') {
      return json(200, {
        items: [{ id: 1, action: 'UPDATE_SETTINGS', entity: 'Setting', entityId: 'global', details: {}, createdAt: new Date().toISOString(), user: null }],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });
    }

    if (method === 'GET' && url.startsWith('/trips/101/seats')) {
      return json(200, {
        tripId: 101,
        status: 'OPEN',
        price: 65000,
        busType: busTypes[0],
        seats: [
          {
            seatNumber: '1A',
            rowNumber: 1,
            colLetter: 'A',
            side: 'LEFT',
            colIndex: 0,
            isExtra: false,
            status: bookedSeats.has('1A') ? 'BOOKED' : 'AVAILABLE',
          },
          {
            seatNumber: '1B',
            rowNumber: 1,
            colLetter: 'B',
            side: 'RIGHT',
            colIndex: 1,
            isExtra: false,
            status: bookedSeats.has('1B') ? 'BOOKED' : 'AVAILABLE',
          },
        ],
      });
    }

    if (method === 'POST' && url === '/trips/101/holds') {
      const holdId = 'hold-uuid-1';
      holds.set(holdId, body.seatNumbers);
      return json(201, {
        holdId,
        tripId: 101,
        seatNumbers: body.seatNumbers,
        ttlSeconds: 300,
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
      });
    }

    if (method === 'POST' && url === '/bookings') {
      const idemKey = headers.get('Idempotency-Key') ?? body.idempotencyKey;
      const existing = idempotentBookings.get(idemKey);
      if (existing) {
        return json(200, { ...existing, idempotentReplay: true });
      }
      for (const p of body.passengers) bookedSeats.add(p.seatNumber);
      const created = {
        booking: {
          id: 500,
          code: 'BK-2026-0500',
          status: 'CONFIRMED',
          seats: body.passengers.map((p: { seatNumber: string; passengerName: string; passengerPhone: string }, idx: number) => ({
            id: idx + 1,
            ...p,
            isActive: true,
            status: 'CONFIRMED',
          })),
        },
        ticket: {
          bookingCode: 'BK-2026-0500',
        },
      };
      idempotentBookings.set(idemKey, created);
      return json(201, { ...created, idempotentReplay: false });
    }

    if (method === 'PATCH' && url === '/bookings/BK-2026-0500/passengers') {
      return json(200, { id: 500, code: 'BK-2026-0500', status: 'CONFIRMED' });
    }

    if (method === 'POST' && url === '/bookings/BK-2026-0500/seats/1B/cancel') {
      bookedSeats.delete('1B');
      return json(200, { id: 500, code: 'BK-2026-0500', status: 'PARTIAL_CANCELLED' });
    }

    if (method === 'GET' && url === '/trips/101/manifest') {
      return json(200, {
        trip: trips[0],
        passengers: [{ seatNumber: '1A', passengerName: 'باسل حسن', passengerPhone: '+963911223344', status: 'CONFIRMED', bookingCode: 'BK-2026-0500', paymentMethod: 'CASH_OFFICE', channel: 'RECEPTIONIST' }],
      });
    }

    return json(404, { code: 'NOT_FOUND', message: `Unhandled ${method} ${url}` });
  };
}

describe('E2E Staff Operational Workflows (Admin + Receptionist)', () => {
  it('completes full Admin setup workflow and Receptionist desk booking + partial cancel + manifest flow', async () => {
    let token = '';
    const client = createWebApiClient({
      baseUrl: 'http://localhost:3000/api/v1',
      fetchFn: createStatefulBackendFetch() as typeof fetch,
      getAccessToken: () => token,
    });
    const services = createWebServices(client);

    // 1. Admin login with forced password change
    const adminLogin = await services.authService.login('admin', 'Admin@123456');
    token = adminLogin.accessToken;
    expect(adminLogin.user.mustChangePassword).toBe(true);
    const pwdChange = await services.authService.changePassword('Admin@123456', 'StrongPass#2026');
    expect(pwdChange.changed).toBe(true);

    // 2. Master data & templates & policy settings & audit
    const city = await services.cityService.create({ nameAr: 'اللاذقية', nameEn: 'Latakia' });
    expect(city.nameAr).toBe('اللاذقية');

    const bus = await services.busService.create({ plateNumber: 'دمشق 889900', busTypeId: 1 });
    expect(bus.plateNumber).toBe('دمشق 889900');

    const preview = await services.templateService.preview({
      originId: 1,
      destinationId: 2,
      busTypeId: 1,
      busId: bus.id,
      price: 65000,
      departureTime: '08:00',
      recurrence: 'DAILY',
      startDate: '2026-06-15',
      generateAheadDays: 14,
    });
    expect(preview.count).toBeGreaterThan(0);

    await services.templateService.create({
      originId: 1,
      destinationId: 2,
      busTypeId: 1,
      busId: bus.id,
      price: 65000,
      departureTime: '08:00',
      recurrence: 'DAILY',
      startDate: '2026-06-15',
      generateAheadDays: 14,
    });
    const gen = await services.templateService.generateAll();
    expect(gen.createdTrips).toBe(2);

    const updatedPolicy = await services.settingsService.update({ cancellationDeadlineHours: 4 });
    expect(updatedPolicy.cancellationDeadlineHours).toBe(4);

    const audit = await services.auditLogService.findAll();
    expect(audit.items).toHaveLength(1);

    // 3. Receptionist login + hold + idempotent booking + edit + partial seat cancel + manifest
    const recLogin = await services.authService.login('reception1', 'Pass@1234');
    token = recLogin.accessToken;
    expect(recLogin.user.role).toBe('RECEPTIONIST');

    const seatMap = await services.tripService.getSeats(101);
    expect(seatMap.seats).toHaveLength(2);

    const hold = await services.holdService.createHold(101, ['1A', '1B']);
    expect(hold.seatNumbers).toEqual(['1A', '1B']);

    const booking1 = await services.bookingService.create(
      {
        tripId: 101,
        holdId: hold.holdId,
        passengers: [
          { seatNumber: '1A', passengerName: 'باسل حسن', passengerPhone: '+963911223344' },
          { seatNumber: '1B', passengerName: 'عمر حسن', passengerPhone: '+963911223345' },
        ],
        paymentMethod: 'CASH_OFFICE',
      },
      'idem-e2e-001',
    );
    expect(booking1.booking.code).toBe('BK-2026-0500');
    expect(booking1.idempotentReplay).toBe(false);

    // Duplicate click replay returns same ticket safely
    const replay = await services.bookingService.create(
      {
        tripId: 101,
        holdId: hold.holdId,
        passengers: [
          { seatNumber: '1A', passengerName: 'باسل حسن', passengerPhone: '+963911223344' },
          { seatNumber: '1B', passengerName: 'عمر حسن', passengerPhone: '+963911223345' },
        ],
        paymentMethod: 'CASH_OFFICE',
      },
      'idem-e2e-001',
    );
    expect(replay.idempotentReplay).toBe(true);

    // Edit passenger + partial seat cancel
    await services.bookingService.updatePassengers('BK-2026-0500', [
      { seatNumber: '1A', passengerName: 'باسل الحسن', passengerPhone: '+963911223344' },
    ]);
    const partialCancel = await services.bookingService.cancelSeat('BK-2026-0500', '1B', 'تغيير خطة');
    expect(partialCancel.status).toBe('PARTIAL_CANCELLED');

    const manifest = await services.tripService.getManifest(101);
    expect(manifest.passengers[0]?.seatNumber).toBe('1A');
  });
});

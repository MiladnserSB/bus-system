import { describe, expect, it } from 'vitest';
import { ApiError, createApiClient } from '../src/shared/api/clientCore';
import { createServices, type ApiStorageAdapter } from '../src/shared/api/servicesCore';
import {
  AuthUser,
  BookingDto,
  BookingSeatDto,
  SeatDto,
  TicketDto,
} from '../src/shared/types/api.types';

/**
 * Stateful Contract Simulator matching bus-system-backend `/api/v1` behavior:
 * - OTP auth + JWT/refresh issuance
 * - Cities & Trips search (including suggestedDates)
 * - Redis temporary seat hold (5 min TTL) + 409 conflict checks
 * - Atomic Booking confirmation with Idempotency-Key + QR Ticket generation
 * - Upcoming bookings, Passenger info update, Partial/Full Cancel & Immediate seat release
 */
function createStatefulBackendFetch() {
  const cities = [
    { id: 1, nameAr: 'دمشق', nameEn: 'Damascus', isActive: true },
    { id: 2, nameAr: 'حلب', nameEn: 'Aleppo', isActive: true },
  ];

  const farDepartAt = new Date(Date.now() + 24 * 3600_000).toISOString();
  const nearDepartAt = new Date(Date.now() + 90 * 60_000).toISOString(); // < 3 hours cancellation cutoff

  const seatTemplates: SeatDto[] = [
    { seatNumber: '1A', rowNumber: 1, colLetter: 'A', side: 'LEFT', colIndex: 0, isExtra: false, status: 'AVAILABLE' },
    { seatNumber: '1B', rowNumber: 1, colLetter: 'B', side: 'LEFT', colIndex: 1, isExtra: false, status: 'AVAILABLE' },
    { seatNumber: '1C', rowNumber: 1, colLetter: 'C', side: 'RIGHT', colIndex: 2, isExtra: false, status: 'AVAILABLE' },
    { seatNumber: '11E', rowNumber: 11, colLetter: 'E', side: 'MIDDLE', colIndex: 2, isExtra: true, status: 'AVAILABLE' },
  ];

  const holds = new Map<string, { tripId: number; holder: string; seats: string[]; expiresAt: string }>();
  const bookings = new Map<string, BookingDto>();
  const idempotencyMap = new Map<string, BookingDto>();
  let sequence = 1;

  const res = (status: number, body: unknown): Response =>
    ({
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => 'application/json' } as unknown as Headers,
      text: async () => JSON.stringify(body),
      json: async () => body,
    }) as unknown as Response;

  const getActiveBookedSeats = (tripId: number): Set<string> => {
    const booked = new Set<string>();
    for (const b of bookings.values()) {
      if (b.tripId !== tripId) continue;
      for (const s of b.seats) {
        if (s.isActive) booked.add(s.seatNumber);
      }
    }
    return booked;
  };

  const buildTicket = (b: BookingDto): TicketDto => ({
    bookingCode: b.code,
    status: b.status,
    route: {
      originAr: b.trip.origin.nameAr,
      originEn: b.trip.origin.nameEn,
      destinationAr: b.trip.destination.nameAr,
      destinationEn: b.trip.destination.nameEn,
      label: `${b.trip.origin.nameAr} ← ${b.trip.destination.nameAr}`,
    },
    departAt: b.trip.departAt,
    departDateDamascus: '2026-12-01',
    departTimeDamascus: '08:00',
    departDateArabic: '1 كانون الأول 2026',
    busType: { nameAr: 'عادية 2+2 كبير', category: 'STANDARD', size: 'LARGE', layout: '2+2' },
    busPlateNumber: 'دمشق-1020',
    seats: b.seats.map((s) => ({
      seatNumber: s.seatNumber,
      passengerName: s.passengerName,
      passengerPhone: s.passengerPhone,
      unitPrice: s.unitPrice,
      status: s.status,
      isActive: s.isActive,
    })),
    totalPrice: b.totalPrice,
    paymentMethod: b.paymentMethod,
    paymentMethodLabel: 'نقداً عند الصعود',
    earlyArrivalNotice: 'يرجى الحضور قبل موعد الانطلاق بـ 30 دقيقة',
    qrPayload: {
      code: b.code,
      tripId: b.tripId,
      seats: b.seats.filter((s) => s.isActive).map((s) => s.seatNumber),
      issuedAt: b.createdAt,
      signature: 'hmac-sig-ok',
    },
    qrCodeDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  });

  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const path = url.replace(/^https?:\/\/[^/]+\/api\/v1/, '');
    const method = init?.method ?? 'GET';
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    const authHolder = headers.Authorization ? 'user:1' : `guest:${headers['x-guest-session'] ?? 'anon'}`;

    if (path === '/auth/otp/request' && method === 'POST') {
      return res(200, { sent: true, expiresInSeconds: 300, resendAfterSeconds: 60, message: 'sent' });
    }
    if (path === '/auth/otp/verify' && method === 'POST') {
      return res(200, {
        accessToken: 'token-cust-1',
        refreshToken: 'refresh-cust-1',
        expiresInSeconds: 900,
        user: { id: 1, name: 'وسيم المحمد', phone: '+963944123456', role: 'CUSTOMER' },
      });
    }
    if (path === '/auth/logout' && method === 'POST') {
      return res(200, { loggedOut: true });
    }
    if (path === '/devices' && method === 'POST') {
      return res(201, { registered: true });
    }
    if (path.startsWith('/devices/') && method === 'DELETE') {
      return res(200, { deactivated: true });
    }
    if (path === '/cities' && method === 'GET') {
      return res(200, cities);
    }
    if (path.startsWith('/trips?')) {
      const hasResults = !path.includes('date=2099-01-01');
      return res(200, {
        items: hasResults
          ? [
              {
                id: 101,
                templateId: 1,
                origin: cities[0],
                destination: cities[1],
                busType: { id: 1, nameAr: 'عادية 2+2 كبير', category: 'STANDARD', size: 'LARGE', layout: '2+2', totalSeats: 45 },
                bus: { id: 1, plateNumber: 'دمشق-1020' },
                departAt: farDepartAt,
                departDateDamascus: '2026-12-01',
                departTimeDamascus: '08:00',
                departDateArabic: '1 كانون الأول 2026',
                price: 45000,
                status: 'OPEN',
                totalSeats: 45,
                bookedSeatsCount: 0,
                availableSeatsCount: 45,
                cancelReason: null,
                cancelledAt: null,
              },
            ]
          : [],
        suggestedDates: hasResults ? [] : ['2026-12-01', '2026-12-02'],
        meta: { page: 1, limit: 20, total: hasResults ? 1 : 0, totalPages: 1 },
      });
    }

    const seatMapMatch = /^\/trips\/(\d+)\/seats$/.exec(path);
    if (seatMapMatch && method === 'GET') {
      const tripId = Number(seatMapMatch[1]);
      const booked = getActiveBookedSeats(tripId);
      const seats: SeatDto[] = seatTemplates.map((tpl) => {
        if (booked.has(tpl.seatNumber)) return { ...tpl, status: 'BOOKED' };
        for (const h of holds.values()) {
          if (h.tripId === tripId && h.seats.includes(tpl.seatNumber)) {
            return {
              ...tpl,
              status: h.holder === authHolder ? 'HELD_BY_ME' : 'HELD',
              holdExpiresAt: h.expiresAt,
            };
          }
        }
        return { ...tpl, status: 'AVAILABLE' };
      });
      return res(200, {
        tripId,
        status: 'OPEN',
        price: 45000,
        busType: { id: 1, nameAr: 'عادية 2+2 كبير', category: 'STANDARD', size: 'LARGE', layout: '2+2', rowsCount: 11, hasExtraBackSeat: true, totalSeats: 45 },
        seats,
      });
    }

    const holdMatch = /^\/trips\/(\d+)\/holds$/.exec(path);
    if (holdMatch && method === 'POST') {
      const tripId = Number(holdMatch[1]);
      const seatNumbers = (body.seatNumbers as string[]) ?? [];
      const booked = getActiveBookedSeats(tripId);
      for (const s of seatNumbers) {
        if (booked.has(s)) {
          return res(409, { code: 'SEAT_ALREADY_BOOKED', message: 'booked' });
        }
        for (const h of holds.values()) {
          if (h.tripId === tripId && h.seats.includes(s) && h.holder !== authHolder) {
            return res(409, { code: 'SEAT_HELD_BY_ANOTHER', message: 'held' });
          }
        }
      }
      const holdId = `hold-${sequence++}`;
      const expiresAt = new Date(Date.now() + 300_000).toISOString();
      holds.set(holdId, { tripId, holder: authHolder, seats: seatNumbers, expiresAt });
      return res(201, { holdId, tripId, seatNumbers, ttlSeconds: 300, expiresAt });
    }

    if (path === '/bookings' && method === 'POST') {
      const idempotencyKey = headers['Idempotency-Key'];
      if (idempotencyKey && idempotencyMap.has(idempotencyKey)) {
        const existing = idempotencyMap.get(idempotencyKey)!;
        return res(201, { booking: existing, ticket: buildTicket(existing), idempotentReplay: true });
      }
      const tripId = Number(body.tripId);
      const paxList = body.passengers as { seatNumber: string; passengerName: string; passengerPhone: string }[];
      const booked = getActiveBookedSeats(tripId);
      for (const p of paxList) {
        if (booked.has(p.seatNumber)) {
          return res(409, { code: 'SEAT_ALREADY_BOOKED', message: 'seat conflict' });
        }
      }
      const departAt = tripId === 202 ? nearDepartAt : farDepartAt;
      const code = `BK-20261201-000${sequence++}`;
      const seats: BookingSeatDto[] = paxList.map((p, idx) => ({
        id: idx + 1,
        seatNumber: p.seatNumber,
        passengerName: p.passengerName,
        passengerPhone: p.passengerPhone,
        unitPrice: 45000,
        status: 'CONFIRMED',
        isActive: true,
        cancelledAt: null,
        cancelReason: null,
      }));
      const booking: BookingDto = {
        id: sequence,
        code,
        tripId,
        userId: 1,
        channel: 'MOBILE_APP',
        contactName: seats[0].passengerName,
        contactPhone: seats[0].passengerPhone,
        unitPrice: 45000,
        totalPrice: 45000 * seats.length,
        paymentMethod: 'CASH_ON_BOARDING',
        status: 'CONFIRMED',
        cancelReason: null,
        cancelledAt: null,
        createdAt: new Date().toISOString(),
        trip: {
          id: tripId,
          status: 'OPEN',
          departAt,
          departDateDamascus: '2026-12-01',
          departTimeDamascus: '08:00',
          departDateArabic: '1 كانون الأول 2026',
          origin: cities[0],
          destination: cities[1],
          busType: { id: 1, nameAr: 'عادية 2+2 كبير', category: 'STANDARD', layout: '2+2' },
          bus: { id: 1, plateNumber: 'دمشق-1020' },
        },
        seats,
      };
      if (body.holdId) holds.delete(String(body.holdId));
      bookings.set(code, booking);
      if (idempotencyKey) idempotencyMap.set(idempotencyKey, booking);
      return res(201, { booking, ticket: buildTicket(booking), idempotentReplay: false });
    }

    if (path.startsWith('/me/bookings') && method === 'GET') {
      const list = Array.from(bookings.values());
      if (path.includes('tab=cancelled')) {
        return res(200, list.filter((b) => b.status === 'CANCELLED'));
      }
      if (path.includes('tab=upcoming')) {
        return res(200, list.filter((b) => b.status !== 'CANCELLED'));
      }
      return res(200, list);
    }

    const ticketMatch = /^\/bookings\/([^/]+)\/ticket$/.exec(path);
    if (ticketMatch && method === 'GET') {
      const b = bookings.get(decodeURIComponent(ticketMatch[1]));
      return b ? res(200, buildTicket(b)) : res(404, { code: 'NOT_FOUND' });
    }

    const updatePaxMatch = /^\/bookings\/([^/]+)\/passengers$/.exec(path);
    if (updatePaxMatch && method === 'PATCH') {
      const b = bookings.get(decodeURIComponent(updatePaxMatch[1]))!;
      const updates = body.passengers as { seatNumber: string; passengerName?: string; passengerPhone?: string }[];
      for (const upd of updates) {
        const seat = b.seats.find((s) => s.seatNumber === upd.seatNumber);
        if (seat) {
          if (upd.passengerName) seat.passengerName = upd.passengerName;
          if (upd.passengerPhone) seat.passengerPhone = upd.passengerPhone;
        }
      }
      return res(200, b);
    }

    const cancelSeatMatch = /^\/bookings\/([^/]+)\/seats\/([^/]+)\/cancel$/.exec(path);
    if (cancelSeatMatch && method === 'POST') {
      const b = bookings.get(decodeURIComponent(cancelSeatMatch[1]))!;
      const targetSeat = b.seats.find((s) => s.seatNumber === cancelSeatMatch[2])!;
      targetSeat.isActive = false;
      targetSeat.status = 'CANCELLED';
      const remainingActive = b.seats.filter((s) => s.isActive);
      b.status = remainingActive.length > 0 ? 'PARTIAL_CANCELLED' : 'CANCELLED';
      b.totalPrice = remainingActive.length * 45000;
      return res(200, b);
    }

    const cancelBookingMatch = /^\/bookings\/([^/]+)\/cancel$/.exec(path);
    if (cancelBookingMatch && method === 'POST') {
      const b = bookings.get(decodeURIComponent(cancelBookingMatch[1]))!;
      const hoursLeft = (new Date(b.trip.departAt).getTime() - Date.now()) / 3600_000;
      if (hoursLeft < 3) {
        return res(400, { code: 'CANCELLATION_DEADLINE_PASSED', message: 'deadline passed' });
      }
      b.status = 'CANCELLED';
      for (const s of b.seats) {
        s.isActive = false;
        s.status = 'CANCELLED';
      }
      return res(200, b);
    }

    return res(404, { code: 'NOT_FOUND' });
  };
}

describe('E2E Customer Booking & Lifecycle Workflow', () => {
  it('completes full journey: OTP Auth -> Search -> Seat Hold -> Idempotent Booking -> Ticket & Passenger Edit -> Partial & Full Cancel -> Seat Release -> Logout', async () => {
    const state: {
      accessToken: string | null;
      refreshToken: string | null;
      savedUser: AuthUser | null;
    } = {
      accessToken: null,
      refreshToken: null,
      savedUser: null,
    };
    const guestTokens = new Map<string, string>();
    const storage: ApiStorageAdapter = {
      saveAuthSession: async (p) => {
        state.accessToken = p.accessToken;
        state.refreshToken = p.refreshToken;
        state.savedUser = p.user;
      },
      saveUser: async (u) => {
        state.savedUser = u;
      },
      getRefreshToken: async () => state.refreshToken,
      getFcmToken: async () => 'fcm-device-1',
      clearAuthSession: async () => {
        state.accessToken = null;
        state.refreshToken = null;
        state.savedUser = null;
      },
      getOrCreateGuestSessionId: async () => 'sess-e2e',
      saveGuestBookingRef: async (code, token) => {
        guestTokens.set(code, token);
      },
      getGuestTokenForBooking: async (code) => guestTokens.get(code) ?? null,
    };

    const backendFetch = createStatefulBackendFetch();
    const client = createApiClient({
      baseUrl: 'http://localhost:3000/api/v1',
      fetchFn: backendFetch as unknown as typeof fetch,
      getAccessToken: async () => state.accessToken,
      getRefreshToken: storage.getRefreshToken,
      onAuthFailure: storage.clearAuthSession,
    });
    const api = createServices(client, storage);

    // 1. Auth OTP Flow + FCM device registration
    const otpReq = await api.authApi.requestOtp('+963944123456');
    expect(otpReq.sent).toBe(true);
    const verified = await api.authApi.verifyOtp({
      phone: '+963944123456',
      code: '123456',
      consentAccepted: true,
    });
    expect(verified.user.name).toBe('وسيم المحمد');
    expect(state.savedUser?.phone).toBe('+963944123456');
    await api.devicesApi.registerDevice('fcm-device-1', 'ANDROID');

    // 2. Search Cities & Trips (plus suggestedDates on empty date)
    const cities = await api.catalogApi.getCities();
    expect(cities.map((c) => c.nameAr)).toEqual(['دمشق', 'حلب']);

    const emptyDay = await api.tripsApi.searchTrips({
      originId: 1,
      destinationId: 2,
      date: '2099-01-01',
    });
    expect(emptyDay.items).toHaveLength(0);
    expect(emptyDay.suggestedDates).toEqual(['2026-12-01', '2026-12-02']);

    const trips = await api.tripsApi.searchTrips({
      originId: 1,
      destinationId: 2,
      date: '2026-12-01',
    });
    const tripId = trips.items[0].id;

    // 3. Seat Map & Redis Hold + Conflict check by another user
    const initialMap = await api.tripsApi.getSeatMap(tripId);
    expect(initialMap.seats.find((s) => s.seatNumber === '11E')?.isExtra).toBe(true);

    const hold = await api.holdsApi.createHold(tripId, ['1A', '1B']);
    expect(hold.seatNumbers).toEqual(['1A', '1B']);

    // Simulate competing user trying to hold '1A' -> 409 SEAT_HELD_BY_ANOTHER
    const guestClient = createApiClient({
      baseUrl: 'http://localhost:3000/api/v1',
      fetchFn: backendFetch as unknown as typeof fetch,
      getAccessToken: async () => null,
    });
    const guestApi = createServices(guestClient, {
      ...storage,
      getOrCreateGuestSessionId: async () => 'other-user-sess',
    });
    await expect(guestApi.holdsApi.createHold(tripId, ['1A'])).rejects.toSatisfy(
      (err: unknown) => err instanceof ApiError && err.code === 'SEAT_HELD_BY_ANOTHER',
    );

    // 4. Confirm Booking with Idempotency-Key & Replay protection
    const idemKey = 'idem-e2e-001';
    const created = await api.bookingsApi.createBooking(
      {
        tripId,
        holdId: hold.holdId,
        passengers: [
          { seatNumber: '1A', passengerName: 'وسيم المحمد', passengerPhone: '+963944123456' },
          { seatNumber: '1B', passengerName: 'طارق العلي', passengerPhone: '+963955111222' },
        ],
        paymentMethod: 'CASH_ON_BOARDING',
      },
      idemKey,
    );
    expect(created.idempotentReplay).toBe(false);
    expect(created.ticket.qrCodeDataUrl).toContain('data:image/png;base64,');

    const replay = await api.bookingsApi.createBooking(
      {
        tripId,
        holdId: hold.holdId,
        passengers: [
          { seatNumber: '1A', passengerName: 'وسيم المحمد', passengerPhone: '+963944123456' },
          { seatNumber: '1B', passengerName: 'طارق العلي', passengerPhone: '+963955111222' },
        ],
      },
      idemKey,
    );
    expect(replay.idempotentReplay).toBe(true);
    expect(replay.booking.code).toBe(created.booking.code);

    // 5. My Bookings Upcoming + Ticket Fetch + Passenger Update
    const upcoming = await api.bookingsApi.getMyBookings('upcoming');
    expect(upcoming.some((b) => b.code === created.booking.code)).toBe(true);

    await api.bookingsApi.updatePassengers(created.booking.code, [
      { seatNumber: '1B', passengerName: 'طارق أحمد العلي', passengerPhone: '+963955999000' },
    ]);
    const updatedTicket = await api.ticketsApi.getTicket(created.booking.code);
    expect(updatedTicket.seats.find((s) => s.seatNumber === '1B')?.passengerName).toBe(
      'طارق أحمد العلي',
    );

    // 6. Partial Seat Cancel -> '1B' becomes AVAILABLE immediately while '1A' stays BOOKED
    const afterPartial = await api.bookingsApi.cancelSeat(created.booking.code, '1B');
    expect(afterPartial.status).toBe('PARTIAL_CANCELLED');
    const mapAfterPartial = await api.tripsApi.getSeatMap(tripId);
    expect(mapAfterPartial.seats.find((s) => s.seatNumber === '1B')?.status).toBe('AVAILABLE');
    expect(mapAfterPartial.seats.find((s) => s.seatNumber === '1A')?.status).toBe('BOOKED');

    // 7. Full Booking Cancel -> '1A' becomes AVAILABLE & moves to cancelled tab
    const afterCancel = await api.bookingsApi.cancelBooking(created.booking.code);
    expect(afterCancel.status).toBe('CANCELLED');
    const mapAfterCancel = await api.tripsApi.getSeatMap(tripId);
    expect(mapAfterCancel.seats.find((s) => s.seatNumber === '1A')?.status).toBe('AVAILABLE');

    const cancelledList = await api.bookingsApi.getMyBookings('cancelled');
    expect(cancelledList.some((b) => b.code === created.booking.code)).toBe(true);

    // 8. Policy enforcement: Booking departing within 3 hours rejects cancel with CANCELLATION_DEADLINE_PASSED
    const nearBooking = await api.bookingsApi.createBooking(
      {
        tripId: 202,
        passengers: [{ seatNumber: '1C', passengerName: 'أنس', passengerPhone: '+963944123456' }],
      },
      'idem-near-001',
    );
    await expect(api.bookingsApi.cancelBooking(nearBooking.booking.code)).rejects.toSatisfy(
      (err: unknown) => err instanceof ApiError && err.code === 'CANCELLATION_DEADLINE_PASSED',
    );

    // 9. Logout clears tokens cleanly
    await api.authApi.logout();
    expect(state.accessToken).toBeNull();
  });
});

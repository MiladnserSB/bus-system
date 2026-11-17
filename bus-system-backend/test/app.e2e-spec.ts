import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SchedulerService } from '../src/modules/scheduler/scheduler.service.js';
import { createTestHarness, TestHarness } from './helpers/test-harness.js';

describe('Bus System Backend (E2E)', () => {
  let harness: TestHarness;
  let adminToken: string;
  let receptionistToken: string;
  let customerToken: string;
  let receptionistId: number;
  let originId: number;
  let destinationId: number;
  let businessMediumTypeId: number;
  let standardLargeTypeId: number;

  beforeAll(async () => {
    harness = await createTestHarness({ pgPort: 5443, redisPort: 6391 });
  });

  afterAll(async () => {
    if (harness) {
      await harness.cleanup();
    }
  });

  it('GET /api/v1/health and Swagger OpenAPI spec are reachable', async () => {
    const http = harness.app.getHttpServer();

    const health = await request(http).get('/api/v1/health').expect(200);
    expect(health.body).toMatchObject({
      status: 'ok',
      postgres: 'up',
      redis: 'up',
    });

    const docs = await request(http).get('/api/docs-json').expect(200);
    expect(docs.body.openapi).toBeDefined();
    expect(docs.body.paths['/api/v1/bookings']).toBeDefined();
  });

  it('handles Admin login, forced password change on Receptionist, lockout after 5 fails, and Customer OTP flow', async () => {
    const http = harness.app.getHttpServer();

    const adminLogin = await request(http)
      .post('/api/v1/auth/login')
      .send({ identifier: 'admin', password: 'Admin@123456' })
      .expect(200);
    adminToken = adminLogin.body.accessToken;
    expect(adminLogin.body.user.role).toBe('ADMIN');

    // Create Receptionist with temporary password
    const recRes = await request(http)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'سارة موظفة الاستقبال',
        username: 'sara.rec',
        email: 'sara@masar-bus.sy',
        phone: '0944100200',
        password: 'TempPass@123',
        role: 'RECEPTIONIST',
      })
      .expect(201);
    receptionistId = recRes.body.id;
    expect(recRes.body.mustChangePassword).toBe(true);

    // Receptionist logs in -> blocked until changing password
    const recLogin = await request(http)
      .post('/api/v1/auth/login')
      .send({ identifier: 'sara.rec', password: 'TempPass@123' })
      .expect(200);
    const tempRecToken = recLogin.body.accessToken;

    const blockedRes = await request(http)
      .get('/api/v1/bookings')
      .set('Authorization', `Bearer ${tempRecToken}`)
      .expect(403);
    expect(blockedRes.body.code).toBe('PASSWORD_CHANGE_REQUIRED');

    // Receptionist changes password -> gets fresh active token
    const changed = await request(http)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${tempRecToken}`)
      .send({ currentPassword: 'TempPass@123', newPassword: 'SaraNew@12345' })
      .expect(200);
    receptionistToken = changed.body.accessToken;
    expect(changed.body.user.mustChangePassword).toBe(false);

    // Lockout test: separate staff user fails 5 times
    await request(http)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'مستخدم قفل',
        username: 'lock.user',
        phone: '0944100299',
        password: 'Correct@1234',
        role: 'RECEPTIONIST',
      })
      .expect(201);

    for (let i = 0; i < 4; i += 1) {
      await request(http)
        .post('/api/v1/auth/login')
        .send({ identifier: 'lock.user', password: 'WrongPassword' })
        .expect(401);
    }
    const locked = await request(http)
      .post('/api/v1/auth/login')
      .send({ identifier: 'lock.user', password: 'WrongPassword' })
      .expect(429);
    expect(locked.body.code).toBe('ACCOUNT_LOCKED');

    // Customer OTP flow
    await request(http)
      .post('/api/v1/auth/otp/request')
      .send({ phone: '0944555111' })
      .expect(200);

    // Resend within 60s returns 429 OTP_COOLDOWN
    const cooldown = await request(http)
      .post('/api/v1/auth/otp/request')
      .send({ phone: '0944555111' })
      .expect(429);
    expect(cooldown.body.code).toBe('OTP_COOLDOWN');

    // Directly set deterministic OTP hash in Redis to verify full HTTP /auth/otp/verify flow
    const { AuthService } = await import('../src/modules/auth/auth.service.js');
    const authService = harness.app.get(AuthService);
    const knownHash = authService.hashOtp('+963944555111', '246810');
    await harness.redis.set(
      'otp:code:+963944555111',
      JSON.stringify({ hash: knownHash, attempts: 0 }),
      'EX',
      300,
    );

    const otpVerify = await request(http)
      .post('/api/v1/auth/otp/verify')
      .send({
        phone: '0944555111',
        code: '246810',
        name: 'خالد المسافر',
        consentAccepted: true,
      })
      .expect(200);
    customerToken = otpVerify.body.accessToken;
    expect(otpVerify.body.user.role).toBe('CUSTOMER');

    // Register FCM device for customer
    await request(http)
      .post('/api/v1/devices')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ fcmToken: 'fcm-cust-token-1', platform: 'ANDROID' })
      .expect(201);
  });

  it('enforces strict RBAC across Customer, Receptionist, and Admin (REQ-AUTH-10, 5.5)', async () => {
    const http = harness.app.getHttpServer();

    // Customer forbidden from staff/admin endpoints
    await request(http)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);
    await request(http)
      .get('/api/v1/settings')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);
    await request(http)
      .get('/api/v1/reports/dashboard')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);
    await request(http)
      .get('/api/v1/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);

    // Receptionist forbidden from prices/trips/templates/settings/reports/audit-logs/users (BR-6, 6.6)
    await request(http)
      .get('/api/v1/settings')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .expect(403);
    await request(http)
      .get('/api/v1/reports/revenue')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .expect(403);
    await request(http)
      .get('/api/v1/audit-logs')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .expect(403);
    await request(http)
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({
        originId: 1,
        destinationId: 2,
        busTypeId: 1,
        price: 45000,
        departAt: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .expect(403);
    await request(http)
      .post('/api/v1/trip-templates')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({})
      .expect(403);

    // AuditLogs are immutable from API
    await request(http)
      .delete('/api/v1/audit-logs/1')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  it('supports Cities, BusTypes layouts, Buses, Trips, and TripTemplates workflows', async () => {
    const http = harness.app.getHttpServer();

    const citiesRes = await request(http).get('/api/v1/cities').expect(200);
    originId = citiesRes.body[0].id;
    destinationId = citiesRes.body[1].id;

    const busTypesRes = await request(http).get('/api/v1/bus-types').expect(200);
    const stdLarge = busTypesRes.body.find((b: any) => b.code === 'STANDARD_LARGE');
    const bizMedium = busTypesRes.body.find((b: any) => b.code === 'BUSINESS_MEDIUM');
    standardLargeTypeId = stdLarge.id;
    businessMediumTypeId = bizMedium.id;

    const layoutRes = await request(http)
      .get(`/api/v1/bus-types/${standardLargeTypeId}/layout`)
      .expect(200);
    expect(layoutRes.body.totalSeats).toBe(45);
    expect(layoutRes.body.seats.some((s: any) => s.seatNumber === '11E' && s.isExtra)).toBe(true);

    // Create bus and verify duplicate plate rejection
    const busRes = await request(http)
      .post('/api/v1/buses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ plateNumber: 'دمشق 555001', busTypeId: standardLargeTypeId })
      .expect(201);
    expect(busRes.body.plateNumber).toBe('دمشق 555001');

    const dupBus = await request(http)
      .post('/api/v1/buses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ plateNumber: 'دمشق 555001', busTypeId: standardLargeTypeId })
      .expect(409);
    expect(dupBus.body.code).toBe('DUPLICATE_PLATE_NUMBER');

    // Create Trip & duplicate warning check
    const departAt = new Date(Date.now() + 48 * 3_600_000).toISOString();
    await request(http)
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        originId,
        destinationId,
        busTypeId: businessMediumTypeId,
        price: 60000,
        departAt,
      })
      .expect(201);

    const dupTrip = await request(http)
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        originId,
        destinationId,
        busTypeId: businessMediumTypeId,
        price: 60000,
        departAt,
      })
      .expect(409);
    expect(dupTrip.body.code).toBe('DUPLICATE_TRIP_CONFIRMATION_REQUIRED');

    // Create DAILY Trip Template starting tomorrow for 5 days
    const startDate = new Date(Date.now() + 2 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const endDate = new Date(Date.now() + 5 * 86_400_000)
      .toISOString()
      .slice(0, 10);

    const tplRes = await request(http)
      .post('/api/v1/trip-templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        originId,
        destinationId,
        busTypeId: businessMediumTypeId,
        price: 42000,
        departureTime: '08:00',
        recurrence: 'DAILY',
        startDate,
        endDate,
        exclusionDates: [endDate],
      })
      .expect(201);

    expect(tplRes.body.generatedTripsCount).toBe(3);

    // Running manual generator again produces 0 duplicates
    const regenRes = await request(http)
      .post('/api/v1/trip-templates/generate')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(regenRes.body.createdTrips).toBe(0);
  });

  it('prevents double booking under 100 concurrent requests on the exact same seat (PERF-08)', async () => {
    const http = harness.app.getHttpServer();

    const tripRes = await request(http)
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        originId,
        destinationId,
        busTypeId: standardLargeTypeId,
        price: 45000,
        departAt: new Date(Date.now() + 72 * 3_600_000).toISOString(),
      })
      .expect(201);

    const raceTripId = tripRes.body.id;

    // 100 simultaneous booking requests targeting seat 5A
    const attempts = Array.from({ length: 100 }, (_, idx) =>
      request(http)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          tripId: raceTripId,
          passengers: [
            {
              seatNumber: '5A',
              passengerName: `متنافس ${idx}`,
              passengerPhone: `09441${String(idx).padStart(5, '0')}`,
            },
          ],
        }),
    );

    const responses = await Promise.all(attempts);
    const successes = responses.filter((r) => r.status === 201);
    const conflicts = responses.filter((r) => r.status === 409);

    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(99);

    const dbActiveCount = await harness.prisma.bookingSeat.count({
      where: { tripId: raceTripId, seatNumber: '5A', isActive: true },
    });
    expect(dbActiveCount).toBe(1);
  });

  it('verifies holds, guest booking, idempotency, cancellation seat release, revenue accuracy, and scheduler idempotency', async () => {
    const http = harness.app.getHttpServer();

    const tripRes = await request(http)
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        originId,
        destinationId,
        busTypeId: businessMediumTypeId,
        price: 55000,
        departAt: new Date(Date.now() + 24 * 3_600_000).toISOString(),
      })
      .expect(201);
    const tripId = tripRes.body.id;

    // 1. Hold seat 1A as customer -> Receptionist gets 409 when trying to hold 1A
    const holdRes = await request(http)
      .post(`/api/v1/trips/${tripId}/holds`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ seatNumber: '1A' })
      .expect(201);

    await request(http)
      .post(`/api/v1/trips/${tripId}/holds`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({ seatNumber: '1A' })
      .expect(409);

    // Seat map shows HELD_BY_ME for customer and HELD for public
    const myMap = await request(http)
      .get(`/api/v1/trips/${tripId}/seats`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(myMap.body.seats.find((s: any) => s.seatNumber === '1A').status).toBe('HELD_BY_ME');

    // Release hold -> seat available again
    await request(http)
      .delete(`/api/v1/holds/${holdRes.body.holdId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    // 2. Guest booking with Idempotency-Key + partial cancellation
    const guestIdemKey = 'guest-idem-key-001';
    const guestBooking1 = await request(http)
      .post('/api/v1/bookings')
      .set('Idempotency-Key', guestIdemKey)
      .send({
        tripId,
        guestSessionId: 'mobile-guest-1',
        passengers: [
          { seatNumber: '1A', passengerName: 'ضيف أول', passengerPhone: '0944888777' },
          { seatNumber: '1B', passengerName: 'ضيف ثاني', passengerPhone: '0944888778' },
        ],
      })
      .expect(201);

    const guestBooking2 = await request(http)
      .post('/api/v1/bookings')
      .set('Idempotency-Key', guestIdemKey)
      .send({
        tripId,
        guestSessionId: 'mobile-guest-1',
        passengers: [
          { seatNumber: '1A', passengerName: 'ضيف أول', passengerPhone: '0944888777' },
          { seatNumber: '1B', passengerName: 'ضيف ثاني', passengerPhone: '0944888778' },
        ],
      })
      .expect(201);

    expect(guestBooking2.body.idempotentReplay).toBe(true);
    expect(guestBooking1.body.booking.code).toBe(guestBooking2.body.booking.code);

    const bookingCode = guestBooking1.body.booking.code;
    const guestToken = guestBooking1.body.guestAccessToken;

    // Guest fetches ticket & Admin verifies QR
    const ticketRes = await request(http)
      .get(`/api/v1/bookings/${bookingCode}/ticket`)
      .set('x-guest-token', guestToken)
      .expect(200);
    expect(ticketRes.body.bookingCode).toBe(bookingCode);

    await request(http)
      .post('/api/v1/tickets/verify')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({ qrPayload: JSON.stringify(ticketRes.body.qrPayload) })
      .expect(200);

    // Changing busType after booking must fail with 409 TRIP_BUS_TYPE_LOCKED
    await request(http)
      .patch(`/api/v1/trips/${tripId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ busTypeId: standardLargeTypeId })
      .expect(409);

    // Partial cancellation of seat 1A -> immediately becomes AVAILABLE and re-bookable!
    const partialCancel = await request(http)
      .post(`/api/v1/bookings/${bookingCode}/seats/1A/cancel`)
      .set('x-guest-token', guestToken)
      .send({ reason: 'تغيير رأي' })
      .expect(200);
    expect(partialCancel.body.totalPrice).toBe(55000);

    const mapAfterCancel = await request(http)
      .get(`/api/v1/trips/${tripId}/seats`)
      .expect(200);
    expect(
      mapAfterCancel.body.seats.find((s: any) => s.seatNumber === '1A').status,
    ).toBe('AVAILABLE');

    // Customer books released seat 1A cleanly
    await request(http)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        tripId,
        passengers: [
          { seatNumber: '1A', passengerName: 'خالد', passengerPhone: '0944555111' },
        ],
      })
      .expect(201);

    // Updating trip price leaves existing confirmed bookings untouched (REQ-TRIP-05)
    await request(http)
      .patch(`/api/v1/trips/${tripId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ price: 99000 })
      .expect(200);

    const preservedBooking = await request(http)
      .get(`/api/v1/bookings/${bookingCode}`)
      .set('x-guest-token', guestToken)
      .expect(200);
    expect(preservedBooking.body.unitPrice).toBe(55000);

    // Revenue report includes confirmed non-cancelled active seats only (REQ-RPT-09)
    const revBeforeCancel = await request(http)
      .get('/api/v1/reports/revenue')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    // 1 seat from 100-concurrency test (45,000) + 1 remaining seat from guest booking (55,000) + 1 rebooked seat 1A (55,000) = 155,000
    expect(revBeforeCancel.body.totalRevenue).toBe(155000);

    // Trip cancellation cancels remaining confirmed bookings & sends fallback SMS notification
    await request(http)
      .post(`/api/v1/trips/${tripId}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'إلغاء تجريبي' })
      .expect(200);

    const revAfterTripCancel = await request(http)
      .get('/api/v1/reports/revenue')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(revAfterTripCancel.body.totalRevenue).toBe(45000);

    const smsNotifications = await harness.prisma.notification.count({
      where: { tripId, type: 'TRIP_CANCELLED', channel: 'SMS' },
    });
    expect(smsNotifications).toBeGreaterThanOrEqual(1);

    // Scheduler non-duplication check (REQ-AUTO-07)
    const scheduler = harness.app.get(SchedulerService);
    const fixedDate = new Date('2026-11-18T02:00:00.000+03:00');
    const firstJob = await scheduler.generateDailyTrips(fixedDate);
    const secondJob = await scheduler.generateDailyTrips(fixedDate);
    expect(firstJob.executed).toBe(true);
    expect(secondJob.executed).toBe(false);
    expect(secondJob.reason).toBe('ALREADY_EXECUTED');

    // Disabling Receptionist terminates existing JWT immediately (REQ-AUTH-12)
    await request(http)
      .patch(`/api/v1/users/${receptionistId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })
      .expect(200);

    const revoked = await request(http)
      .get('/api/v1/bookings')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .expect(401);
    expect(revoked.body.code).toBe('ACCOUNT_DISABLED');
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Prisma } from '../src/generated/prisma/client.js';
import {
  BookingChannel,
  BookingStatus,
  PaymentMethod,
  RecurrenceType,
  TripStatus,
} from '../src/generated/prisma/enums.js';
import { RedisService } from '../src/redis/redis.service.js';
import { createTestHarness, TestHarness } from './helpers/test-harness.js';

describe('PostgreSQL + Redis Integration Tests', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness({ pgPort: 5442, redisPort: 6390 });
  });

  afterAll(async () => {
    if (harness) {
      await harness.cleanup();
    }
  });

  it('verifies seeded bus types (45/37/33/27/22/18), cities, settings, and admin user', async () => {
    const busTypes = await harness.prisma.busType.findMany({
      include: { _count: { select: { seatTemplates: true } } },
      orderBy: { totalSeats: 'desc' },
    });

    expect(busTypes).toHaveLength(6);
    expect(busTypes.map((b) => b.totalSeats)).toEqual([45, 37, 33, 27, 22, 18]);
    for (const bt of busTypes) {
      expect(bt._count.seatTemplates).toBe(bt.totalSeats);
    }

    const citiesCount = await harness.prisma.city.count();
    expect(citiesCount).toBe(8);

    const settingsCount = await harness.prisma.setting.count();
    expect(settingsCount).toBe(7);

    const admin = await harness.prisma.user.findUnique({
      where: { username: 'admin' },
    });
    expect(admin?.role).toBe('ADMIN');
  });

  it('enforces PostgreSQL partial unique index UNIQUE(trip_id, seat_number) WHERE is_active (REQ-BOOK-06)', async () => {
    const [damascus, aleppo] = await harness.prisma.city.findMany({
      take: 2,
      orderBy: { id: 'asc' },
    });
    const busType = await harness.prisma.busType.findFirstOrThrow({
      where: { code: 'BUSINESS_MEDIUM' },
    });

    const trip = await harness.prisma.trip.create({
      data: {
        originId: damascus.id,
        destinationId: aleppo.id,
        busTypeId: busType.id,
        departAt: new Date(Date.now() + 24 * 3_600_000),
        price: 50000,
        status: TripStatus.OPEN,
      },
    });

    const b1 = await harness.prisma.booking.create({
      data: {
        code: 'BK-20261117-9001',
        tripId: trip.id,
        channel: BookingChannel.ADMIN_WEB,
        unitPrice: 50000,
        totalPrice: 50000,
        paymentMethod: PaymentMethod.CASH_OFFICE,
        status: BookingStatus.CONFIRMED,
        seats: {
          create: {
            tripId: trip.id,
            seatNumber: '1A',
            passengerName: 'راكب أول',
            passengerPhone: '+963944111111',
            unitPrice: 50000,
            isActive: true,
          },
        },
      },
    });

    await expect(
      harness.prisma.bookingSeat.create({
        data: {
          bookingId: b1.id,
          tripId: trip.id,
          seatNumber: '1A',
          passengerName: 'راكب مكرر',
          passengerPhone: '+963944222222',
          unitPrice: 50000,
          isActive: true,
        },
      }),
    ).rejects.toThrowError(Prisma.PrismaClientKnownRequestError);

    // Soft-cancel existing seat -> partial index MUST now allow re-booking 1A
    await harness.prisma.bookingSeat.updateMany({
      where: { bookingId: b1.id, seatNumber: '1A' },
      data: { isActive: false, status: BookingStatus.CANCELLED },
    });

    const b2 = await harness.prisma.booking.create({
      data: {
        code: 'BK-20261117-9002',
        tripId: trip.id,
        channel: BookingChannel.MOBILE,
        unitPrice: 50000,
        totalPrice: 50000,
        paymentMethod: PaymentMethod.CASH_ON_BOARDING,
        status: BookingStatus.CONFIRMED,
        seats: {
          create: {
            tripId: trip.id,
            seatNumber: '1A',
            passengerName: 'راكب جديد',
            passengerPhone: '+963944333333',
            unitPrice: 50000,
            isActive: true,
          },
        },
      },
    });
    expect(b2.id).toBeGreaterThan(0);
  });

  it('enforces UNIQUE(template_id, depart_at) with ON CONFLICT DO NOTHING (REQ-SCHD-06) and CHECK constraints', async () => {
    const [origin, dest] = await harness.prisma.city.findMany({
      take: 2,
      orderBy: { id: 'asc' },
    });
    const busType = await harness.prisma.busType.findFirstOrThrow();

    await expect(
      harness.prisma.trip.create({
        data: {
          originId: origin.id,
          destinationId: origin.id,
          busTypeId: busType.id,
          departAt: new Date(Date.now() + 86_400_000),
          price: 10000,
        },
      }),
    ).rejects.toThrow();

    const tpl = await harness.prisma.tripTemplate.create({
      data: {
        originId: origin.id,
        destinationId: dest.id,
        busTypeId: busType.id,
        price: 30000,
        departureTime: '09:00',
        recurrence: RecurrenceType.DAILY,
        startDate: new Date('2026-12-01T00:00:00.000Z'),
      },
    });

    const departAt = new Date('2026-12-01T06:00:00.000Z');
    const first = await harness.prisma.trip.createMany({
      data: [
        {
          templateId: tpl.id,
          originId: origin.id,
          destinationId: dest.id,
          busTypeId: busType.id,
          departAt,
          price: 30000,
        },
      ],
      skipDuplicates: true,
    });
    const second = await harness.prisma.trip.createMany({
      data: [
        {
          templateId: tpl.id,
          originId: origin.id,
          destinationId: dest.id,
          busTypeId: busType.id,
          departAt,
          price: 30000,
        },
      ],
      skipDuplicates: true,
    });

    expect(first.count).toBe(1);
    expect(second.count).toBe(0);
  });

  it('acquires, isolates, and Lua-releases Redis seat locks atomically', async () => {
    const redisService = harness.app.get(RedisService);
    const payloadA = {
      holdId: 'hold-a',
      holderKey: 'user:1',
      tripId: 99,
      seatNumber: '3A',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    const payloadB = { ...payloadA, holdId: 'hold-b', holderKey: 'user:2' };

    expect(await redisService.acquireSeatLock(99, '3A', payloadA, 60)).toBe(true);
    expect(await redisService.acquireSeatLock(99, '3A', payloadB, 60)).toBe(false);

    // Wrong holder cannot release
    expect(
      await redisService.releaseSeatLockIfOwned(99, '3A', 'hold-b', 'user:2'),
    ).toBe(-1);

    // Correct holder releases cleanly
    expect(
      await redisService.releaseSeatLockIfOwned(99, '3A', 'hold-a', 'user:1'),
    ).toBe(1);

    expect(await redisService.getSeatLock(99, '3A')).toBeNull();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role, TripStatus } from '../../generated/prisma/enums.js';
import { ErrorCodes } from '../../common/constants/error-codes.js';
import { HoldsService } from './holds.service.js';

describe('HoldsService', () => {
  let service: HoldsService;
  let prisma: any;
  let redis: any;
  let settingsService: any;

  const futureDepartAt = new Date(Date.now() + 4 * 3_600_000);

  beforeEach(() => {
    prisma = {
      trip: {
        findUnique: vi.fn().mockResolvedValue({
          id: 1,
          status: TripStatus.OPEN,
          departAt: futureDepartAt,
          busType: {
            seatTemplates: [
              { seatNumber: '1A' },
              { seatNumber: '1B' },
              { seatNumber: '1C' },
            ],
          },
        }),
      },
      bookingSeat: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    redis = {
      client: { set: vi.fn().mockResolvedValue('OK') },
      seatLockKey: (tripId: number, seat: string) => `lock:trip:${tripId}:seat:${seat}`,
      getSeatLocksForTrip: vi.fn().mockResolvedValue(new Map()),
      acquireSeatLock: vi.fn().mockResolvedValue(true),
      getSeatLock: vi.fn().mockResolvedValue(null),
      releaseSeatLockIfOwned: vi.fn().mockResolvedValue(1),
      saveHoldGroup: vi.fn().mockResolvedValue(undefined),
      getHoldGroup: vi.fn(),
      deleteHoldGroup: vi.fn().mockResolvedValue(undefined),
    };

    settingsService = {
      getPolicy: vi.fn().mockResolvedValue({
        cancellationDeadlineHours: 3,
        bookingCutoffMinutes: 60,
        maxSeatsPerBooking: 6,
        seatHoldTtlMinutes: 5,
        templateGenerateAheadDays: 30,
        tripAutoCompleteHours: 12,
        reminderHoursBefore: [24, 3],
      }),
    };

    service = new HoldsService(prisma, redis, settingsService);
  });

  const customerUser = {
    id: 7,
    name: 'Customer',
    username: null,
    email: null,
    phone: '+963944123456',
    role: Role.CUSTOMER,
    mustChangePassword: false,
    tokenVersion: 0,
  };

  it('acquires Redis locks with configured TTL and returns hold metadata', async () => {
    const hold = await service.createHold(
      1,
      { seatNumbers: ['1A', '1B'] },
      customerUser,
    );

    expect(hold.seatNumbers).toEqual(['1A', '1B']);
    expect(hold.ttlSeconds).toBe(300);
    expect(redis.acquireSeatLock).toHaveBeenCalledTimes(2);
    expect(redis.saveHoldGroup).toHaveBeenCalled();
  });

  it('rolls back acquired seat locks if a subsequent seat in batch is held by another user', async () => {
    redis.acquireSeatLock
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    redis.getSeatLock.mockResolvedValueOnce({
      holdId: 'other-hold',
      holderKey: 'user:99',
    });

    await expect(
      service.createHold(1, { seatNumbers: ['1A', '1B'] }, customerUser),
    ).rejects.toMatchObject({ code: ErrorCodes.SEAT_HELD_BY_ANOTHER });

    expect(redis.releaseSeatLockIfOwned).toHaveBeenCalledWith(
      1,
      '1A',
      expect.any(String),
      'user:7',
    );
  });

  it('rejects hold creation after booking cutoff time (4.6.2)', async () => {
    prisma.trip.findUnique.mockResolvedValueOnce({
      id: 1,
      status: TripStatus.OPEN,
      departAt: new Date(Date.now() + 30 * 60_000),
      busType: { seatTemplates: [{ seatNumber: '1A' }] },
    });

    await expect(
      service.createHold(1, { seatNumber: '1A' }, customerUser),
    ).rejects.toMatchObject({ code: ErrorCodes.TRIP_BOOKING_CLOSED });
  });

  it('prevents releasing another user hold and releases own hold cleanly', async () => {
    redis.getHoldGroup.mockResolvedValueOnce({
      holdId: 'h1',
      holderKey: 'user:99',
      tripId: 1,
      seatNumbers: ['1A'],
    });

    await expect(service.releaseHold('h1', customerUser)).rejects.toMatchObject({
      code: ErrorCodes.HOLD_FORBIDDEN,
    });

    redis.getHoldGroup.mockResolvedValueOnce({
      holdId: 'h1',
      holderKey: 'user:7',
      tripId: 1,
      seatNumbers: ['1A'],
    });

    const released = await service.releaseHold('h1', customerUser);
    expect(released.released).toBe(true);
    expect(redis.deleteHoldGroup).toHaveBeenCalledWith('h1');
  });
});

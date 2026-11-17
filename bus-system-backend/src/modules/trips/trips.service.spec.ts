import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingStatus, Role, TripStatus } from '../../generated/prisma/enums.js';
import { ErrorCodes } from '../../common/constants/error-codes.js';
import { TripsService } from './trips.service.js';

describe('TripsService', () => {
  let service: TripsService;
  let prisma: any;
  let redis: any;
  let auditLogsService: any;
  let notificationsService: any;
  let settingsService: any;

  beforeEach(() => {
    prisma = {
      city: { findUnique: vi.fn().mockResolvedValue({ id: 1, nameAr: 'دمشق', isActive: true }) },
      busType: { findUnique: vi.fn().mockResolvedValue({ id: 1, nameAr: 'عادية', isActive: true, totalSeats: 45 }) },
      bus: { findUnique: vi.fn() },
      trip: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn(),
        update: vi.fn(),
      },
      booking: {
        findMany: vi.fn().mockResolvedValue([{ id: 10 }, { id: 11 }]),
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      bookingSeat: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => cb(prisma)),
    };

    redis = {
      getSeatLocksForTrip: vi.fn().mockResolvedValue(new Map()),
      forceReleaseSeatLocks: vi.fn().mockResolvedValue(undefined),
    };
    auditLogsService = { log: vi.fn().mockResolvedValue(undefined) };
    notificationsService = {
      notifyTripCancelledOrRescheduled: vi
        .fn()
        .mockResolvedValue({ notifiedBookings: 2, smsFallbacks: 1 }),
    };
    settingsService = {
      getPolicy: vi.fn().mockResolvedValue({ bookingCutoffMinutes: 60 }),
    };

    service = new TripsService(
      prisma,
      redis,
      auditLogsService,
      notificationsService,
      settingsService,
    );
  });

  it('rejects trip creation when origin == destination or departAt is in the past (REQ-TRIP-02)', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    await expect(
      service.create(
        { originId: 1, destinationId: 1, busTypeId: 1, price: 45000, departAt: future },
        1,
      ),
    ).rejects.toMatchObject({ code: ErrorCodes.INVALID_TRIP_ROUTE });

    const past = new Date(Date.now() - 86_400_000).toISOString();
    await expect(
      service.create(
        { originId: 1, destinationId: 2, busTypeId: 1, price: 45000, departAt: past },
        1,
      ),
    ).rejects.toMatchObject({ code: ErrorCodes.TRIP_DATE_IN_PAST });
  });

  it('warns on duplicate route+type+departAt unless confirmDuplicate=true (REQ-TRIP-03)', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    prisma.trip.findFirst.mockResolvedValueOnce({ id: 99 });

    await expect(
      service.create(
        { originId: 1, destinationId: 2, busTypeId: 1, price: 45000, departAt: future },
        1,
      ),
    ).rejects.toMatchObject({ code: ErrorCodes.DUPLICATE_TRIP_CONFIRMATION_REQUIRED });
  });

  it('prevents changing busTypeId once active bookings exist (REQ-TRIP-04)', async () => {
    prisma.trip.findUnique.mockResolvedValueOnce({
      id: 1,
      originId: 1,
      destinationId: 2,
      busTypeId: 1,
      departAt: new Date(Date.now() + 86_400_000),
      price: 45000,
      status: TripStatus.OPEN,
      busType: { id: 1 },
    });
    prisma.bookingSeat.count.mockResolvedValueOnce(3);

    await expect(
      service.update(1, { busTypeId: 2 }, 1),
    ).rejects.toMatchObject({ code: ErrorCodes.TRIP_BUS_TYPE_LOCKED });
  });

  it('cancels trip, cancels all active bookings/seats, releases Redis locks, and notifies passengers (REQ-TRIP-06)', async () => {
    prisma.trip.findUnique.mockResolvedValueOnce({
      id: 1,
      status: TripStatus.OPEN,
      busType: { seatTemplates: [{ seatNumber: '1A' }, { seatNumber: '1B' }] },
    });
    prisma.trip.update.mockResolvedValueOnce({
      id: 1,
      templateId: null,
      originId: 1,
      destinationId: 2,
      busTypeId: 1,
      busId: null,
      departAt: new Date(Date.now() + 86_400_000),
      price: 45000,
      status: TripStatus.CANCELLED,
      cancelReason: 'طقس',
      cancelledAt: new Date(),
      origin: { id: 1, nameAr: 'دمشق', nameEn: 'Damascus' },
      destination: { id: 2, nameAr: 'حلب', nameEn: 'Aleppo' },
      busType: { id: 1, code: 'STD', nameAr: 'عادية', category: 'STANDARD', size: 'LARGE', layout: '2+2', totalSeats: 45 },
      bus: null,
    });

    const result = await service.cancel(1, { reason: 'طقس' }, 1);
    expect(result.status).toBe(TripStatus.CANCELLED);
    expect(prisma.booking.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tripId: 1, status: BookingStatus.CONFIRMED },
      }),
    );
    expect(redis.forceReleaseSeatLocks).toHaveBeenCalledWith(1, ['1A', '1B']);
    expect(notificationsService.notifyTripCancelledOrRescheduled).toHaveBeenCalled();
  });

  it('masks passenger phones when viewer lacks staff privileges (SEC-08)', async () => {
    prisma.trip.findUnique.mockResolvedValueOnce({
      id: 1,
      templateId: null,
      originId: 1,
      destinationId: 2,
      busTypeId: 1,
      busId: null,
      departAt: new Date(Date.now() + 86_400_000),
      price: 45000,
      status: TripStatus.OPEN,
      cancelReason: null,
      cancelledAt: null,
      origin: { id: 1, nameAr: 'دمشق', nameEn: 'Damascus' },
      destination: { id: 2, nameAr: 'حلب', nameEn: 'Aleppo' },
      busType: { id: 1, code: 'STD', nameAr: 'عادية', category: 'STANDARD', size: 'LARGE', layout: '2+2', totalSeats: 45 },
      bus: null,
      bookingSeats: [
        {
          seatNumber: '1A',
          passengerName: 'محمد',
          passengerPhone: '+963944123456',
          status: BookingStatus.CONFIRMED,
          booking: { code: 'BK-1', paymentMethod: 'CASH_OFFICE', channel: 'ADMIN_WEB' },
        },
      ],
    });

    const staffManifest = await service.getManifest(1, Role.RECEPTIONIST);
    expect(staffManifest.passengers[0].passengerPhone).toBe('+963944123456');
  });
});

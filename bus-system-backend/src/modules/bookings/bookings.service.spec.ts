import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BookingChannel,
  BookingStatus,
  PaymentMethod,
  Role,
  TripStatus,
} from '../../generated/prisma/enums.js';
import { ErrorCodes } from '../../common/constants/error-codes.js';
import { BookingsService } from './bookings.service.js';

describe('BookingsService', () => {
  let service: BookingsService;
  let prisma: any;
  let redis: any;
  let settingsService: any;
  let auditLogsService: any;
  let notificationsService: any;
  let ticketsService: any;

  const futureDepartAt = new Date(Date.now() + 6 * 3_600_000);
  const sampleTrip = {
    id: 1,
    status: TripStatus.OPEN,
    departAt: futureDepartAt,
    price: 45000,
    busTypeId: 1,
    origin: { id: 1, nameAr: 'دمشق', nameEn: 'Damascus' },
    destination: { id: 2, nameAr: 'حلب', nameEn: 'Aleppo' },
    busType: {
      id: 1,
      nameAr: 'عادية 2+2 كبير',
      category: 'STANDARD',
      layout: '2+2',
      totalSeats: 45,
      seatTemplates: [{ seatNumber: '1A' }, { seatNumber: '1B' }],
    },
    bus: null,
  };

  beforeEach(() => {
    prisma = {
      $queryRaw: vi.fn(),
      $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => cb(prisma)),
      booking: {
        findUnique: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      bookingSeat: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(1),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      busType: {
        findUnique: vi.fn().mockResolvedValue(sampleTrip.busType),
      },
      trip: {
        update: vi.fn(),
      },
    };

    redis = {
      getSeatLocksForTrip: vi.fn().mockResolvedValue(new Map()),
      forceReleaseSeatLocks: vi.fn().mockResolvedValue(undefined),
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

    auditLogsService = { log: vi.fn().mockResolvedValue(undefined) };
    notificationsService = {
      notifyBookingConfirmed: vi.fn().mockResolvedValue(undefined),
    };
    ticketsService = {
      buildTicket: vi.fn().mockResolvedValue({ bookingCode: 'BK-20261117-0001' }),
      signGuestAccessToken: vi.fn().mockReturnValue('guest-signed-token'),
      assertCanAccessBooking: vi.fn(),
    };

    service = new BookingsService(
      prisma,
      redis,
      settingsService,
      auditLogsService,
      notificationsService,
      ticketsService,
    );
  });

  const customerUser = {
    id: 10,
    name: 'أحمد',
    username: null,
    email: null,
    phone: '+963944123456',
    role: Role.CUSTOMER,
    mustChangePassword: false,
    tokenVersion: 0,
  };

  it('replays existing booking idempotently when Idempotency-Key matches (REQ-BOOK-10)', async () => {
    prisma.booking.findUnique.mockResolvedValueOnce({
      id: 1,
      code: 'BK-20261117-0001',
      tripId: 1,
      userId: 10,
      channel: BookingChannel.MOBILE,
      contactName: 'أحمد',
      contactPhone: '+963944123456',
      unitPrice: 45000,
      totalPrice: 45000,
      paymentMethod: PaymentMethod.CASH_ON_BOARDING,
      status: BookingStatus.CONFIRMED,
      cancelReason: null,
      cancelledAt: null,
      createdAt: new Date(),
      trip: sampleTrip,
      seats: [
        {
          id: 1,
          seatNumber: '1A',
          passengerName: 'أحمد',
          passengerPhone: '+963944123456',
          unitPrice: 45000,
          status: BookingStatus.CONFIRMED,
          isActive: true,
          cancelledAt: null,
          cancelReason: null,
        },
      ],
    });

    const result = await service.create(
      {
        tripId: 1,
        passengers: [
          { seatNumber: '1A', passengerName: 'أحمد', passengerPhone: '0944123456' },
        ],
      },
      customerUser,
      'idem-123',
    );

    expect(result.idempotentReplay).toBe(true);
    expect(result.booking.code).toBe('BK-20261117-0001');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('creates booking in transaction, copies price, formats BK code, and releases Redis locks', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([
        {
          id: 1,
          status: TripStatus.OPEN,
          depart_at: futureDepartAt,
          price: 45000,
          bus_type_id: 1,
        },
      ])
      .mockResolvedValueOnce([{ seq: 7 }]);

    prisma.booking.create.mockResolvedValueOnce({
      id: 7,
      code: 'BK-20261117-0007',
      tripId: 1,
      userId: 10,
      channel: BookingChannel.MOBILE,
      contactName: 'أحمد',
      contactPhone: '+963944123456',
      unitPrice: 45000,
      totalPrice: 90000,
      paymentMethod: PaymentMethod.CASH_ON_BOARDING,
      status: BookingStatus.CONFIRMED,
      cancelReason: null,
      cancelledAt: null,
      createdAt: new Date(),
      trip: sampleTrip,
      seats: [
        {
          id: 1,
          seatNumber: '1A',
          passengerName: 'أحمد',
          passengerPhone: '+963944123456',
          unitPrice: 45000,
          status: BookingStatus.CONFIRMED,
          isActive: true,
          cancelledAt: null,
          cancelReason: null,
        },
        {
          id: 2,
          seatNumber: '1B',
          passengerName: 'سعيد',
          passengerPhone: '+963944123457',
          unitPrice: 45000,
          status: BookingStatus.CONFIRMED,
          isActive: true,
          cancelledAt: null,
          cancelReason: null,
        },
      ],
    });

    const res = await service.create(
      {
        tripId: 1,
        holdId: 'hold-1',
        passengers: [
          { seatNumber: '1A', passengerName: 'أحمد', passengerPhone: '0944123456' },
          { seatNumber: '1B', passengerName: 'سعيد', passengerPhone: '0944123457' },
        ],
      },
      customerUser,
    );

    expect(res.booking.totalPrice).toBe(90000);
    expect(redis.forceReleaseSeatLocks).toHaveBeenCalledWith(1, ['1A', '1B']);
    expect(redis.deleteHoldGroup).toHaveBeenCalledWith('hold-1');
    expect(auditLogsService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'BOOKING_CREATE' }),
      prisma,
    );
  });

  it('blocks customer/receptionist cancellation outside deadline while allowing ADMIN override (REQ-CANC-02, REQ-CANC-03)', async () => {
    const soonDepartAt = new Date(Date.now() + 60 * 60_000); // 1h < 3h deadline
    const bookingRecord = {
      id: 1,
      code: 'BK-20261117-0001',
      tripId: 1,
      userId: 10,
      status: BookingStatus.CONFIRMED,
      trip: { ...sampleTrip, departAt: soonDepartAt, status: TripStatus.FULL },
      seats: [
        { id: 1, seatNumber: '1A', isActive: true, status: BookingStatus.CONFIRMED },
      ],
    };

    prisma.booking.findUnique.mockResolvedValueOnce(bookingRecord);
    await expect(
      service.cancelBooking('BK-20261117-0001', {}, customerUser),
    ).rejects.toMatchObject({ code: ErrorCodes.CANCELLATION_DEADLINE_PASSED });

    const adminUser = { ...customerUser, id: 1, role: Role.ADMIN };
    prisma.booking.findUnique.mockResolvedValueOnce(bookingRecord);
    prisma.booking.update.mockResolvedValueOnce({ id: 1 });
    prisma.bookingSeat.count.mockResolvedValueOnce(0);
    prisma.booking.findUniqueOrThrow.mockResolvedValueOnce({
      ...bookingRecord,
      status: BookingStatus.CANCELLED,
      channel: BookingChannel.MOBILE,
      contactName: 'أحمد',
      contactPhone: '+963944123456',
      unitPrice: 45000,
      totalPrice: 45000,
      paymentMethod: PaymentMethod.CASH_ON_BOARDING,
      cancelReason: 'طارئ',
      cancelledAt: new Date(),
      createdAt: new Date(),
      seats: [
        {
          id: 1,
          seatNumber: '1A',
          passengerName: 'أحمد',
          passengerPhone: '+963944123456',
          unitPrice: 45000,
          status: BookingStatus.CANCELLED,
          isActive: false,
          cancelledAt: new Date(),
          cancelReason: 'طارئ',
        },
      ],
    });

    const cancelled = await service.cancelBooking(
      'BK-20261117-0001',
      { reason: 'طارئ' },
      adminUser,
    );
    expect(cancelled.status).toBe(BookingStatus.CANCELLED);
    expect(prisma.trip.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: TripStatus.OPEN },
    });
  });

  it('supports single-seat partial cancellation and recalculates booking totalPrice (REQ-CANC-07)', async () => {
    const bookingRecord = {
      id: 2,
      code: 'BK-20261117-0002',
      tripId: 1,
      userId: 10,
      status: BookingStatus.CONFIRMED,
      trip: { ...sampleTrip, departAt: futureDepartAt, status: TripStatus.OPEN },
      seats: [
        { id: 1, seatNumber: '1A', isActive: true, status: BookingStatus.CONFIRMED, unitPrice: 45000 },
        { id: 2, seatNumber: '1B', isActive: true, status: BookingStatus.CONFIRMED, unitPrice: 45000 },
      ],
    };

    prisma.booking.findUnique.mockResolvedValueOnce(bookingRecord);
    prisma.bookingSeat.findMany.mockResolvedValueOnce([
      { id: 2, seatNumber: '1B', isActive: true, unitPrice: 45000 },
    ]);
    prisma.booking.findUniqueOrThrow.mockResolvedValueOnce({
      ...bookingRecord,
      channel: BookingChannel.MOBILE,
      contactName: 'أحمد',
      contactPhone: '+963944123456',
      unitPrice: 45000,
      totalPrice: 45000,
      paymentMethod: PaymentMethod.CASH_ON_BOARDING,
      cancelReason: null,
      cancelledAt: null,
      createdAt: new Date(),
      seats: [
        {
          id: 1,
          seatNumber: '1A',
          passengerName: 'أحمد',
          passengerPhone: '+963944123456',
          unitPrice: 45000,
          status: BookingStatus.CANCELLED,
          isActive: false,
          cancelledAt: new Date(),
          cancelReason: null,
        },
        {
          id: 2,
          seatNumber: '1B',
          passengerName: 'سعيد',
          passengerPhone: '+963944123457',
          unitPrice: 45000,
          status: BookingStatus.CONFIRMED,
          isActive: true,
          cancelledAt: null,
          cancelReason: null,
        },
      ],
    });

    const updated = await service.cancelSeat(
      'BK-20261117-0002',
      '1A',
      {},
      customerUser,
    );

    expect(updated.totalPrice).toBe(45000);
    expect(updated.status).toBe(BookingStatus.CONFIRMED);
    expect(prisma.booking.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { totalPrice: 45000 },
    });
  });

  describe('BookingsService additional branches', () => {
    it('throws CONFLICT when Idempotency-Key belongs to a different trip', async () => {
      prisma.booking.findUnique.mockResolvedValueOnce({
        id: 1,
        code: 'BK-20261117-0001',
        tripId: 999,
        userId: 10,
        channel: BookingChannel.MOBILE,
        contactName: 'أحمد',
        contactPhone: '+963944123456',
        unitPrice: 45000,
        totalPrice: 45000,
        paymentMethod: PaymentMethod.CASH_ON_BOARDING,
        status: BookingStatus.CONFIRMED,
        cancelReason: null,
        cancelledAt: null,
        createdAt: new Date(),
        trip: sampleTrip,
        seats: [],
      });

      await expect(
        service.create(
          {
            tripId: 1,
            passengers: [
              { seatNumber: '1A', passengerName: 'أحمد', passengerPhone: '0944123456' },
            ],
          },
          customerUser,
          'idem-diff',
        ),
      ).rejects.toMatchObject({ code: ErrorCodes.IDEMPOTENCY_CONFLICT });
    });

    it('rejects booking when seat is held in Redis by another user or exceeds max seats', async () => {
      redis.getSeatLocksForTrip.mockResolvedValueOnce(
        new Map([['1A', { holderKey: 'user:99', holdId: 'other' }]]),
      );

      await expect(
        service.create(
          {
            tripId: 1,
            passengers: [
              { seatNumber: '1A', passengerName: 'أحمد', passengerPhone: '0944123456' },
            ],
          },
          customerUser,
        ),
      ).rejects.toMatchObject({ code: ErrorCodes.SEAT_HELD_BY_ANOTHER });

      await expect(
        service.create(
          {
            tripId: 1,
            passengers: ['1A', '1B', '2A', '2B', '3A', '3B', '4A'].map((seat) => ({
              seatNumber: seat,
              passengerName: 'أحمد',
              passengerPhone: '0944123456',
            })),
          },
          customerUser,
        ),
      ).rejects.toMatchObject({ code: ErrorCodes.MAX_SEATS_EXCEEDED });
    });

    it('lists bookings, my bookings tabs, single booking, and updates passenger info with audit log', async () => {
      const fullBooking = {
        id: 1,
        code: 'BK-20261117-0001',
        tripId: 1,
        userId: 10,
        channel: BookingChannel.MOBILE,
        contactName: 'أحمد',
        contactPhone: '+963944123456',
        unitPrice: 45000,
        totalPrice: 45000,
        paymentMethod: PaymentMethod.CASH_ON_BOARDING,
        status: BookingStatus.CONFIRMED,
        cancelReason: null,
        cancelledAt: null,
        createdAt: new Date(),
        trip: sampleTrip,
        seats: [
          {
            id: 1,
            seatNumber: '1A',
            passengerName: 'أحمد',
            passengerPhone: '+963944123456',
            unitPrice: 45000,
            status: BookingStatus.CONFIRMED,
            isActive: true,
            cancelledAt: null,
            cancelReason: null,
          },
        ],
      };

      prisma.booking.findMany.mockResolvedValue([fullBooking]);
      prisma.booking.count.mockResolvedValue(1);
      prisma.booking.findUnique.mockResolvedValue(fullBooking);
      prisma.booking.findUniqueOrThrow.mockResolvedValue(fullBooking);

      const listed = await service.findAll({
        code: 'BK',
        phone: '0944',
        date: '2026-11-17',
      });
      expect(listed.items).toHaveLength(1);

      const mine = await service.findMyBookings(10, { tab: 'upcoming' });
      expect(mine).toHaveLength(1);

      const one = await service.findOneByCode('BK-20261117-0001', customerUser);
      expect(one.code).toBe('BK-20261117-0001');

      await service.updatePassengers(
        'BK-20261117-0001',
        {
          passengers: [
            {
              seatNumber: '1A',
              passengerName: 'أحمد الجديد',
              passengerPhone: '0944999888',
            },
          ],
        },
        customerUser,
      );
      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PASSENGER_UPDATE' }),
        prisma,
      );
    });
  });
});

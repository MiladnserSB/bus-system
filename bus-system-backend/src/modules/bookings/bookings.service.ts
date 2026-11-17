import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import {
  BookingChannel,
  BookingStatus,
  PaymentMethod,
  Role,
  TripStatus,
} from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RedisService } from '../../redis/redis.service.js';
import { ErrorCodes } from '../../common/constants/error-codes.js';
import { AppException } from '../../common/exceptions/app.exception.js';
import {
  damascusDateAndTimeToUtc,
  formatBookingDateCode,
  formatDamascusArabicDate,
  formatDamascusDate,
  formatDamascusTime,
} from '../../common/helpers/damascus-time.helper.js';
import { normalizePhone } from '../../common/helpers/phone.helper.js';
import { AuthUser } from '../../common/types/auth-user.type.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { TicketsService } from '../tickets/tickets.service.js';
import {
  CancelBookingDto,
  CreateBookingDto,
  QueryBookingsDto,
  QueryMyBookingsDto,
  UpdateBookingPassengersDto,
} from './dto/booking.dto.js';

const BOOKING_DETAIL_INCLUDE = {
  trip: {
    include: {
      origin: true,
      destination: true,
      busType: true,
      bus: true,
    },
  },
  seats: {
    orderBy: { seatNumber: 'asc' as const },
  },
  createdBy: {
    select: { id: true, name: true, role: true },
  },
};

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly settingsService: SettingsService,
    private readonly auditLogsService: AuditLogsService,
    private readonly notificationsService: NotificationsService,
    private readonly ticketsService: TicketsService,
  ) {}

  async create(
    dto: CreateBookingDto,
    user?: AuthUser,
    headerIdempotencyKey?: string,
    headerGuestSession?: string,
  ) {
    const idempotencyKey =
      headerIdempotencyKey?.trim() || dto.idempotencyKey?.trim() || null;

    if (idempotencyKey) {
      const existing = await this.prisma.booking.findUnique({
        where: { idempotencyKey },
        include: BOOKING_DETAIL_INCLUDE,
      });
      if (existing) {
        if (existing.tripId !== dto.tripId) {
          throw new AppException(
            HttpStatus.CONFLICT,
            ErrorCodes.IDEMPOTENCY_CONFLICT,
            'مفتاح Idempotency-Key مستخدم مسبقاً لرحلة مختلفة',
          );
        }
        const ticket = await this.ticketsService.buildTicket(existing);
        return {
          booking: this.formatBooking(existing),
          ticket,
          idempotentReplay: true,
          ...(!user
            ? {
                guestAccessToken: this.ticketsService.signGuestAccessToken(
                  existing.code,
                ),
              }
            : {}),
        };
      }
    }

    const normalizedPassengers = dto.passengers.map((p) => ({
      seatNumber: p.seatNumber.trim().toUpperCase(),
      passengerName: p.passengerName.trim(),
      passengerPhone: normalizePhone(p.passengerPhone),
    }));

    const uniqueSeatNumbers = Array.from(
      new Set(normalizedPassengers.map((p) => p.seatNumber)),
    );
    if (uniqueSeatNumbers.length !== normalizedPassengers.length) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCodes.VALIDATION_ERROR,
        'لا يمكن تكرار رقم المقعد في نفس الحجز',
      );
    }

    const policy = await this.settingsService.getPolicy();
    if (normalizedPassengers.length > policy.maxSeatsPerBooking) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCodes.MAX_SEATS_EXCEEDED,
        `الحد الأقصى للمقاعد في الحجز الواحد هو ${policy.maxSeatsPerBooking} مقاعد`,
        { maxSeatsPerBooking: policy.maxSeatsPerBooking },
      );
    }

    const guestSession =
      dto.guestSessionId?.trim() || headerGuestSession?.trim() || null;
    const callerHolderKey = user
      ? `user:${user.id}`
      : guestSession
        ? `guest:${guestSession}`
        : null;

    // Verify Redis locks: fail fast if another user holds any requested seat
    const lockMap = await this.redis.getSeatLocksForTrip(
      dto.tripId,
      uniqueSeatNumbers,
    );
    for (const seatNo of uniqueSeatNumbers) {
      const lock = lockMap.get(seatNo);
      if (lock && (!callerHolderKey || lock.holderKey !== callerHolderKey)) {
        throw new AppException(
          HttpStatus.CONFLICT,
          ErrorCodes.SEAT_HELD_BY_ANOTHER,
          'المقعد قيد الحجز من مستخدم آخر',
          { seatNumber: seatNo },
        );
      }
    }

    const channel: BookingChannel =
      user && (user.role === Role.ADMIN || user.role === Role.RECEPTIONIST)
        ? BookingChannel.ADMIN_WEB
        : BookingChannel.MOBILE;

    const paymentMethod: PaymentMethod =
      dto.paymentMethod ??
      (channel === BookingChannel.ADMIN_WEB
        ? PaymentMethod.CASH_OFFICE
        : PaymentMethod.CASH_ON_BOARDING);

    const contactName =
      dto.contactName?.trim() ||
      user?.name ||
      normalizedPassengers[0].passengerName;
    const contactPhone = dto.contactPhone?.trim()
      ? normalizePhone(dto.contactPhone)
      : (user?.phone ?? normalizedPassengers[0].passengerPhone);

    const customerUserId =
      user && user.role === Role.CUSTOMER ? user.id : null;

    let createdBooking;
    try {
      createdBooking = await this.prisma.$transaction(async (tx) => {
        const lockedTrips = await tx.$queryRaw<
          Array<{
            id: number;
            status: TripStatus;
            depart_at: Date;
            price: Prisma.Decimal;
            bus_type_id: number;
          }>
        >`SELECT id, status, depart_at, price, bus_type_id FROM trips WHERE id = ${dto.tripId} FOR UPDATE`;

        const lockedTrip = lockedTrips[0];
        if (!lockedTrip) {
          throw new AppException(
            HttpStatus.NOT_FOUND,
            ErrorCodes.NOT_FOUND,
            'الرحلة غير موجودة',
          );
        }

        const now = new Date();
        const cutoffAt = new Date(
          lockedTrip.depart_at.getTime() -
            policy.bookingCutoffMinutes * 60_000,
        );

        if (
          lockedTrip.status === TripStatus.CANCELLED ||
          lockedTrip.status === TripStatus.DEPARTED ||
          lockedTrip.status === TripStatus.COMPLETED ||
          lockedTrip.status === TripStatus.SCHEDULED
        ) {
          throw new AppException(
            HttpStatus.CONFLICT,
            ErrorCodes.TRIP_NOT_BOOKABLE,
            'الرحلة غير متاحة للحجز حالياً',
          );
        }

        if (lockedTrip.status === TripStatus.CLOSED || now >= cutoffAt) {
          throw new AppException(
            HttpStatus.CONFLICT,
            ErrorCodes.TRIP_BOOKING_CLOSED,
            'انتهى وقت الحجز لهذه الرحلة',
          );
        }

        if (lockedTrip.status === TripStatus.FULL) {
          throw new AppException(
            HttpStatus.CONFLICT,
            ErrorCodes.SEAT_ALREADY_BOOKED,
            'هذا المقعد تم حجزه، اختر مقعداً آخر',
          );
        }

        const busType = await tx.busType.findUnique({
          where: { id: lockedTrip.bus_type_id },
          include: { seatTemplates: { select: { seatNumber: true } } },
        });
        const validSeats = new Set(
          busType?.seatTemplates.map((s) => s.seatNumber) ?? [],
        );

        for (const seatNo of uniqueSeatNumbers) {
          if (!validSeats.has(seatNo)) {
            throw new AppException(
              HttpStatus.NOT_FOUND,
              ErrorCodes.SEAT_NOT_FOUND,
              `المقعد ${seatNo} غير موجود في هذا الباص`,
              { seatNumber: seatNo },
            );
          }
        }

        const takenSeats = await tx.bookingSeat.findMany({
          where: {
            tripId: dto.tripId,
            seatNumber: { in: uniqueSeatNumbers },
            isActive: true,
          },
          select: { seatNumber: true },
        });

        if (takenSeats.length > 0) {
          throw new AppException(
            HttpStatus.CONFLICT,
            ErrorCodes.SEAT_ALREADY_BOOKED,
            'هذا المقعد تم حجزه للتو، اختر مقعداً آخر',
            { seats: takenSeats.map((s) => s.seatNumber) },
          );
        }

        const seqRows = await tx.$queryRaw<Array<{ seq: number }>>`
          SELECT nextval(pg_get_serial_sequence('bookings', 'id'))::int AS seq
        `;
        const seq = seqRows[0].seq;
        const datePart = formatBookingDateCode(now);
        const code = `BK-${datePart}-${String(seq).padStart(4, '0')}`;

        const unitPrice = Number(lockedTrip.price);
        const totalPrice = unitPrice * normalizedPassengers.length;

        const saved = await tx.booking.create({
          data: {
            id: seq,
            code,
            tripId: dto.tripId,
            userId: customerUserId,
            createdById: user?.id ?? null,
            channel,
            contactName,
            contactPhone,
            unitPrice,
            totalPrice,
            paymentMethod,
            status: BookingStatus.CONFIRMED,
            idempotencyKey,
            seats: {
              create: normalizedPassengers.map((p) => ({
                tripId: dto.tripId,
                seatNumber: p.seatNumber,
                passengerName: p.passengerName,
                passengerPhone: p.passengerPhone,
                unitPrice,
                status: BookingStatus.CONFIRMED,
                isActive: true,
              })),
            },
          },
          include: BOOKING_DETAIL_INCLUDE,
        });

        const totalActiveSeats = await tx.bookingSeat.count({
          where: { tripId: dto.tripId, isActive: true },
        });
        if (busType && totalActiveSeats >= busType.totalSeats) {
          await tx.trip.update({
            where: { id: dto.tripId },
            data: { status: TripStatus.FULL },
          });
        }

        await this.auditLogsService.log(
          {
            userId: user?.id ?? null,
            action: 'BOOKING_CREATE',
            entity: 'Booking',
            entityId: saved.code,
            details: {
              tripId: dto.tripId,
              seats: uniqueSeatNumbers,
              channel,
              totalPrice,
            },
          },
          tx,
        );

        return saved;
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        if (idempotencyKey) {
          const replay = await this.prisma.booking.findUnique({
            where: { idempotencyKey },
            include: BOOKING_DETAIL_INCLUDE,
          });
          if (replay) {
            const ticket = await this.ticketsService.buildTicket(replay);
            return {
              booking: this.formatBooking(replay),
              ticket,
              idempotentReplay: true,
              ...(!user
                ? {
                    guestAccessToken: this.ticketsService.signGuestAccessToken(
                      replay.code,
                    ),
                  }
                : {}),
            };
          }
        }
        throw new AppException(
          HttpStatus.CONFLICT,
          ErrorCodes.SEAT_ALREADY_BOOKED,
          'هذا المقعد تم حجزه للتو، اختر مقعداً آخر',
        );
      }
      throw err;
    }

    await this.redis.forceReleaseSeatLocks(dto.tripId, uniqueSeatNumbers);
    if (dto.holdId) {
      await this.redis.deleteHoldGroup(dto.holdId);
    }

    try {
      await this.notificationsService.notifyBookingConfirmed(createdBooking.id);
    } catch (err) {
      this.logger.warn(
        `Confirmation notification skipped for booking ${createdBooking.code}: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }

    const ticket = await this.ticketsService.buildTicket(createdBooking);
    return {
      booking: this.formatBooking(createdBooking),
      ticket,
      idempotentReplay: false,
      ...(!user
        ? {
            guestAccessToken: this.ticketsService.signGuestAccessToken(
              createdBooking.code,
            ),
          }
        : {}),
    };
  }

  async findAll(query: QueryBookingsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.BookingWhereInput = {};
    if (query.code?.trim()) {
      where.code = { contains: query.code.trim().toUpperCase(), mode: 'insensitive' };
    }
    if (query.tripId !== undefined) {
      where.tripId = query.tripId;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.phone?.trim()) {
      const clean = query.phone.trim();
      where.OR = [
        { contactPhone: { contains: clean } },
        { seats: { some: { passengerPhone: { contains: clean } } } },
      ];
    }
    if (query.date) {
      const startUtc = damascusDateAndTimeToUtc(query.date, '00:00');
      const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000 - 1);
      where.createdAt = { gte: startUtc, lte: endUtc };
    }

    const [items, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        include: BOOKING_DETAIL_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.booking.count({ where }),
    ]);

    return {
      items: items.map((b) => this.formatBooking(b)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findMyBookings(userId: number, query: QueryMyBookingsDto) {
    const now = new Date();
    const where: Prisma.BookingWhereInput = { userId };

    if (query.tab === 'upcoming') {
      where.status = BookingStatus.CONFIRMED;
      where.trip = { departAt: { gte: now } };
    } else if (query.tab === 'past') {
      where.status = BookingStatus.CONFIRMED;
      where.trip = { departAt: { lt: now } };
    } else if (query.tab === 'cancelled') {
      where.status = BookingStatus.CANCELLED;
    }

    const items = await this.prisma.booking.findMany({
      where,
      include: BOOKING_DETAIL_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    return items.map((b) => this.formatBooking(b));
  }

  async findOneByCode(code: string, user?: AuthUser, guestToken?: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { code: code.trim().toUpperCase() },
      include: BOOKING_DETAIL_INCLUDE,
    });
    if (!booking) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        'الحجز غير موجود',
      );
    }

    this.ticketsService.assertCanAccessBooking(
      booking.code,
      booking.userId,
      user,
      guestToken,
    );

    return this.formatBooking(booking);
  }

  async cancelBooking(
    code: string,
    dto: CancelBookingDto,
    user?: AuthUser,
    guestToken?: string,
  ) {
    const booking = await this.prisma.booking.findUnique({
      where: { code: code.trim().toUpperCase() },
      include: {
        trip: { include: { busType: true } },
        seats: true,
      },
    });
    if (!booking) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        'الحجز غير موجود',
      );
    }

    this.ticketsService.assertCanAccessBooking(
      booking.code,
      booking.userId,
      user,
      guestToken,
    );

    if (booking.status === BookingStatus.CANCELLED) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCodes.BOOKING_ALREADY_CANCELLED,
        'الحجز ملغى مسبقاً',
      );
    }

    const policy = await this.settingsService.getPolicy();
    const now = new Date();
    const deadlineAt = new Date(
      booking.trip.departAt.getTime() -
        policy.cancellationDeadlineHours * 3_600_000,
    );
    const outsideDeadline = now > deadlineAt;
    const isAdmin = user?.role === Role.ADMIN;

    if (outsideDeadline && !isAdmin) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCodes.CANCELLATION_DEADLINE_PASSED,
        `انتهت مهلة الإلغاء المسموحة قبل الانطلاق بـ ${policy.cancellationDeadlineHours} ساعات`,
        {
          deadlineAt: deadlineAt.toISOString(),
          cancellationDeadlineHours: policy.cancellationDeadlineHours,
        },
      );
    }

    const reason = dto.reason?.trim() || null;

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM trips WHERE id = ${booking.tripId} FOR UPDATE`;

      const saved = await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: BookingStatus.CANCELLED,
          cancelledById: user?.id ?? null,
          cancelledAt: now,
          cancelReason: reason,
        },
        include: BOOKING_DETAIL_INCLUDE,
      });

      await tx.bookingSeat.updateMany({
        where: { bookingId: booking.id, isActive: true },
        data: {
          isActive: false,
          status: BookingStatus.CANCELLED,
          cancelledById: user?.id ?? null,
          cancelledAt: now,
          cancelReason: reason,
        },
      });

      if (
        booking.trip.status === TripStatus.FULL &&
        booking.trip.departAt > now
      ) {
        const activeCount = await tx.bookingSeat.count({
          where: { tripId: booking.tripId, isActive: true },
        });
        if (activeCount < booking.trip.busType.totalSeats) {
          await tx.trip.update({
            where: { id: booking.tripId },
            data: { status: TripStatus.OPEN },
          });
        }
      }

      await this.auditLogsService.log(
        {
          userId: user?.id ?? null,
          action: 'BOOKING_CANCEL',
          entity: 'Booking',
          entityId: booking.code,
          details: {
            reason,
            adminOverrideOutsideDeadline: outsideDeadline && isAdmin,
          },
        },
        tx,
      );

      return tx.booking.findUniqueOrThrow({
        where: { id: saved.id },
        include: BOOKING_DETAIL_INCLUDE,
      });
    });

    return this.formatBooking(updated);
  }

  async cancelSeat(
    code: string,
    seatNumberRaw: string,
    dto: CancelBookingDto,
    user?: AuthUser,
    guestToken?: string,
  ) {
    const seatNumber = seatNumberRaw.trim().toUpperCase();
    const booking = await this.prisma.booking.findUnique({
      where: { code: code.trim().toUpperCase() },
      include: {
        trip: { include: { busType: true } },
        seats: true,
      },
    });
    if (!booking) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        'الحجز غير موجود',
      );
    }

    this.ticketsService.assertCanAccessBooking(
      booking.code,
      booking.userId,
      user,
      guestToken,
    );

    const targetSeat = booking.seats.find((s) => s.seatNumber === seatNumber);
    if (!targetSeat) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ErrorCodes.SEAT_NOT_FOUND,
        `المقعد ${seatNumber} غير موجود في هذا الحجز`,
      );
    }

    if (!targetSeat.isActive || targetSeat.status === BookingStatus.CANCELLED) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCodes.SEAT_ALREADY_CANCELLED,
        'تم إلغاء هذا المقعد مسبقاً',
      );
    }

    const policy = await this.settingsService.getPolicy();
    const now = new Date();
    const deadlineAt = new Date(
      booking.trip.departAt.getTime() -
        policy.cancellationDeadlineHours * 3_600_000,
    );
    const outsideDeadline = now > deadlineAt;
    const isAdmin = user?.role === Role.ADMIN;

    if (outsideDeadline && !isAdmin) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCodes.CANCELLATION_DEADLINE_PASSED,
        `انتهت مهلة الإلغاء المسموحة قبل الانطلاق بـ ${policy.cancellationDeadlineHours} ساعات`,
      );
    }

    const reason = dto.reason?.trim() || null;

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM trips WHERE id = ${booking.tripId} FOR UPDATE`;

      await tx.bookingSeat.update({
        where: { id: targetSeat.id },
        data: {
          isActive: false,
          status: BookingStatus.CANCELLED,
          cancelledById: user?.id ?? null,
          cancelledAt: now,
          cancelReason: reason,
        },
      });

      const remainingSeats = await tx.bookingSeat.findMany({
        where: { bookingId: booking.id, isActive: true },
      });

      const nextTotalPrice = remainingSeats.reduce(
        (sum, s) => sum + Number(s.unitPrice),
        0,
      );

      await tx.booking.update({
        where: { id: booking.id },
        data: {
          totalPrice: nextTotalPrice,
          ...(remainingSeats.length === 0
            ? {
                status: BookingStatus.CANCELLED,
                cancelledById: user?.id ?? null,
                cancelledAt: now,
                cancelReason: reason,
              }
            : {}),
        },
      });

      if (
        booking.trip.status === TripStatus.FULL &&
        booking.trip.departAt > now
      ) {
        const activeCount = await tx.bookingSeat.count({
          where: { tripId: booking.tripId, isActive: true },
        });
        if (activeCount < booking.trip.busType.totalSeats) {
          await tx.trip.update({
            where: { id: booking.tripId },
            data: { status: TripStatus.OPEN },
          });
        }
      }

      await this.auditLogsService.log(
        {
          userId: user?.id ?? null,
          action: 'BOOKING_SEAT_CANCEL',
          entity: 'Booking',
          entityId: booking.code,
          details: {
            seatNumber,
            reason,
            remainingActiveSeats: remainingSeats.length,
            adminOverrideOutsideDeadline: outsideDeadline && isAdmin,
          },
        },
        tx,
      );

      return tx.booking.findUniqueOrThrow({
        where: { id: booking.id },
        include: BOOKING_DETAIL_INCLUDE,
      });
    });

    return this.formatBooking(updated);
  }

  async updatePassengers(
    code: string,
    dto: UpdateBookingPassengersDto,
    user: AuthUser,
  ) {
    const booking = await this.prisma.booking.findUnique({
      where: { code: code.trim().toUpperCase() },
      include: { seats: true },
    });
    if (!booking) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        'الحجز غير موجود',
      );
    }

    this.ticketsService.assertCanAccessBooking(
      booking.code,
      booking.userId,
      user,
    );

    if (booking.status === BookingStatus.CANCELLED) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCodes.BOOKING_ALREADY_CANCELLED,
        'لا يمكن تعديل بيانات راكب لحجز ملغى',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const changes: Array<Record<string, unknown>> = [];

      for (const item of dto.passengers) {
        const seatNo = item.seatNumber.trim().toUpperCase();
        const existingSeat = booking.seats.find(
          (s) => s.seatNumber === seatNo && s.isActive,
        );
        if (!existingSeat) {
          throw new AppException(
            HttpStatus.NOT_FOUND,
            ErrorCodes.SEAT_NOT_FOUND,
            `المقعد النشط ${seatNo} غير موجود في هذا الحجز`,
          );
        }

        const nextName =
          item.passengerName !== undefined
            ? item.passengerName.trim()
            : existingSeat.passengerName;
        const nextPhone =
          item.passengerPhone !== undefined
            ? normalizePhone(item.passengerPhone)
            : existingSeat.passengerPhone;

        await tx.bookingSeat.update({
          where: { id: existingSeat.id },
          data: {
            passengerName: nextName,
            passengerPhone: nextPhone,
          },
        });

        changes.push({
          seatNumber: seatNo,
          before: {
            passengerName: existingSeat.passengerName,
            passengerPhone: existingSeat.passengerPhone,
          },
          after: {
            passengerName: nextName,
            passengerPhone: nextPhone,
          },
        });
      }

      await this.auditLogsService.log(
        {
          userId: user.id,
          action: 'PASSENGER_UPDATE',
          entity: 'Booking',
          entityId: booking.code,
          details: { changes },
        },
        tx,
      );

      return tx.booking.findUniqueOrThrow({
        where: { id: booking.id },
        include: BOOKING_DETAIL_INCLUDE,
      });
    });

    return this.formatBooking(updated);
  }

  private formatBooking(b: {
    id: number;
    code: string;
    tripId: number;
    userId: number | null;
    channel: BookingChannel;
    contactName: string | null;
    contactPhone: string | null;
    unitPrice: Prisma.Decimal;
    totalPrice: Prisma.Decimal;
    paymentMethod: PaymentMethod;
    status: BookingStatus;
    cancelReason: string | null;
    cancelledAt: Date | null;
    createdAt: Date;
    createdBy?: { id: number; name: string; role: Role } | null;
    trip: {
      id: number;
      departAt: Date;
      status: TripStatus;
      origin: { id: number; nameAr: string; nameEn: string | null };
      destination: { id: number; nameAr: string; nameEn: string | null };
      busType: { id: number; nameAr: string; category: string; layout: string };
      bus?: { id: number; plateNumber: string } | null;
    };
    seats: Array<{
      id: number;
      seatNumber: string;
      passengerName: string;
      passengerPhone: string;
      unitPrice: Prisma.Decimal;
      status: BookingStatus;
      isActive: boolean;
      cancelledAt: Date | null;
      cancelReason: string | null;
    }>;
  }) {
    return {
      id: b.id,
      code: b.code,
      tripId: b.tripId,
      userId: b.userId,
      channel: b.channel,
      contactName: b.contactName,
      contactPhone: b.contactPhone,
      unitPrice: Number(b.unitPrice),
      totalPrice: Number(b.totalPrice),
      paymentMethod: b.paymentMethod,
      status: b.status,
      cancelReason: b.cancelReason,
      cancelledAt: b.cancelledAt?.toISOString() ?? null,
      createdAt: b.createdAt.toISOString(),
      createdBy: b.createdBy ?? null,
      trip: {
        id: b.trip.id,
        status: b.trip.status,
        departAt: b.trip.departAt.toISOString(),
        departDateDamascus: formatDamascusDate(b.trip.departAt),
        departTimeDamascus: formatDamascusTime(b.trip.departAt),
        departDateArabic: formatDamascusArabicDate(b.trip.departAt),
        origin: b.trip.origin,
        destination: b.trip.destination,
        busType: b.trip.busType,
        bus: b.trip.bus ?? null,
      },
      seats: b.seats.map((s) => ({
        id: s.id,
        seatNumber: s.seatNumber,
        passengerName: s.passengerName,
        passengerPhone: s.passengerPhone,
        unitPrice: Number(s.unitPrice),
        status: s.status,
        isActive: s.isActive,
        cancelledAt: s.cancelledAt?.toISOString() ?? null,
        cancelReason: s.cancelReason,
      })),
    };
  }
}

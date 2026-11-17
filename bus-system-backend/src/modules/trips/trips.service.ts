import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { BookingStatus, Role, TripStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RedisService } from '../../redis/redis.service.js';
import { ErrorCodes } from '../../common/constants/error-codes.js';
import { AppException } from '../../common/exceptions/app.exception.js';
import {
  damascusDateAndTimeToUtc,
  formatDamascusArabicDate,
  formatDamascusDate,
  formatDamascusTime,
} from '../../common/helpers/damascus-time.helper.js';
import { maskPhone } from '../../common/helpers/phone.helper.js';
import { AuthUser } from '../../common/types/auth-user.type.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { SettingsService } from '../settings/settings.service.js';
import {
  CancelTripDto,
  CreateTripDto,
  QueryTripsDto,
  UpdateTripDto,
} from './dto/trip.dto.js';

const ALLOWED_TRANSITIONS: Record<TripStatus, TripStatus[]> = {
  SCHEDULED: [TripStatus.OPEN, TripStatus.CLOSED, TripStatus.CANCELLED],
  OPEN: [
    TripStatus.FULL,
    TripStatus.CLOSED,
    TripStatus.DEPARTED,
    TripStatus.CANCELLED,
  ],
  FULL: [
    TripStatus.OPEN,
    TripStatus.CLOSED,
    TripStatus.DEPARTED,
    TripStatus.CANCELLED,
  ],
  CLOSED: [TripStatus.DEPARTED, TripStatus.COMPLETED, TripStatus.CANCELLED],
  DEPARTED: [TripStatus.COMPLETED],
  COMPLETED: [],
  CANCELLED: [],
};

@Injectable()
export class TripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly auditLogsService: AuditLogsService,
    private readonly notificationsService: NotificationsService,
    private readonly settingsService: SettingsService,
  ) {}

  async create(dto: CreateTripDto, adminUserId: number) {
    const departAt = this.resolveDepartAt(dto.departAt, dto.departDate, dto.departTime);
    if (!departAt) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCodes.VALIDATION_ERROR,
        'يجب تحديد موعد الانطلاق (departAt أو departDate مع departTime)',
      );
    }

    if (departAt <= new Date()) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCodes.TRIP_DATE_IN_PAST,
        'موعد الرحلة يجب أن يكون في المستقبل',
      );
    }

    if (dto.originId === dto.destinationId) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCodes.INVALID_TRIP_ROUTE,
        'مدينة الانطلاق يجب أن تختلف عن مدينة الوجهة',
      );
    }

    const [origin, destination, busType] = await Promise.all([
      this.prisma.city.findUnique({ where: { id: dto.originId } }),
      this.prisma.city.findUnique({ where: { id: dto.destinationId } }),
      this.prisma.busType.findUnique({ where: { id: dto.busTypeId } }),
    ]);

    if (!origin || !origin.isActive) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCodes.NOT_FOUND,
        'مدينة الانطلاق غير موجودة أو معطّلة',
      );
    }
    if (!destination || !destination.isActive) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCodes.NOT_FOUND,
        'مدينة الوجهة غير موجودة أو معطّلة',
      );
    }
    if (!busType || !busType.isActive) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCodes.NOT_FOUND,
        'نوع الباص غير موجود أو غير فعّال',
      );
    }

    if (dto.busId !== undefined) {
      await this.validateBusAssignment(dto.busId, dto.busTypeId);
    }

    if (!dto.confirmDuplicate) {
      const matchingTrip = await this.prisma.trip.findFirst({
        where: {
          originId: dto.originId,
          destinationId: dto.destinationId,
          busTypeId: dto.busTypeId,
          departAt,
          status: { not: TripStatus.CANCELLED },
        },
        select: { id: true },
      });

      if (matchingTrip) {
        throw new AppException(
          HttpStatus.CONFLICT,
          ErrorCodes.DUPLICATE_TRIP_CONFIRMATION_REQUIRED,
          'توجد رحلة مطابقة بنفس الخط ونوع الباص والموعد؛ أعد الإرسال مع confirmDuplicate=true للتأكيد',
          { matchingTripId: matchingTrip.id },
        );
      }
    }

    const initialStatus =
      dto.status === TripStatus.SCHEDULED ? TripStatus.SCHEDULED : TripStatus.OPEN;

    const created = await this.prisma.$transaction(async (tx) => {
      const trip = await tx.trip.create({
        data: {
          originId: dto.originId,
          destinationId: dto.destinationId,
          busTypeId: dto.busTypeId,
          busId: dto.busId ?? null,
          departAt,
          price: dto.price,
          status: initialStatus,
          createdById: adminUserId,
        },
        include: {
          origin: true,
          destination: true,
          busType: true,
          bus: true,
        },
      });

      await this.auditLogsService.log(
        {
          userId: adminUserId,
          action: 'TRIP_CREATE',
          entity: 'Trip',
          entityId: trip.id,
          details: {
            originId: trip.originId,
            destinationId: trip.destinationId,
            busTypeId: trip.busTypeId,
            price: Number(trip.price),
            departAt: trip.departAt.toISOString(),
          },
        },
        tx,
      );

      return trip;
    });

    return this.formatTripSummary(created, 0);
  }

  async findAll(query: QueryTripsDto, user?: AuthUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.TripWhereInput = {};
    if (query.originId) where.originId = query.originId;
    if (query.destinationId) where.destinationId = query.destinationId;
    if (query.busTypeId) where.busTypeId = query.busTypeId;
    if (query.status) {
      where.status = query.status;
    } else if (!user || user.role !== Role.ADMIN) {
      where.status = { notIn: [TripStatus.CANCELLED, TripStatus.SCHEDULED] };
    }

    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      where.price = {};
      if (query.minPrice !== undefined) where.price.gte = query.minPrice;
      if (query.maxPrice !== undefined) where.price.lte = query.maxPrice;
    }

    const now = new Date();
    if (query.date) {
      const startUtc = damascusDateAndTimeToUtc(query.date, '00:00');
      const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000 - 1);
      where.departAt = {
        gte: query.includePast ? startUtc : new Date(Math.max(startUtc.getTime(), now.getTime())),
        lte: endUtc,
      };
    } else if (!query.includePast) {
      where.departAt = { gte: now };
    }

    const orderBy: Prisma.TripOrderByWithRelationInput =
      query.sortBy === 'price'
        ? { price: query.sortOrder === 'desc' ? 'desc' : 'asc' }
        : { departAt: query.sortOrder === 'desc' ? 'desc' : 'asc' };

    const [trips, total] = await Promise.all([
      this.prisma.trip.findMany({
        where,
        include: {
          origin: true,
          destination: true,
          busType: true,
          bus: true,
          _count: {
            select: {
              bookingSeats: { where: { isActive: true } },
            },
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.trip.count({ where }),
    ]);

    let suggestedDates: string[] = [];
    if (
      trips.length === 0 &&
      query.date &&
      query.originId &&
      query.destinationId
    ) {
      const nearby = await this.prisma.trip.findMany({
        where: {
          originId: query.originId,
          destinationId: query.destinationId,
          departAt: { gte: now },
          status: { in: [TripStatus.OPEN, TripStatus.FULL] },
        },
        select: { departAt: true },
        orderBy: { departAt: 'asc' },
        take: 15,
      });
      suggestedDates = Array.from(
        new Set(nearby.map((t) => formatDamascusDate(t.departAt))),
      ).slice(0, 3);
    }

    return {
      items: trips.map((t) =>
        this.formatTripSummary(t, t._count.bookingSeats),
      ),
      suggestedDates,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOne(id: number) {
    const trip = await this.prisma.trip.findUnique({
      where: { id },
      include: {
        origin: true,
        destination: true,
        busType: true,
        bus: true,
        _count: {
          select: {
            bookingSeats: { where: { isActive: true } },
          },
        },
      },
    });
    if (!trip) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        'الرحلة غير موجودة',
      );
    }

    const policy = await this.settingsService.getPolicy();
    const summary = this.formatTripSummary(trip, trip._count.bookingSeats);
    return {
      ...summary,
      bookingClosesAt: new Date(
        trip.departAt.getTime() - policy.bookingCutoffMinutes * 60_000,
      ).toISOString(),
    };
  }

  async getSeatMap(id: number, holderKey?: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id },
      include: {
        busType: {
          include: {
            seatTemplates: {
              orderBy: [{ rowNumber: 'asc' }, { colIndex: 'asc' }],
            },
          },
        },
      },
    });

    if (!trip) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        'الرحلة غير موجودة',
      );
    }

    const activeBooked = await this.prisma.bookingSeat.findMany({
      where: { tripId: id, isActive: true },
      select: { seatNumber: true },
    });
    const bookedSet = new Set(activeBooked.map((s) => s.seatNumber));

    const seatNumbers = trip.busType.seatTemplates.map((s) => s.seatNumber);
    const lockMap = await this.redis.getSeatLocksForTrip(id, seatNumbers);

    const seats = trip.busType.seatTemplates.map((tpl) => {
      if (bookedSet.has(tpl.seatNumber)) {
        return {
          seatNumber: tpl.seatNumber,
          rowNumber: tpl.rowNumber,
          colLetter: tpl.colLetter,
          side: tpl.side,
          colIndex: tpl.colIndex,
          isExtra: tpl.isExtra,
          status: 'BOOKED' as const,
        };
      }

      const lock = lockMap.get(tpl.seatNumber);
      if (lock) {
        const isMine = Boolean(holderKey && lock.holderKey === holderKey);
        return {
          seatNumber: tpl.seatNumber,
          rowNumber: tpl.rowNumber,
          colLetter: tpl.colLetter,
          side: tpl.side,
          colIndex: tpl.colIndex,
          isExtra: tpl.isExtra,
          status: isMine ? ('HELD_BY_ME' as const) : ('HELD' as const),
          holdExpiresAt: lock.expiresAt,
        };
      }

      return {
        seatNumber: tpl.seatNumber,
        rowNumber: tpl.rowNumber,
        colLetter: tpl.colLetter,
        side: tpl.side,
        colIndex: tpl.colIndex,
        isExtra: tpl.isExtra,
        status: 'AVAILABLE' as const,
      };
    });

    return {
      tripId: trip.id,
      status: trip.status,
      price: Number(trip.price),
      busType: {
        id: trip.busType.id,
        nameAr: trip.busType.nameAr,
        category: trip.busType.category,
        size: trip.busType.size,
        layout: trip.busType.layout,
        rowsCount: trip.busType.rowsCount,
        hasExtraBackSeat: trip.busType.hasExtraBackSeat,
        totalSeats: trip.busType.totalSeats,
      },
      seats,
    };
  }

  async getManifest(id: number, viewerRole: Role) {
    const trip = await this.prisma.trip.findUnique({
      where: { id },
      include: {
        origin: true,
        destination: true,
        busType: true,
        bus: true,
        bookingSeats: {
          where: { isActive: true },
          include: {
            booking: {
              select: {
                code: true,
                paymentMethod: true,
                channel: true,
                status: true,
              },
            },
          },
          orderBy: { seatNumber: 'asc' },
        },
      },
    });

    if (!trip) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        'الرحلة غير موجودة',
      );
    }

    const canViewFullPhone =
      viewerRole === Role.ADMIN || viewerRole === Role.RECEPTIONIST;

    return {
      trip: this.formatTripSummary(trip, trip.bookingSeats.length),
      passengers: trip.bookingSeats.map((s) => ({
        seatNumber: s.seatNumber,
        passengerName: s.passengerName,
        passengerPhone: canViewFullPhone
          ? s.passengerPhone
          : maskPhone(s.passengerPhone),
        status: s.status,
        bookingCode: s.booking.code,
        paymentMethod: s.booking.paymentMethod,
        channel: s.booking.channel,
      })),
    };
  }

  async update(id: number, dto: UpdateTripDto, adminUserId: number) {
    const existing = await this.prisma.trip.findUnique({
      where: { id },
      include: { busType: true },
    });
    if (!existing) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        'الرحلة غير موجودة',
      );
    }

    if (
      existing.status === TripStatus.CANCELLED ||
      existing.status === TripStatus.COMPLETED
    ) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCodes.TRIP_INVALID_STATUS_TRANSITION,
        'لا يمكن تعديل رحلة منتهية أو ملغاة',
      );
    }

    const activeBookingSeats = await this.prisma.bookingSeat.count({
      where: { tripId: id, isActive: true },
    });

    if (
      dto.busTypeId !== undefined &&
      dto.busTypeId !== existing.busTypeId &&
      activeBookingSeats > 0
    ) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCodes.TRIP_BUS_TYPE_LOCKED,
        'يُمنع تغيير نوع الباص بعد وجود حجوزات على الرحلة',
      );
    }

    const originId = dto.originId ?? existing.originId;
    const destinationId = dto.destinationId ?? existing.destinationId;
    if (originId === destinationId) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCodes.INVALID_TRIP_ROUTE,
        'مدينة الانطلاق يجب أن تختلف عن مدينة الوجهة',
      );
    }

    const busTypeId = dto.busTypeId ?? existing.busTypeId;
    if (dto.busTypeId !== undefined && dto.busTypeId !== existing.busTypeId) {
      const busType = await this.prisma.busType.findUnique({
        where: { id: busTypeId },
      });
      if (!busType || !busType.isActive) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          ErrorCodes.NOT_FOUND,
          'نوع الباص غير موجود أو غير فعّال',
        );
      }
    }

    if (dto.busId !== undefined && dto.busId !== null) {
      await this.validateBusAssignment(dto.busId, busTypeId);
    }

    let nextDepartAt = existing.departAt;
    const resolved = this.resolveDepartAt(
      dto.departAt,
      dto.departDate,
      dto.departTime,
    );
    const timeChanged = Boolean(
      resolved && resolved.getTime() !== existing.departAt.getTime(),
    );
    if (resolved) {
      if (resolved <= new Date()) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          ErrorCodes.TRIP_DATE_IN_PAST,
          'موعد الرحلة يجب أن يكون في المستقبل',
        );
      }
      nextDepartAt = resolved;
    }

    if (dto.status !== undefined && dto.status !== existing.status) {
      const allowed = ALLOWED_TRANSITIONS[existing.status] ?? [];
      if (!allowed.includes(dto.status)) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          ErrorCodes.TRIP_INVALID_STATUS_TRANSITION,
          `لا يمكن تغيير حالة الرحلة من ${existing.status} إلى ${dto.status}`,
        );
      }
      if (dto.status === TripStatus.CANCELLED) {
        return this.cancel(id, {}, adminUserId);
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.trip.update({
        where: { id },
        data: {
          originId,
          destinationId,
          busTypeId,
          ...(dto.busId !== undefined ? { busId: dto.busId } : {}),
          ...(dto.price !== undefined ? { price: dto.price } : {}),
          departAt: nextDepartAt,
          ...(dto.status !== undefined ? { status: dto.status } : {}),
        },
        include: {
          origin: true,
          destination: true,
          busType: true,
          bus: true,
          _count: { select: { bookingSeats: { where: { isActive: true } } } },
        },
      });

      const priceChanged =
        dto.price !== undefined && Number(dto.price) !== Number(existing.price);

      await this.auditLogsService.log(
        {
          userId: adminUserId,
          action: priceChanged ? 'TRIP_PRICE_UPDATE' : 'TRIP_UPDATE',
          entity: 'Trip',
          entityId: id,
          details: {
            previousPrice: Number(existing.price),
            newPrice: Number(saved.price),
            previousDepartAt: existing.departAt.toISOString(),
            newDepartAt: saved.departAt.toISOString(),
            previousStatus: existing.status,
            newStatus: saved.status,
          },
        },
        tx,
      );

      return saved;
    });

    if (timeChanged && activeBookingSeats > 0) {
      await this.notificationsService.notifyTripCancelledOrRescheduled(
        id,
        'TRIP_TIME_CHANGED',
      );
    }

    return this.formatTripSummary(updated, updated._count.bookingSeats);
  }

  async cancel(id: number, dto: CancelTripDto, adminUserId: number) {
    const existing = await this.prisma.trip.findUnique({
      where: { id },
      include: {
        busType: { include: { seatTemplates: { select: { seatNumber: true } } } },
      },
    });
    if (!existing) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        'الرحلة غير موجودة',
      );
    }

    if (existing.status === TripStatus.CANCELLED) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCodes.TRIP_ALREADY_CANCELLED,
        'الرحلة ملغاة مسبقاً',
      );
    }
    if (existing.status === TripStatus.COMPLETED) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCodes.TRIP_INVALID_STATUS_TRANSITION,
        'لا يمكن إلغاء رحلة منتهية',
      );
    }

    const reason = dto.reason?.trim() || 'إلغاء الرحلة من قبل الإدارة';
    const now = new Date();

    const cancelled = await this.prisma.$transaction(async (tx) => {
      const updatedTrip = await tx.trip.update({
        where: { id },
        data: {
          status: TripStatus.CANCELLED,
          cancelReason: reason,
          cancelledAt: now,
          cancelledById: adminUserId,
        },
        include: {
          origin: true,
          destination: true,
          busType: true,
          bus: true,
        },
      });

      const bookingsToNotify = await tx.booking.findMany({
        where: { tripId: id, status: BookingStatus.CONFIRMED },
        select: { id: true },
      });
      const affectedBookingIds = bookingsToNotify.map((b) => b.id);

      const affectedBookings = await tx.booking.updateMany({
        where: { tripId: id, status: BookingStatus.CONFIRMED },
        data: {
          status: BookingStatus.CANCELLED,
          cancelledAt: now,
          cancelledById: adminUserId,
          cancelReason: reason,
        },
      });

      await tx.bookingSeat.updateMany({
        where: { tripId: id, isActive: true },
        data: {
          isActive: false,
          status: BookingStatus.CANCELLED,
          cancelledAt: now,
          cancelledById: adminUserId,
          cancelReason: reason,
        },
      });

      await this.auditLogsService.log(
        {
          userId: adminUserId,
          action: 'TRIP_CANCEL',
          entity: 'Trip',
          entityId: id,
          details: {
            reason,
            cancelledBookingsCount: affectedBookings.count,
          },
        },
        tx,
      );

      return {
        updatedTrip,
        cancelledBookingsCount: affectedBookings.count,
        affectedBookingIds,
      };
    });

    await this.redis.forceReleaseSeatLocks(
      id,
      existing.busType.seatTemplates.map((s) => s.seatNumber),
    );

    const notificationSummary =
      await this.notificationsService.notifyTripCancelledOrRescheduled(
        id,
        'TRIP_CANCELLED',
        reason,
        cancelled.affectedBookingIds,
      );

    return {
      ...this.formatTripSummary(cancelled.updatedTrip, 0),
      cancelledBookingsCount: cancelled.cancelledBookingsCount,
      notifications: notificationSummary,
    };
  }

  private resolveDepartAt(
    departAtIso?: string,
    departDate?: string,
    departTime?: string,
  ): Date | null {
    if (departAtIso) {
      return new Date(departAtIso);
    }
    if (departDate && departTime) {
      return damascusDateAndTimeToUtc(departDate, departTime);
    }
    return null;
  }

  private async validateBusAssignment(busId: number, busTypeId: number) {
    const bus = await this.prisma.bus.findUnique({ where: { id: busId } });
    if (!bus || !bus.isActive) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCodes.NOT_FOUND,
        'الباص المحدد غير موجود أو غير فعّال',
      );
    }
    if (bus.busTypeId !== busTypeId) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCodes.VALIDATION_ERROR,
        'نوع الباص الفعلي لا يطابق نوع الباص المختار للرحلة',
      );
    }
  }

  formatTripSummary(
    trip: {
      id: number;
      templateId: number | null;
      originId: number;
      destinationId: number;
      busTypeId: number;
      busId: number | null;
      departAt: Date;
      price: Prisma.Decimal;
      status: TripStatus;
      cancelReason: string | null;
      cancelledAt: Date | null;
      origin: { id: number; nameAr: string; nameEn: string | null };
      destination: { id: number; nameAr: string; nameEn: string | null };
      busType: {
        id: number;
        code: string;
        nameAr: string;
        category: string;
        size: string;
        layout: string;
        totalSeats: number;
      };
      bus?: { id: number; plateNumber: string } | null;
    },
    bookedSeatsCount: number,
  ) {
    return {
      id: trip.id,
      templateId: trip.templateId,
      origin: trip.origin,
      destination: trip.destination,
      busType: trip.busType,
      bus: trip.bus ?? null,
      departAt: trip.departAt.toISOString(),
      departDateDamascus: formatDamascusDate(trip.departAt),
      departTimeDamascus: formatDamascusTime(trip.departAt),
      departDateArabic: formatDamascusArabicDate(trip.departAt),
      price: Number(trip.price),
      status: trip.status,
      totalSeats: trip.busType.totalSeats,
      bookedSeatsCount,
      availableSeatsCount: Math.max(
        0,
        trip.busType.totalSeats - bookedSeatsCount,
      ),
      cancelReason: trip.cancelReason,
      cancelledAt: trip.cancelledAt?.toISOString() ?? null,
    };
  }
}

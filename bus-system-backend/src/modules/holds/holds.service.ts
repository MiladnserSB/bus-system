import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { TripStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RedisService } from '../../redis/redis.service.js';
import { ErrorCodes } from '../../common/constants/error-codes.js';
import { AppException } from '../../common/exceptions/app.exception.js';
import { AuthUser } from '../../common/types/auth-user.type.js';
import { SettingsService } from '../settings/settings.service.js';
import { CreateHoldDto } from './dto/hold.dto.js';

@Injectable()
export class HoldsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly settingsService: SettingsService,
  ) {}

  async createHold(
    tripId: number,
    dto: CreateHoldDto,
    user?: AuthUser,
    headerGuestSession?: string,
  ) {
    const rawSeats = [
      ...(dto.seatNumbers ?? []),
      ...(dto.seatNumber ? [dto.seatNumber] : []),
    ]
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    const seatNumbers = Array.from(new Set(rawSeats));
    if (seatNumbers.length === 0) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCodes.VALIDATION_ERROR,
        'يرجى تحديد مقعد واحد على الأقل',
      );
    }

    const guestSession =
      dto.guestSessionId?.trim() ||
      headerGuestSession?.trim() ||
      randomUUID();
    const holderKey = user ? `user:${user.id}` : `guest:${guestSession}`;

    const [trip, policy] = await Promise.all([
      this.prisma.trip.findUnique({
        where: { id: tripId },
        include: {
          busType: {
            include: { seatTemplates: { select: { seatNumber: true } } },
          },
        },
      }),
      this.settingsService.getPolicy(),
    ]);

    if (!trip) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        'الرحلة غير موجودة',
      );
    }

    const now = new Date();
    const cutoffAt = new Date(
      trip.departAt.getTime() - policy.bookingCutoffMinutes * 60_000,
    );

    if (
      trip.status === TripStatus.CANCELLED ||
      trip.status === TripStatus.DEPARTED ||
      trip.status === TripStatus.COMPLETED ||
      trip.status === TripStatus.SCHEDULED
    ) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCodes.TRIP_NOT_BOOKABLE,
        'الرحلة غير متاحة للحجز حالياً',
      );
    }

    if (trip.status === TripStatus.CLOSED || now >= cutoffAt) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCodes.TRIP_BOOKING_CLOSED,
        'انتهى وقت الحجز لهذه الرحلة',
      );
    }

    if (trip.status === TripStatus.FULL) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCodes.SEAT_ALREADY_BOOKED,
        'الرحلة مكتملة المقاعد',
      );
    }

    if (seatNumbers.length > policy.maxSeatsPerBooking) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCodes.MAX_SEATS_EXCEEDED,
        `الحد الأقصى للمقاعد في الحجز الواحد هو ${policy.maxSeatsPerBooking} مقاعد`,
        { maxSeatsPerBooking: policy.maxSeatsPerBooking },
      );
    }

    const validSeats = new Set(
      trip.busType.seatTemplates.map((s) => s.seatNumber),
    );
    for (const seat of seatNumbers) {
      if (!validSeats.has(seat)) {
        throw new AppException(
          HttpStatus.NOT_FOUND,
          ErrorCodes.SEAT_NOT_FOUND,
          `المقعد ${seat} غير موجود في هذا الباص`,
          { seatNumber: seat },
        );
      }
    }

    const existingBooked = await this.prisma.bookingSeat.findMany({
      where: {
        tripId,
        seatNumber: { in: seatNumbers },
        isActive: true,
      },
      select: { seatNumber: true },
    });
    if (existingBooked.length > 0) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCodes.SEAT_ALREADY_BOOKED,
        'هذا المقعد تم حجزه، اختر مقعداً آخر',
        { seats: existingBooked.map((s) => s.seatNumber) },
      );
    }

    // Check total active locks held by this holder on this trip (REQ-SEAT-08)
    const allLocks = await this.redis.getSeatLocksForTrip(
      tripId,
      Array.from(validSeats),
    );
    let alreadyHeldByCaller = 0;
    for (const [seatNo, lock] of allLocks.entries()) {
      if (lock.holderKey === holderKey && !seatNumbers.includes(seatNo)) {
        alreadyHeldByCaller += 1;
      }
    }
    if (alreadyHeldByCaller + seatNumbers.length > policy.maxSeatsPerBooking) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCodes.MAX_SEATS_EXCEEDED,
        `لا يمكن تحديد أكثر من ${policy.maxSeatsPerBooking} مقاعد للحجز الواحد`,
        { maxSeatsPerBooking: policy.maxSeatsPerBooking },
      );
    }

    const ttlSeconds = policy.seatHoldTtlMinutes * 60;
    const holdId = randomUUID();
    const createdAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();

    const acquiredNew: string[] = [];

    for (const seatNumber of seatNumbers) {
      const payload = {
        holdId,
        holderKey,
        tripId,
        seatNumber,
        createdAt,
        expiresAt,
      };
      const acquired = await this.redis.acquireSeatLock(
        tripId,
        seatNumber,
        payload,
        ttlSeconds,
      );

      if (!acquired) {
        const existingLock = await this.redis.getSeatLock(tripId, seatNumber);
        if (existingLock && existingLock.holderKey === holderKey) {
          // Refresh caller's own hold lock under the new holdId
          await this.redis.client.set(
            this.redis.seatLockKey(tripId, seatNumber),
            JSON.stringify(payload),
            'EX',
            ttlSeconds,
          );
          acquiredNew.push(seatNumber);
          continue;
        }

        // Rollback newly acquired locks in this request
        for (const rolledBackSeat of acquiredNew) {
          await this.redis.releaseSeatLockIfOwned(
            tripId,
            rolledBackSeat,
            holdId,
            holderKey,
          );
        }

        throw new AppException(
          HttpStatus.CONFLICT,
          ErrorCodes.SEAT_HELD_BY_ANOTHER,
          'المقعد قيد الحجز من مستخدم آخر',
          { seatNumber },
        );
      }

      acquiredNew.push(seatNumber);
    }

    await this.redis.saveHoldGroup(
      {
        holdId,
        holderKey,
        tripId,
        seatNumbers,
        createdAt,
        expiresAt,
      },
      ttlSeconds,
    );

    return {
      holdId,
      tripId,
      seatNumbers,
      ttlSeconds,
      expiresAt,
      ...(user ? {} : { guestSessionId: guestSession }),
    };
  }

  async releaseHold(
    holdId: string,
    user?: AuthUser,
    headerGuestSession?: string,
  ) {
    const group = await this.redis.getHoldGroup(holdId);
    if (!group) {
      return { released: false, expired: true, holdId };
    }

    const callerHolderKey = user
      ? `user:${user.id}`
      : headerGuestSession?.trim()
        ? `guest:${headerGuestSession.trim()}`
        : null;

    if (!callerHolderKey || group.holderKey !== callerHolderKey) {
      if (user?.role !== 'ADMIN') {
        throw new AppException(
          HttpStatus.FORBIDDEN,
          ErrorCodes.HOLD_FORBIDDEN,
          'لا تملك صلاحية تحرير هذا القفل',
        );
      }
    }

    for (const seat of group.seatNumbers) {
      await this.redis.releaseSeatLockIfOwned(
        group.tripId,
        seat,
        group.holdId,
        group.holderKey,
      );
    }
    await this.redis.deleteHoldGroup(holdId);

    return {
      released: true,
      holdId,
      tripId: group.tripId,
      seatNumbers: group.seatNumbers,
    };
  }
}

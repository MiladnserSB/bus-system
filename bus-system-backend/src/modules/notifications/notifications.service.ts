import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  DeliveryStatus,
  NotificationChannel,
  NotificationType,
} from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ErrorCodes } from '../../common/constants/error-codes.js';
import { AppException } from '../../common/exceptions/app.exception.js';
import {
  formatDamascusArabicDate,
  formatDamascusTime,
} from '../../common/helpers/damascus-time.helper.js';
import {
  QueryNotificationsDto,
  UpdateNotificationPreferencesDto,
} from './dto/notification-query.dto.js';
import { FcmProvider } from './providers/fcm.provider.js';
import { SmsProvider } from './providers/sms.provider.js';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly smsProvider: SmsProvider,
    private readonly fcmProvider: FcmProvider,
  ) {}

  async sendOtpSms(phone: string, code: string): Promise<void> {
    const message = `رمز التحقق الخاص بك هو: ${code} (صالح لمدة 5 دقائق)`;
    const result = await this.smsProvider.sendSms(phone, message, {
      sensitive: true,
    });
    if (!result.sent) {
      this.logger.warn(
        `OTP SMS delivery failed for ${phone}: ${result.errorMessage ?? 'unknown'}`,
      );
    }
  }

  async notifyBookingConfirmed(bookingId: number): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        trip: {
          include: { origin: true, destination: true },
        },
        seats: { where: { isActive: true } },
      },
    });
    if (!booking) return;

    const dateText = formatDamascusArabicDate(booking.trip.departAt);
    const timeText = formatDamascusTime(booking.trip.departAt);
    const seatList = booking.seats.map((s) => s.seatNumber).join('، ');
    const title = 'تم تأكيد حجزك';
    const body = `${booking.trip.origin.nameAr} ← ${booking.trip.destination.nameAr} · ${dateText}، ${timeText} · المقاعد: ${seatList} · ${booking.code}`;

    await this.dispatchToUserOrPhone({
      userId: booking.userId,
      targetPhone: booking.contactPhone ?? booking.seats[0]?.passengerPhone ?? null,
      bookingId: booking.id,
      tripId: booking.tripId,
      type: NotificationType.BOOKING_CONFIRMED,
      title,
      body,
      allowSmsFallback: false,
      dedupeKey: `booking-confirm:${booking.id}`,
    });
  }

  async notifyTripCancelledOrRescheduled(
    tripId: number,
    type: 'TRIP_CANCELLED' | 'TRIP_TIME_CHANGED',
    reasonOrDetails?: string,
    targetBookingIds?: number[],
  ): Promise<{ notifiedBookings: number; smsFallbacks: number }> {
    if (targetBookingIds && targetBookingIds.length === 0) {
      return { notifiedBookings: 0, smsFallbacks: 0 };
    }

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        origin: true,
        destination: true,
        bookings: targetBookingIds
          ? {
              where: { id: { in: targetBookingIds } },
              include: { seats: true },
            }
          : {
              where: { status: 'CONFIRMED' },
              include: {
                seats: { where: { isActive: true } },
              },
            },
      },
    });

    if (!trip) {
      return { notifiedBookings: 0, smsFallbacks: 0 };
    }

    const dateText = formatDamascusArabicDate(trip.departAt);
    const timeText = formatDamascusTime(trip.departAt);

    const title =
      type === 'TRIP_CANCELLED' ? 'أُلغيت الرحلة' : 'تغيّر موعد الرحلة';
    const body =
      type === 'TRIP_CANCELLED'
        ? `${trip.origin.nameAr} ← ${trip.destination.nameAr} · ${dateText}، ${timeText}.${reasonOrDetails ? ` السبب: ${reasonOrDetails}` : ''}`
        : `${trip.origin.nameAr} ← ${trip.destination.nameAr} · الموعد الجديد: ${dateText}، ${timeText}.${reasonOrDetails ? ` ${reasonOrDetails}` : ''}`;

    let notifiedBookings = 0;
    let smsFallbacks = 0;

    for (const booking of trip.bookings) {
      const phones = Array.from(
        new Set(
          [
            booking.contactPhone,
            ...booking.seats.map((s) => s.passengerPhone),
          ].filter((p): p is string => Boolean(p)),
        ),
      );

      const res = await this.dispatchToUserOrPhone({
        userId: booking.userId,
        targetPhone: phones[0] ?? null,
        bookingId: booking.id,
        tripId: trip.id,
        type:
          type === 'TRIP_CANCELLED'
            ? NotificationType.TRIP_CANCELLED
            : NotificationType.TRIP_TIME_CHANGED,
        title,
        body,
        allowSmsFallback: true,
      });

      notifiedBookings += 1;
      if (res.smsFallbackSent) {
        smsFallbacks += 1;
      }
    }

    return { notifiedBookings, smsFallbacks };
  }

  async sendTripReminder(tripId: number, hoursBefore: number): Promise<number> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        origin: true,
        destination: true,
        bookings: {
          where: { status: 'CONFIRMED' },
          include: {
            seats: { where: { isActive: true } },
          },
        },
      },
    });

    if (!trip) return 0;

    const notifType =
      hoursBefore >= 12
        ? NotificationType.TRIP_REMINDER_24H
        : NotificationType.TRIP_REMINDER_3H;
    const timeText = formatDamascusTime(trip.departAt);
    const dateText = formatDamascusArabicDate(trip.departAt);
    const title = `تذكير: رحلتك بعد ${hoursBefore} ساعة`;
    const body = `${trip.origin.nameAr} ← ${trip.destination.nameAr} · ${dateText}، ${timeText}. يرجى الحضور قبل الموعد بـ 30 دقيقة.`;

    let sentCount = 0;
    for (const booking of trip.bookings) {
      if (booking.userId) {
        const pref = await this.prisma.notificationPreference.findUnique({
          where: { userId: booking.userId },
        });
        if (pref && (!pref.remindersEnabled || !pref.nonCriticalEnabled)) {
          continue;
        }
      }

      const dedupeKey = `reminder:${trip.id}:${hoursBefore}h:booking:${booking.id}`;
      const existing = await this.prisma.notification.findUnique({
        where: { dedupeKey },
        select: { id: true },
      });
      if (existing) continue;

      await this.dispatchToUserOrPhone({
        userId: booking.userId,
        targetPhone: booking.contactPhone ?? booking.seats[0]?.passengerPhone ?? null,
        bookingId: booking.id,
        tripId: trip.id,
        type: notifType,
        title,
        body,
        allowSmsFallback: false,
        dedupeKey,
      });
      sentCount += 1;
    }

    return sentCount;
  }

  async findUserNotifications(userId: number, query: QueryNotificationsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [items, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where: { userId } }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    return {
      items,
      unreadCount,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async markAsRead(userId: number, id: number) {
    const existing = await this.prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        'الإشعار غير موجود',
      );
    }
    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: number) {
    const res = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return { updatedCount: res.count };
  }

  async getPreferences(userId: number) {
    const pref = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });
    return (
      pref ?? {
        userId,
        remindersEnabled: true,
        nonCriticalEnabled: true,
      }
    );
  }

  async updatePreferences(
    userId: number,
    dto: UpdateNotificationPreferencesDto,
  ) {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      update: {
        ...(dto.remindersEnabled !== undefined
          ? { remindersEnabled: dto.remindersEnabled }
          : {}),
        ...(dto.nonCriticalEnabled !== undefined
          ? { nonCriticalEnabled: dto.nonCriticalEnabled }
          : {}),
      },
      create: {
        userId,
        remindersEnabled: dto.remindersEnabled ?? true,
        nonCriticalEnabled: dto.nonCriticalEnabled ?? true,
      },
    });
  }

  private async dispatchToUserOrPhone(params: {
    userId: number | null;
    targetPhone: string | null;
    bookingId: number;
    tripId: number;
    type: NotificationType;
    title: string;
    body: string;
    allowSmsFallback: boolean;
    dedupeKey?: string;
  }): Promise<{ pushSent: boolean; smsFallbackSent: boolean }> {
    let pushSent = false;
    let pushError: string | undefined;

    if (params.userId) {
      const devices = await this.prisma.userDevice.findMany({
        where: { userId: params.userId, isActive: true },
      });

      if (devices.length === 0) {
        pushError = 'NO_ACTIVE_DEVICE';
      } else {
        for (const device of devices) {
          const result = await this.fcmProvider.sendPush(
            device.fcmToken,
            params.title,
            params.body,
            {
              type: params.type,
              tripId: String(params.tripId),
              bookingId: String(params.bookingId),
            },
          );
          if (result.sent) {
            pushSent = true;
          } else {
            pushError = result.reason;
          }
        }
      }

      try {
        await this.prisma.notification.create({
          data: {
            userId: params.userId,
            bookingId: params.bookingId,
            tripId: params.tripId,
            targetPhone: params.targetPhone,
            type: params.type,
            title: params.title,
            body: params.body,
            channel: NotificationChannel.PUSH,
            deliveryStatus: pushSent
              ? DeliveryStatus.SENT
              : DeliveryStatus.FAILED,
            errorMessage: pushSent ? null : (pushError ?? 'PUSH_FAILED'),
            dedupeKey: params.dedupeKey ?? null,
          },
        });
      } catch (err) {
        this.logger.warn(
          `Notification persistence skipped: ${err instanceof Error ? err.message : 'unknown'}`,
        );
      }
    }

    let smsFallbackSent = false;
    if (params.allowSmsFallback && !pushSent && params.targetPhone) {
      const smsRes = await this.smsProvider.sendSms(
        params.targetPhone,
        `${params.title}: ${params.body}`,
      );
      smsFallbackSent = smsRes.sent;
      await this.prisma.notification.create({
        data: {
          userId: params.userId,
          bookingId: params.bookingId,
          tripId: params.tripId,
          targetPhone: params.targetPhone,
          type: params.type,
          title: params.title,
          body: params.body,
          channel: NotificationChannel.SMS,
          deliveryStatus: smsRes.sent
            ? DeliveryStatus.SENT
            : DeliveryStatus.FAILED,
          errorMessage: smsRes.errorMessage ?? null,
        },
      });
    }

    return { pushSent, smsFallbackSent };
  }
}

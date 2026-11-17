import { createHmac, timingSafeEqual } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as QRCode from 'qrcode';
import { PaymentMethod, Role } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ErrorCodes } from '../../common/constants/error-codes.js';
import { AppException } from '../../common/exceptions/app.exception.js';
import {
  formatDamascusArabicDate,
  formatDamascusDate,
  formatDamascusTime,
} from '../../common/helpers/damascus-time.helper.js';
import { AuthUser } from '../../common/types/auth-user.type.js';

export interface TicketQrPayload {
  code: string;
  tripId: number;
  seats: string[];
  issuedAt: string;
  signature: string;
}

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  signGuestAccessToken(bookingCode: string): string {
    const secret = this.getQrSecret();
    return createHmac('sha256', secret)
      .update(`guest-ticket:${bookingCode}`)
      .digest('hex');
  }

  verifyGuestAccessToken(bookingCode: string, token: string): boolean {
    const expected = this.signGuestAccessToken(bookingCode);
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(token.trim(), 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  async getTicketByBookingCode(
    code: string,
    user?: AuthUser,
    guestToken?: string,
  ) {
    const booking = await this.prisma.booking.findUnique({
      where: { code: code.trim().toUpperCase() },
      include: {
        trip: {
          include: {
            origin: true,
            destination: true,
            busType: true,
            bus: true,
          },
        },
        seats: {
          orderBy: { seatNumber: 'asc' },
        },
      },
    });

    if (!booking) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        'الحجز غير موجود',
      );
    }

    this.assertCanAccessBooking(booking.code, booking.userId, user, guestToken);

    return this.buildTicket(booking);
  }

  async buildTicket(booking: {
    code: string;
    tripId: number;
    status: string;
    totalPrice: any;
    paymentMethod: PaymentMethod;
    createdAt: Date;
    trip: {
      departAt: Date;
      origin: { nameAr: string; nameEn: string | null };
      destination: { nameAr: string; nameEn: string | null };
      busType: { nameAr: string; category: string; layout: string; size: string };
      bus?: { plateNumber: string } | null;
    };
    seats: Array<{
      seatNumber: string;
      passengerName: string;
      passengerPhone: string;
      unitPrice: any;
      status: string;
      isActive: boolean;
    }>;
  }) {
    const activeSeats = booking.seats.filter((s) => s.isActive);
    const seatList = (activeSeats.length > 0 ? activeSeats : booking.seats).map(
      (s) => s.seatNumber,
    );
    const issuedAt = booking.createdAt.toISOString();
    const signature = this.signQrData(
      booking.code,
      booking.tripId,
      seatList,
      issuedAt,
    );

    const qrObject: TicketQrPayload = {
      code: booking.code,
      tripId: booking.tripId,
      seats: seatList,
      issuedAt,
      signature,
    };
    const qrPayloadString = JSON.stringify(qrObject);
    const qrCodeDataUrl = await QRCode.toDataURL(qrPayloadString, {
      margin: 1,
      width: 240,
    });

    return {
      bookingCode: booking.code,
      status: booking.status,
      route: {
        originAr: booking.trip.origin.nameAr,
        originEn: booking.trip.origin.nameEn,
        destinationAr: booking.trip.destination.nameAr,
        destinationEn: booking.trip.destination.nameEn,
        label: `${booking.trip.origin.nameAr} ← ${booking.trip.destination.nameAr}`,
      },
      departAt: booking.trip.departAt.toISOString(),
      departDateDamascus: formatDamascusDate(booking.trip.departAt),
      departTimeDamascus: formatDamascusTime(booking.trip.departAt),
      departDateArabic: formatDamascusArabicDate(booking.trip.departAt),
      busType: {
        nameAr: booking.trip.busType.nameAr,
        category: booking.trip.busType.category,
        size: booking.trip.busType.size,
        layout: booking.trip.busType.layout,
      },
      busPlateNumber: booking.trip.bus?.plateNumber ?? null,
      seats: booking.seats.map((s) => ({
        seatNumber: s.seatNumber,
        passengerName: s.passengerName,
        passengerPhone: s.passengerPhone,
        unitPrice: Number(s.unitPrice),
        status: s.status,
        isActive: s.isActive,
      })),
      totalPrice: Number(booking.totalPrice),
      paymentMethod: booking.paymentMethod,
      paymentMethodLabel:
        booking.paymentMethod === PaymentMethod.CASH_OFFICE
          ? 'نقداً في المكتب'
          : 'نقداً عند الصعود',
      earlyArrivalNotice: 'يرجى الحضور قبل موعد الانطلاق بـ 30 دقيقة',
      qrPayload: qrObject,
      qrCodeDataUrl,
    };
  }

  async verifyQrPayload(rawPayload: string) {
    let parsed: TicketQrPayload;
    try {
      parsed = JSON.parse(rawPayload) as TicketQrPayload;
    } catch {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCodes.INVALID_QR_SIGNATURE,
        'صيغة رمز QR غير صالحة',
      );
    }

    if (
      !parsed.code ||
      !parsed.tripId ||
      !Array.isArray(parsed.seats) ||
      !parsed.issuedAt ||
      !parsed.signature
    ) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCodes.INVALID_QR_SIGNATURE,
        'بيانات رمز QR غير مكتملة',
      );
    }

    const expected = this.signQrData(
      parsed.code,
      parsed.tripId,
      parsed.seats,
      parsed.issuedAt,
    );

    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(parsed.signature, 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCodes.INVALID_QR_SIGNATURE,
        'توقيع رمز QR غير صالح',
      );
    }

    const booking = await this.prisma.booking.findUnique({
      where: { code: parsed.code },
      include: {
        trip: { include: { origin: true, destination: true } },
        seats: { where: { isActive: true } },
      },
    });

    if (!booking) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        'الحجز غير موجود',
      );
    }

    return {
      valid: true,
      bookingCode: booking.code,
      bookingStatus: booking.status,
      tripStatus: booking.trip.status,
      activeSeats: booking.seats.map((s) => s.seatNumber),
    };
  }

  assertCanAccessBooking(
    bookingCode: string,
    bookingUserId: number | null,
    user?: AuthUser,
    guestToken?: string,
  ): void {
    if (user) {
      if (user.role === Role.ADMIN || user.role === Role.RECEPTIONIST) {
        return;
      }
      if (bookingUserId !== null && bookingUserId === user.id) {
        return;
      }
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ErrorCodes.FORBIDDEN,
        'ليس لديك صلاحية للوصول إلى هذا الحجز',
      );
    }

    if (guestToken && this.verifyGuestAccessToken(bookingCode, guestToken)) {
      return;
    }

    throw new AppException(
      HttpStatus.UNAUTHORIZED,
      ErrorCodes.UNAUTHORIZED,
      'يرجى تسجيل الدخول أو تقديم رمز تذكرة الضيف الصالح',
    );
  }

  private signQrData(
    code: string,
    tripId: number,
    seats: string[],
    issuedAt: string,
  ): string {
    const canonical = `${code}|${tripId}|${seats.join(',')}|${issuedAt}`;
    return createHmac('sha256', this.getQrSecret())
      .update(canonical)
      .digest('hex');
  }

  private getQrSecret(): string {
    return (
      this.configService.get<string>('qrHmacSecret') ??
      this.configService.get<string>('QR_HMAC_SECRET') ??
      'dev-qr-hmac-secret-replace-in-production-32chars'
    );
  }
}

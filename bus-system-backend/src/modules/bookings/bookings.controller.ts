import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Role } from '../../generated/prisma/enums.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { OptionalAuth } from '../../common/decorators/optional-auth.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.type.js';
import { BookingsService } from './bookings.service.js';
import {
  CancelBookingDto,
  CreateBookingDto,
  QueryBookingsDto,
  QueryMyBookingsDto,
  UpdateBookingPassengersDto,
} from './dto/booking.dto.js';

@ApiTags('Bookings')
@Controller()
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @OptionalAuth()
  @Roles(Role.ADMIN, Role.RECEPTIONIST, Role.CUSTOMER)
  @ApiBearerAuth()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'مفتاح لمنع تكرار الحجز عند إعادة المحاولة',
  })
  @ApiHeader({
    name: 'x-guest-session',
    required: false,
    description: 'معرف جلسة الضيف عند الحجز دون حساب',
  })
  @Throttle({
    default: {
      limit: () => Number.parseInt(process.env.RATE_LIMIT_BOOKING_MAX ?? '30', 10),
      ttl: 60000,
    },
  })
  @Post('bookings')
  @ApiOperation({ summary: 'تأكيد الحجز داخل معاملة قاعدة بيانات واحدة' })
  create(
    @Body() dto: CreateBookingDto,
    @Req() req: Request,
    @CurrentUser() user?: AuthUser,
  ) {
    const idempotencyKey = req.headers['idempotency-key'];
    const guestSession = req.headers['x-guest-session'];
    return this.bookingsService.create(
      dto,
      user,
      typeof idempotencyKey === 'string' ? idempotencyKey : undefined,
      typeof guestSession === 'string' ? guestSession : undefined,
    );
  }

  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.RECEPTIONIST)
  @Get('bookings')
  @ApiOperation({ summary: 'البحث عن الحجوزات واستعراض حجوزات اليوم (للموظف والمدير)' })
  findAll(@Query() query: QueryBookingsDto) {
    return this.bookingsService.findAll(query);
  }

  @ApiBearerAuth()
  @Roles(Role.CUSTOMER)
  @Get('me/bookings')
  @ApiOperation({ summary: 'حجوزات الزبون (القادمة / السابقة / الملغاة)' })
  findMyBookings(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryMyBookingsDto,
  ) {
    return this.bookingsService.findMyBookings(user.id, query);
  }

  @OptionalAuth()
  @ApiBearerAuth()
  @Get('bookings/:code')
  @ApiOperation({ summary: 'عرض تفاصيل حجز برقم الحجز' })
  findOne(
    @Param('code') code: string,
    @Req() req: Request,
    @Query('token') queryToken?: string,
    @CurrentUser() user?: AuthUser,
  ) {
    const headerToken = req.headers['x-guest-token'];
    const guestToken =
      queryToken ?? (typeof headerToken === 'string' ? headerToken : undefined);
    return this.bookingsService.findOneByCode(code, user, guestToken);
  }

  @OptionalAuth()
  @ApiBearerAuth()
  @Post('bookings/:code/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'إلغاء حجز كامل وتحرير مقاعده فوراً' })
  cancelBooking(
    @Param('code') code: string,
    @Body() dto: CancelBookingDto,
    @Req() req: Request,
    @Query('token') queryToken?: string,
    @CurrentUser() user?: AuthUser,
  ) {
    const headerToken = req.headers['x-guest-token'];
    const guestToken =
      queryToken ?? (typeof headerToken === 'string' ? headerToken : undefined);
    return this.bookingsService.cancelBooking(code, dto, user, guestToken);
  }

  @OptionalAuth()
  @ApiBearerAuth()
  @Post('bookings/:code/seats/:seatNumber/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'إلغاء مقعد واحد من حجز متعدد المقاعد' })
  cancelSeat(
    @Param('code') code: string,
    @Param('seatNumber') seatNumber: string,
    @Body() dto: CancelBookingDto,
    @Req() req: Request,
    @Query('token') queryToken?: string,
    @CurrentUser() user?: AuthUser,
  ) {
    const headerToken = req.headers['x-guest-token'];
    const guestToken =
      queryToken ?? (typeof headerToken === 'string' ? headerToken : undefined);
    return this.bookingsService.cancelSeat(
      code,
      seatNumber,
      dto,
      user,
      guestToken,
    );
  }

  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.RECEPTIONIST, Role.CUSTOMER)
  @Patch('bookings/:code/passengers')
  @ApiOperation({ summary: 'تعديل اسم أو هاتف الراكب دون تغيير المقعد' })
  updatePassengers(
    @Param('code') code: string,
    @Body() dto: UpdateBookingPassengersDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.bookingsService.updatePassengers(code, dto, user);
  }
}

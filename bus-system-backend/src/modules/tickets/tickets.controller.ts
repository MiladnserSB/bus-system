import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Role } from '../../generated/prisma/enums.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { OptionalAuth } from '../../common/decorators/optional-auth.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.type.js';
import { VerifyTicketQrDto } from './dto/ticket.dto.js';
import { TicketsService } from './tickets.service.js';

@ApiTags('Tickets')
@Controller()
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @OptionalAuth()
  @ApiBearerAuth()
  @ApiHeader({
    name: 'x-guest-token',
    required: false,
    description: 'رمز الوصول الخاص بحجز الضيف',
  })
  @Get('bookings/:code/ticket')
  @ApiOperation({ summary: 'جلب بيانات التذكرة الرقمية ورمز QR للحجز' })
  getTicket(
    @Param('code') code: string,
    @Req() req: Request,
    @Query('token') queryToken?: string,
    @CurrentUser() user?: AuthUser,
  ) {
    const headerToken = req.headers['x-guest-token'];
    const guestToken =
      queryToken ?? (typeof headerToken === 'string' ? headerToken : undefined);
    return this.ticketsService.getTicketByBookingCode(code, user, guestToken);
  }

  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.RECEPTIONIST)
  @Post('tickets/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'التحقق من صحة توقيع رمز QR للتذكرة' })
  verifyQr(@Body() dto: VerifyTicketQrDto) {
    return this.ticketsService.verifyQrPayload(dto.qrPayload);
  }
}

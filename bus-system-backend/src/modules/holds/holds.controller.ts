import {
  Body,
  Controller,
  Delete,
  Param,
  ParseIntPipe,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Role } from '../../generated/prisma/enums.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { OptionalAuth } from '../../common/decorators/optional-auth.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.type.js';
import { CreateHoldDto } from './dto/hold.dto.js';
import { HoldsService } from './holds.service.js';

@ApiTags('Holds')
@Controller()
export class HoldsController {
  constructor(private readonly holdsService: HoldsService) {}

  @OptionalAuth()
  @Roles(Role.ADMIN, Role.RECEPTIONIST, Role.CUSTOMER)
  @ApiBearerAuth()
  @ApiHeader({
    name: 'x-guest-session',
    required: false,
    description: 'معرّف جلسة الضيف عند الحجز دون حساب',
  })
  @Post('trips/:id/holds')
  @ApiOperation({ summary: 'قفل مقعد أو أكثر مؤقتاً عبر Redis (SET NX EX)' })
  createHold(
    @Param('id', ParseIntPipe) tripId: number,
    @Body() dto: CreateHoldDto,
    @Req() req: Request,
    @CurrentUser() user?: AuthUser,
  ) {
    const guestSession = req.headers['x-guest-session'];
    return this.holdsService.createHold(
      tripId,
      dto,
      user,
      typeof guestSession === 'string' ? guestSession : undefined,
    );
  }

  @OptionalAuth()
  @Roles(Role.ADMIN, Role.RECEPTIONIST, Role.CUSTOMER)
  @ApiBearerAuth()
  @ApiHeader({
    name: 'x-guest-session',
    required: false,
    description: 'معرّف جلسة الضيف عند الحجز دون حساب',
  })
  @Delete('holds/:id')
  @ApiOperation({ summary: 'تحرير قفل مؤقت قبل انتهاء مهلته' })
  releaseHold(
    @Param('id') holdId: string,
    @Req() req: Request,
    @CurrentUser() user?: AuthUser,
  ) {
    const guestSession = req.headers['x-guest-session'];
    return this.holdsService.releaseHold(
      holdId,
      user,
      typeof guestSession === 'string' ? guestSession : undefined,
    );
  }
}

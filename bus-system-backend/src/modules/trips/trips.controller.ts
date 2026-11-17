import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Role } from '../../generated/prisma/enums.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { OptionalAuth } from '../../common/decorators/optional-auth.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.type.js';
import {
  CancelTripDto,
  CreateTripDto,
  QueryTripsDto,
  UpdateTripDto,
} from './dto/trip.dto.js';
import { TripsService } from './trips.service.js';

@ApiTags('Trips')
@Controller('trips')
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'البحث في الرحلات وتصفيتها' })
  findAll(@Query() query: QueryTripsDto, @CurrentUser() user?: AuthUser) {
    return this.tripsService.findAll(query, user);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'تفاصيل رحلة محددة' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.tripsService.findOne(id);
  }

  @OptionalAuth()
  @Get(':id/seats')
  @ApiOperation({ summary: 'خريطة المقاعد وحالة كل مقعد في الرحلة' })
  getSeats(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
    @CurrentUser() user?: AuthUser,
  ) {
    const guestSession = req.headers['x-guest-session'];
    const holderKey = user
      ? `user:${user.id}`
      : typeof guestSession === 'string' && guestSession.trim()
        ? `guest:${guestSession.trim()}`
        : undefined;
    return this.tripsService.getSeatMap(id, holderKey);
  }

  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.RECEPTIONIST)
  @Get(':id/manifest')
  @ApiOperation({ summary: 'كشف ركاب الرحلة القابل للطباعة (للمدير والموظف)' })
  getManifest(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tripsService.getManifest(id, user.role);
  }

  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @Post()
  @ApiOperation({ summary: 'إنشاء رحلة جديدة (للمدير فقط)' })
  create(@Body() dto: CreateTripDto, @CurrentUser() admin: AuthUser) {
    return this.tripsService.create(dto, admin.id);
  }

  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @Patch(':id')
  @ApiOperation({ summary: 'تعديل رحلة أو سعرها (للمدير فقط)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTripDto,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.tripsService.update(id, dto, admin.id);
  }

  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'إلغاء رحلة وإلغاء حجوزاتها وإشعار الركاب (للمدير فقط)' })
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelTripDto,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.tripsService.cancel(id, dto, admin.id);
  }
}

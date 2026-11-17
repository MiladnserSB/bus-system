import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/enums.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.type.js';
import { BusesService } from './buses.service.js';
import { CreateBusDto, QueryBusesDto, UpdateBusDto } from './dto/bus.dto.js';

@ApiTags('Buses')
@ApiBearerAuth()
@Controller('buses')
export class BusesController {
  constructor(private readonly busesService: BusesService) {}

  @Roles(Role.ADMIN, Role.RECEPTIONIST)
  @Get()
  @ApiOperation({ summary: 'قائمة الباصات الفعلية' })
  findAll(@Query() query: QueryBusesDto) {
    return this.busesService.findAll(query);
  }

  @Roles(Role.ADMIN, Role.RECEPTIONIST)
  @Get(':id')
  @ApiOperation({ summary: 'تفاصيل باص محدد' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.busesService.findOne(id);
  }

  @Roles(Role.ADMIN)
  @Post()
  @ApiOperation({ summary: 'إضافة باص فعلي برقم لوحة فريد (للمدير فقط)' })
  create(@Body() dto: CreateBusDto, @CurrentUser() admin: AuthUser) {
    return this.busesService.create(dto, admin.id);
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  @ApiOperation({ summary: 'تعديل أو تعطيل باص (للمدير فقط)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBusDto,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.busesService.update(id, dto, admin.id);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  @ApiOperation({ summary: 'حذف باص غير مرتبط برحلات (للمدير فقط)' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.busesService.remove(id, admin.id);
  }
}

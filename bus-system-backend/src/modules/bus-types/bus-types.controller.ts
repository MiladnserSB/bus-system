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
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.type.js';
import { BusTypesService } from './bus-types.service.js';
import {
  CreateBusTypeDto,
  QueryBusTypesDto,
  UpdateBusTypeDto,
} from './dto/bus-type.dto.js';

@ApiTags('Bus Types')
@Controller('bus-types')
export class BusTypesController {
  constructor(private readonly busTypesService: BusTypesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'استعراض أنواع الباصات' })
  findAll(@Query() query: QueryBusTypesDto) {
    return this.busTypesService.findAll(query);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'تفاصيل نوع باص محدد' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.busTypesService.findOne(id);
  }

  @Public()
  @Get(':id/layout')
  @ApiOperation({ summary: 'جلب مخطط المقاعد المولّد لنوع الباص' })
  getLayout(@Param('id', ParseIntPipe) id: number) {
    return this.busTypesService.getLayout(id);
  }

  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @Post()
  @ApiOperation({ summary: 'إضافة نوع باص جديد مع توليد مقاعده تلقائياً (للمدير فقط)' })
  create(@Body() dto: CreateBusTypeDto, @CurrentUser() admin: AuthUser) {
    return this.busTypesService.create(dto, admin.id);
  }

  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @Patch(':id')
  @ApiOperation({ summary: 'تعديل أو تعطيل نوع باص (للمدير فقط)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBusTypeDto,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.busTypesService.update(id, dto, admin.id);
  }

  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @Delete(':id')
  @ApiOperation({ summary: 'حذف نوع باص غير مرتبط (للمدير فقط)' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.busTypesService.remove(id, admin.id);
  }
}

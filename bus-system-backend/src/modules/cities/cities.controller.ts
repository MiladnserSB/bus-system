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
import { CitiesService } from './cities.service.js';
import { CreateCityDto, QueryCitiesDto, UpdateCityDto } from './dto/city.dto.js';

@ApiTags('Cities')
@Controller('cities')
export class CitiesController {
  constructor(private readonly citiesService: CitiesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'استعراض قائمة المدن' })
  findAll(@Query() query: QueryCitiesDto) {
    return this.citiesService.findAll(query);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'تفاصيل مدينة محددة' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.citiesService.findOne(id);
  }

  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @Post()
  @ApiOperation({ summary: 'إضافة مدينة جديدة (للمدير فقط)' })
  create(@Body() dto: CreateCityDto, @CurrentUser() admin: AuthUser) {
    return this.citiesService.create(dto, admin.id);
  }

  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @Patch(':id')
  @ApiOperation({ summary: 'تعديل أو تعطيل مدينة (للمدير فقط)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCityDto,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.citiesService.update(id, dto, admin.id);
  }

  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @Delete(':id')
  @ApiOperation({ summary: 'حذف مدينة غير مرتبطة برحلات (للمدير فقط)' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.citiesService.remove(id, admin.id);
  }
}

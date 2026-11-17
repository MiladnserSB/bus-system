import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/enums.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.type.js';
import {
  AddExclusionDto,
  CreateTripTemplateDto,
  PreviewTemplateDto,
  UpdateTripTemplateDto,
} from './dto/trip-template.dto.js';
import { TripTemplatesService } from './trip-templates.service.js';

@ApiTags('Trip Templates')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('trip-templates')
export class TripTemplatesController {
  constructor(private readonly tripTemplatesService: TripTemplatesService) {}

  @Get()
  @ApiOperation({ summary: 'قائمة قوالب الرحلات المجدولة (للمدير فقط)' })
  findAll() {
    return this.tripTemplatesService.findAll();
  }

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'معاينة الرحلات التي سيولّدها القالب قبل الحفظ' })
  preview(@Body() dto: PreviewTemplateDto) {
    return this.tripTemplatesService.preview(dto);
  }

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'تشغيل مولد الرحلات يدوياً لجميع القوالب الفعالة (للمدير فقط)' })
  generateAll(@CurrentUser() admin: AuthUser) {
    return this.tripTemplatesService.runGeneratorForAllActiveTemplates(admin.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'تفاصيل قالب رحلات مجدولة (للمدير فقط)' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.tripTemplatesService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'إنشاء قالب رحلات وتوليد رحلاته فوراً (للمدير فقط)' })
  create(
    @Body() dto: CreateTripTemplateDto,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.tripTemplatesService.create(dto, admin.id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'تعديل قالب رحلات (يؤثر على الرحلات المستقبلية غير المحجوزة فقط)',
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTripTemplateDto,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.tripTemplatesService.update(id, dto, admin.id);
  }

  @Post(':id/toggle')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'إيقاف القالب مؤقتاً أو إعادة تفعيله' })
  toggle(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.tripTemplatesService.toggle(id, admin.id);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'حذف القالب مع الإبقاء على الرحلات التي عليها حجوزات',
  })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.tripTemplatesService.remove(id, admin.id);
  }

  @Post(':id/exclusions')
  @ApiOperation({ summary: 'إضافة تاريخ استثناء (عطلة) للقالب' })
  addExclusion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddExclusionDto,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.tripTemplatesService.addExclusion(id, dto, admin.id);
  }

  @Delete(':id/exclusions/:exclusionId')
  @ApiOperation({ summary: 'إزالة تاريخ استثناء من القالب' })
  removeExclusion(
    @Param('id', ParseIntPipe) id: number,
    @Param('exclusionId', ParseIntPipe) exclusionId: number,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.tripTemplatesService.removeExclusion(
      id,
      exclusionId,
      admin.id,
    );
  }
}

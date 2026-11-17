import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  RecurrenceType,
  TripStatus,
} from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ErrorCodes } from '../../common/constants/error-codes.js';
import { AppException } from '../../common/exceptions/app.exception.js';
import {
  ARABIC_WEEKDAYS,
  addDaysToDateString,
  clampDayOfMonth,
  damascusDateAndTimeToUtc,
  dateOnlyToUtcMidnight,
  formatDamascusDate,
  utcDateToDateOnlyString,
} from '../../common/helpers/damascus-time.helper.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { SettingsService } from '../settings/settings.service.js';
import {
  AddExclusionDto,
  CreateTripTemplateDto,
  PreviewTemplateDto,
  UpdateTripTemplateDto,
} from './dto/trip-template.dto.js';

export interface CandidateTripSlot {
  date: string;
  time: string;
  dayNameAr: string;
  departAtUtc: Date;
}

export interface GeneratorBatchSummary {
  processedTemplates: number;
  createdTrips: number;
  errors: Array<{ templateId: number; message: string }>;
}

@Injectable()
export class TripTemplatesService {
  private readonly logger = new Logger(TripTemplatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly settingsService: SettingsService,
  ) {}

  async findAll() {
    const templates = await this.prisma.tripTemplate.findMany({
      include: {
        origin: true,
        destination: true,
        busType: true,
        bus: true,
        exclusions: { orderBy: { excludedDate: 'asc' } },
        _count: {
          select: {
            trips: { where: { departAt: { gte: new Date() } } },
          },
        },
      },
      orderBy: { id: 'desc' },
    });

    return templates.map((t) => this.formatTemplate(t));
  }

  async findOne(id: number) {
    const template = await this.prisma.tripTemplate.findUnique({
      where: { id },
      include: {
        origin: true,
        destination: true,
        busType: true,
        bus: true,
        exclusions: { orderBy: { excludedDate: 'asc' } },
        _count: {
          select: {
            trips: { where: { departAt: { gte: new Date() } } },
          },
        },
      },
    });
    if (!template) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        'قالب الرحلات المجدولة غير موجود',
      );
    }
    return this.formatTemplate(template);
  }

  async preview(dto: PreviewTemplateDto) {
    await this.validateTemplateParams(dto);
    const policy = await this.settingsService.getPolicy();
    const aheadDays =
      dto.generateAheadDays ?? policy.templateGenerateAheadDays;

    const slots = this.computeCandidateSlots({
      departureTime: dto.departureTime,
      recurrence: dto.recurrence,
      daysOfWeek: dto.daysOfWeek ?? [],
      dayOfMonth: dto.dayOfMonth ?? null,
      startDate: dto.startDate,
      endDate: dto.endDate ?? null,
      generateAheadDays: aheadDays,
      excludedDates: new Set(dto.exclusionDates ?? []),
    });

    return {
      count: slots.length,
      items: slots.map((s) => ({
        date: s.date,
        time: s.time,
        dayNameAr: s.dayNameAr,
        departAt: s.departAtUtc.toISOString(),
      })),
    };
  }

  async create(dto: CreateTripTemplateDto, adminUserId: number) {
    await this.validateTemplateParams(dto);
    const policy = await this.settingsService.getPolicy();
    const aheadDays =
      dto.generateAheadDays ?? policy.templateGenerateAheadDays;

    const created = await this.prisma.$transaction(async (tx) => {
      const template = await tx.tripTemplate.create({
        data: {
          originId: dto.originId,
          destinationId: dto.destinationId,
          busTypeId: dto.busTypeId,
          busId: dto.busId ?? null,
          price: dto.price,
          departureTime: dto.departureTime,
          recurrence: dto.recurrence,
          daysOfWeek: dto.daysOfWeek ?? [],
          dayOfMonth: dto.dayOfMonth ?? null,
          startDate: dateOnlyToUtcMidnight(dto.startDate),
          endDate: dto.endDate ? dateOnlyToUtcMidnight(dto.endDate) : null,
          generateAheadDays: aheadDays,
          isActive: true,
          createdById: adminUserId,
        },
      });

      const uniqueExclusions = Array.from(new Set(dto.exclusionDates ?? []));
      if (uniqueExclusions.length > 0) {
        await tx.templateExclusion.createMany({
          data: uniqueExclusions.map((dateStr) => ({
            templateId: template.id,
            excludedDate: dateOnlyToUtcMidnight(dateStr),
          })),
          skipDuplicates: true,
        });
      }

      await this.auditLogsService.log(
        {
          userId: adminUserId,
          action: 'TEMPLATE_CREATE',
          entity: 'TripTemplate',
          entityId: template.id,
          details: {
            originId: template.originId,
            destinationId: template.destinationId,
            recurrence: template.recurrence,
            departureTime: template.departureTime,
            price: Number(template.price),
          },
        },
        tx,
      );

      return template;
    });

    const generatedCount = await this.generateTripsForTemplate(
      created.id,
      adminUserId,
    );
    const full = await this.findOne(created.id);
    return {
      ...full,
      generatedTripsCount: generatedCount,
    };
  }

  async update(
    id: number,
    dto: UpdateTripTemplateDto,
    adminUserId: number,
  ) {
    const existing = await this.prisma.tripTemplate.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        'قالب الرحلات المجدولة غير موجود',
      );
    }

    const merged = {
      originId: dto.originId ?? existing.originId,
      destinationId: dto.destinationId ?? existing.destinationId,
      busTypeId: dto.busTypeId ?? existing.busTypeId,
      busId: dto.busId !== undefined ? dto.busId : existing.busId,
      price: dto.price !== undefined ? dto.price : Number(existing.price),
      departureTime: dto.departureTime ?? existing.departureTime,
      recurrence: dto.recurrence ?? existing.recurrence,
      daysOfWeek: dto.daysOfWeek ?? existing.daysOfWeek,
      dayOfMonth:
        dto.dayOfMonth !== undefined ? dto.dayOfMonth : existing.dayOfMonth,
      startDate: dto.startDate ?? utcDateToDateOnlyString(existing.startDate),
      endDate:
        dto.endDate !== undefined
          ? dto.endDate
          : existing.endDate
            ? utcDateToDateOnlyString(existing.endDate)
            : null,
      generateAheadDays: dto.generateAheadDays ?? existing.generateAheadDays,
    };

    await this.validateTemplateParams({
      ...merged,
      busId: merged.busId ?? undefined,
      dayOfMonth: merged.dayOfMonth ?? undefined,
      endDate: merged.endDate ?? undefined,
    });

    const scheduleChanged =
      dto.departureTime !== undefined ||
      dto.recurrence !== undefined ||
      dto.daysOfWeek !== undefined ||
      dto.dayOfMonth !== undefined ||
      dto.startDate !== undefined ||
      dto.endDate !== undefined ||
      dto.generateAheadDays !== undefined;

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.tripTemplate.update({
        where: { id },
        data: {
          originId: merged.originId,
          destinationId: merged.destinationId,
          busTypeId: merged.busTypeId,
          busId: merged.busId,
          price: merged.price,
          departureTime: merged.departureTime,
          recurrence: merged.recurrence,
          daysOfWeek: merged.daysOfWeek,
          dayOfMonth: merged.dayOfMonth,
          startDate: dateOnlyToUtcMidnight(merged.startDate),
          endDate: merged.endDate ? dateOnlyToUtcMidnight(merged.endDate) : null,
          generateAheadDays: merged.generateAheadDays,
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });

      const unbookedFutureFilter = {
        templateId: id,
        departAt: { gt: now },
        status: { in: [TripStatus.OPEN, TripStatus.SCHEDULED] },
        bookings: { none: { status: 'CONFIRMED' as const } },
      };

      if (scheduleChanged) {
        // Delete only future unbooked trips so booked trips stay completely preserved (REQ-SCHD-08, BR-4)
        await tx.trip.deleteMany({ where: unbookedFutureFilter });
      } else {
        // Apply updated route/bus/price strictly to future unbooked trips (BR-4)
        await tx.trip.updateMany({
          where: unbookedFutureFilter,
          data: {
            originId: merged.originId,
            destinationId: merged.destinationId,
            busTypeId: merged.busTypeId,
            busId: merged.busId,
            price: merged.price,
          },
        });
      }

      await this.auditLogsService.log(
        {
          userId: adminUserId,
          action: 'TEMPLATE_UPDATE',
          entity: 'TripTemplate',
          entityId: id,
          details: {
            scheduleChanged,
            updatedFields: dto,
          },
        },
        tx,
      );
    });

    let regenerated = 0;
    const isActive = dto.isActive ?? existing.isActive;
    if (scheduleChanged && isActive) {
      regenerated = await this.generateTripsForTemplate(id, adminUserId);
    }

    const updated = await this.findOne(id);
    return {
      ...updated,
      regeneratedTripsCount: regenerated,
    };
  }

  async toggle(id: number, adminUserId: number) {
    const existing = await this.prisma.tripTemplate.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        'قالب الرحلات المجدولة غير موجود',
      );
    }

    const nextActive = !existing.isActive;
    await this.prisma.$transaction(async (tx) => {
      await tx.tripTemplate.update({
        where: { id },
        data: { isActive: nextActive },
      });
      await this.auditLogsService.log(
        {
          userId: adminUserId,
          action: 'TEMPLATE_TOGGLE',
          entity: 'TripTemplate',
          entityId: id,
          details: { isActive: nextActive },
        },
        tx,
      );
    });

    let generated = 0;
    if (nextActive) {
      generated = await this.generateTripsForTemplate(id, adminUserId);
    }

    const full = await this.findOne(id);
    return {
      ...full,
      generatedTripsCount: generated,
    };
  }

  async remove(id: number, adminUserId: number) {
    const existing = await this.prisma.tripTemplate.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        'قالب الرحلات المجدولة غير موجود',
      );
    }

    const now = new Date();
    const deletedUnbooked = await this.prisma.$transaction(async (tx) => {
      const removedTrips = await tx.trip.deleteMany({
        where: {
          templateId: id,
          departAt: { gt: now },
          bookings: { none: {} },
        },
      });

      // Any trips with bookings remain intact and get templateId = NULL via FK SetNull (REQ-SCHD-09)
      await tx.tripTemplate.delete({ where: { id } });

      await this.auditLogsService.log(
        {
          userId: adminUserId,
          action: 'TEMPLATE_DELETE',
          entity: 'TripTemplate',
          entityId: id,
          details: { deletedUnbookedFutureTrips: removedTrips.count },
        },
        tx,
      );

      return removedTrips.count;
    });

    return {
      deleted: true,
      id,
      deletedUnbookedFutureTrips: deletedUnbooked,
    };
  }

  async addExclusion(
    templateId: number,
    dto: AddExclusionDto,
    adminUserId: number,
  ) {
    const template = await this.prisma.tripTemplate.findUnique({
      where: { id: templateId },
    });
    if (!template) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        'قالب الرحلات المجدولة غير موجود',
      );
    }

    const excludedDate = dateOnlyToUtcMidnight(dto.excludedDate);
    const dayStartUtc = damascusDateAndTimeToUtc(dto.excludedDate, '00:00');
    const dayEndUtc = new Date(dayStartUtc.getTime() + 24 * 60 * 60 * 1000 - 1);

    const exclusion = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.templateExclusion.upsert({
        where: {
          templateId_excludedDate: {
            templateId,
            excludedDate,
          },
        },
        update: { reason: dto.reason?.trim() || null },
        create: {
          templateId,
          excludedDate,
          reason: dto.reason?.trim() || null,
        },
      });

      await tx.trip.deleteMany({
        where: {
          templateId,
          departAt: { gte: dayStartUtc, lte: dayEndUtc, gt: new Date() },
          bookings: { none: { status: 'CONFIRMED' } },
        },
      });

      await this.auditLogsService.log(
        {
          userId: adminUserId,
          action: 'TEMPLATE_EXCLUSION_ADD',
          entity: 'TripTemplate',
          entityId: templateId,
          details: { excludedDate: dto.excludedDate, reason: dto.reason ?? null },
        },
        tx,
      );

      return saved;
    });

    return {
      id: exclusion.id,
      templateId: exclusion.templateId,
      excludedDate: utcDateToDateOnlyString(exclusion.excludedDate),
      reason: exclusion.reason,
    };
  }

  async removeExclusion(
    templateId: number,
    exclusionId: number,
    adminUserId: number,
  ) {
    const exclusion = await this.prisma.templateExclusion.findFirst({
      where: { id: exclusionId, templateId },
    });
    if (!exclusion) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        'تاريخ الاستثناء غير موجود',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.templateExclusion.delete({ where: { id: exclusionId } });
      await this.auditLogsService.log(
        {
          userId: adminUserId,
          action: 'TEMPLATE_EXCLUSION_REMOVE',
          entity: 'TripTemplate',
          entityId: templateId,
          details: {
            exclusionId,
            excludedDate: utcDateToDateOnlyString(exclusion.excludedDate),
          },
        },
        tx,
      );
    });

    return { deleted: true, id: exclusionId };
  }

  async generateTripsForTemplate(
    templateId: number,
    actorUserId?: number,
  ): Promise<number> {
    const template = await this.prisma.tripTemplate.findUnique({
      where: { id: templateId },
      include: { exclusions: true },
    });

    if (!template || !template.isActive) {
      return 0;
    }

    const excludedDates = new Set(
      template.exclusions.map((e) => utcDateToDateOnlyString(e.excludedDate)),
    );

    const slots = this.computeCandidateSlots({
      departureTime: template.departureTime,
      recurrence: template.recurrence,
      daysOfWeek: template.daysOfWeek,
      dayOfMonth: template.dayOfMonth,
      startDate: utcDateToDateOnlyString(template.startDate),
      endDate: template.endDate
        ? utcDateToDateOnlyString(template.endDate)
        : null,
      generateAheadDays: template.generateAheadDays,
      excludedDates,
    });

    if (slots.length === 0) {
      return 0;
    }

    // Translates to PostgreSQL INSERT ... ON CONFLICT DO NOTHING on UNIQUE(template_id, depart_at) (REQ-SCHD-06)
    const result = await this.prisma.trip.createMany({
      data: slots.map((slot) => ({
        templateId: template.id,
        originId: template.originId,
        destinationId: template.destinationId,
        busTypeId: template.busTypeId,
        busId: template.busId,
        departAt: slot.departAtUtc,
        price: template.price,
        status: TripStatus.OPEN,
        createdById: actorUserId ?? template.createdById ?? null,
      })),
      skipDuplicates: true,
    });

    return result.count;
  }

  async runGeneratorForAllActiveTemplates(
    actorUserId?: number,
  ): Promise<GeneratorBatchSummary> {
    const templates = await this.prisma.tripTemplate.findMany({
      where: { isActive: true },
      select: { id: true },
    });

    let createdTrips = 0;
    const errors: Array<{ templateId: number; message: string }> = [];

    for (const tpl of templates) {
      try {
        const count = await this.generateTripsForTemplate(tpl.id, actorUserId);
        createdTrips += count;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unknown generation error';
        this.logger.error(
          `Template generation failed for templateId=${tpl.id}: ${message}`,
        );
        errors.push({ templateId: tpl.id, message });
      }
    }

    return {
      processedTemplates: templates.length,
      createdTrips,
      errors,
    };
  }

  computeCandidateSlots(params: {
    departureTime: string;
    recurrence: RecurrenceType;
    daysOfWeek: number[];
    dayOfMonth: number | null;
    startDate: string;
    endDate: string | null;
    generateAheadDays: number;
    excludedDates: Set<string>;
    now?: Date;
  }): CandidateTripSlot[] {
    const now = params.now ?? new Date();
    const todayDamascus = formatDamascusDate(now);
    const windowEnd = addDaysToDateString(
      todayDamascus,
      params.generateAheadDays,
    );

    const effectiveStart =
      params.startDate > todayDamascus ? params.startDate : todayDamascus;
    const effectiveEnd =
      params.endDate && params.endDate < windowEnd ? params.endDate : windowEnd;

    if (effectiveStart > effectiveEnd) {
      return [];
    }

    const slots: CandidateTripSlot[] = [];
    let cursor = effectiveStart;

    for (let guard = 0; guard < 400 && cursor <= effectiveEnd; guard += 1) {
      if (!params.excludedDates.has(cursor)) {
        const [year, month, day] = cursor
          .split('-')
          .map((n) => Number.parseInt(n, 10));
        const dayOfWeek = new Date(
          Date.UTC(year, month - 1, day),
        ).getUTCDay();

        let matches = false;
        if (params.recurrence === RecurrenceType.DAILY) {
          matches = true;
        } else if (params.recurrence === RecurrenceType.WEEKLY) {
          matches = params.daysOfWeek.includes(dayOfWeek);
        } else if (params.recurrence === RecurrenceType.MONTHLY) {
          const targetDay = clampDayOfMonth(
            year,
            month,
            params.dayOfMonth ?? 1,
          );
          matches = day === targetDay;
        }

        if (matches) {
          const departAtUtc = damascusDateAndTimeToUtc(
            cursor,
            params.departureTime,
          );
          if (departAtUtc > now) {
            slots.push({
              date: cursor,
              time: params.departureTime,
              dayNameAr: ARABIC_WEEKDAYS[dayOfWeek],
              departAtUtc,
            });
          }
        }
      }

      cursor = addDaysToDateString(cursor, 1);
    }

    return slots;
  }

  private async validateTemplateParams(dto: {
    originId: number;
    destinationId: number;
    busTypeId: number;
    busId?: number;
    recurrence: RecurrenceType;
    daysOfWeek?: number[];
    dayOfMonth?: number;
    startDate: string;
    endDate?: string | null;
  }): Promise<void> {
    if (dto.originId === dto.destinationId) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCodes.INVALID_TRIP_ROUTE,
        'مدينة الانطلاق يجب أن تختلف عن مدينة الوجهة',
      );
    }

    if (dto.endDate && dto.endDate < dto.startDate) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCodes.VALIDATION_ERROR,
        'تاريخ النهاية يجب أن يكون مساوياً أو بعد تاريخ البداية',
      );
    }

    if (
      dto.recurrence === RecurrenceType.WEEKLY &&
      (!dto.daysOfWeek || dto.daysOfWeek.length === 0)
    ) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCodes.VALIDATION_ERROR,
        'يجب اختيار يوم واحد على الأقل للتكرار الأسبوعي',
      );
    }

    if (dto.recurrence === RecurrenceType.MONTHLY && !dto.dayOfMonth) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCodes.VALIDATION_ERROR,
        'يجب تحديد يوم الشهر للتكرار الشهري',
      );
    }

    const [origin, destination, busType] = await Promise.all([
      this.prisma.city.findUnique({ where: { id: dto.originId } }),
      this.prisma.city.findUnique({ where: { id: dto.destinationId } }),
      this.prisma.busType.findUnique({ where: { id: dto.busTypeId } }),
    ]);

    if (!origin || !origin.isActive) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCodes.NOT_FOUND,
        'مدينة الانطلاق غير موجودة أو معطّلة',
      );
    }
    if (!destination || !destination.isActive) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCodes.NOT_FOUND,
        'مدينة الوجهة غير موجودة أو معطّلة',
      );
    }
    if (!busType || !busType.isActive) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCodes.NOT_FOUND,
        'نوع الباص غير موجود أو غير فعّال',
      );
    }

    if (dto.busId !== undefined) {
      const bus = await this.prisma.bus.findUnique({
        where: { id: dto.busId },
      });
      if (!bus || !bus.isActive || bus.busTypeId !== dto.busTypeId) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          ErrorCodes.VALIDATION_ERROR,
          'الباص المحدد غير موجود أو غير متطابق مع نوع الباص',
        );
      }
    }
  }

  private formatTemplate(t: {
    id: number;
    originId: number;
    destinationId: number;
    busTypeId: number;
    busId: number | null;
    price: any;
    departureTime: string;
    recurrence: RecurrenceType;
    daysOfWeek: number[];
    dayOfMonth: number | null;
    startDate: Date;
    endDate: Date | null;
    generateAheadDays: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    origin: unknown;
    destination: unknown;
    busType: unknown;
    bus: unknown;
    exclusions: Array<{ id: number; excludedDate: Date; reason: string | null }>;
    _count?: { trips: number };
  }) {
    return {
      id: t.id,
      origin: t.origin,
      destination: t.destination,
      busType: t.busType,
      bus: t.bus,
      price: Number(t.price),
      departureTime: t.departureTime,
      recurrence: t.recurrence,
      daysOfWeek: t.daysOfWeek,
      dayOfMonth: t.dayOfMonth,
      startDate: utcDateToDateOnlyString(t.startDate),
      endDate: t.endDate ? utcDateToDateOnlyString(t.endDate) : null,
      generateAheadDays: t.generateAheadDays,
      isActive: t.isActive,
      upcomingTripsCount: t._count?.trips ?? 0,
      exclusions: t.exclusions.map((e) => ({
        id: e.id,
        excludedDate: utcDateToDateOnlyString(e.excludedDate),
        reason: e.reason,
      })),
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    };
  }
}

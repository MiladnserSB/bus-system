import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ErrorCodes } from '../../common/constants/error-codes.js';
import { AppException } from '../../common/exceptions/app.exception.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { CreateBusDto, QueryBusesDto, UpdateBusDto } from './dto/bus.dto.js';

@Injectable()
export class BusesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async findAll(query: QueryBusesDto) {
    return this.prisma.bus.findMany({
      where: {
        ...(query.includeInactive ? {} : { isActive: true }),
        ...(query.busTypeId ? { busTypeId: query.busTypeId } : {}),
      },
      include: { busType: true },
      orderBy: { id: 'asc' },
    });
  }

  async findOne(id: number) {
    const bus = await this.prisma.bus.findUnique({
      where: { id },
      include: { busType: true },
    });
    if (!bus) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        'الباص غير موجود',
      );
    }
    return bus;
  }

  async create(dto: CreateBusDto, adminUserId: number) {
    const plateNumber = dto.plateNumber.trim();
    const dup = await this.prisma.bus.findUnique({ where: { plateNumber } });
    if (dup) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCodes.DUPLICATE_PLATE_NUMBER,
        'رقم اللوحة مسجّل مسبقاً',
      );
    }

    const busType = await this.prisma.busType.findUnique({
      where: { id: dto.busTypeId },
    });
    if (!busType) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        'نوع الباص غير موجود',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.bus.create({
        data: {
          plateNumber,
          busTypeId: dto.busTypeId,
          isActive: dto.isActive ?? true,
        },
        include: { busType: true },
      });

      await this.auditLogsService.log(
        {
          userId: adminUserId,
          action: 'BUS_CREATE',
          entity: 'Bus',
          entityId: created.id,
          details: { plateNumber: created.plateNumber, busTypeId: created.busTypeId },
        },
        tx,
      );

      return created;
    });
  }

  async update(id: number, dto: UpdateBusDto, adminUserId: number) {
    const existing = await this.findOne(id);
    const plateNumber =
      dto.plateNumber !== undefined
        ? dto.plateNumber.trim()
        : existing.plateNumber;

    if (dto.plateNumber !== undefined) {
      const dup = await this.prisma.bus.findFirst({
        where: { plateNumber, id: { not: id } },
      });
      if (dup) {
        throw new AppException(
          HttpStatus.CONFLICT,
          ErrorCodes.DUPLICATE_PLATE_NUMBER,
          'رقم اللوحة مسجّل مسبقاً',
        );
      }
    }

    if (dto.busTypeId !== undefined) {
      const busType = await this.prisma.busType.findUnique({
        where: { id: dto.busTypeId },
      });
      if (!busType) {
        throw new AppException(
          HttpStatus.NOT_FOUND,
          ErrorCodes.NOT_FOUND,
          'نوع الباص غير موجود',
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.bus.update({
        where: { id },
        data: {
          plateNumber,
          ...(dto.busTypeId !== undefined ? { busTypeId: dto.busTypeId } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
        include: { busType: true },
      });

      await this.auditLogsService.log(
        {
          userId: adminUserId,
          action: 'BUS_UPDATE',
          entity: 'Bus',
          entityId: id,
          details: { before: existing, after: updated },
        },
        tx,
      );

      return updated;
    });
  }

  async remove(id: number, adminUserId: number) {
    const existing = await this.findOne(id);
    const [tripLinks, templateLinks] = await Promise.all([
      this.prisma.trip.count({ where: { busId: id } }),
      this.prisma.tripTemplate.count({ where: { busId: id } }),
    ]);

    if (tripLinks > 0 || templateLinks > 0) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCodes.RESOURCE_IN_USE,
        'لا يمكن حذف باص مرتبط برحلات أو قوالب، يمكنك تعطيله بدلاً من ذلك',
        { tripLinks, templateLinks },
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.bus.delete({ where: { id } });
      await this.auditLogsService.log(
        {
          userId: adminUserId,
          action: 'BUS_DELETE',
          entity: 'Bus',
          entityId: id,
          details: { plateNumber: existing.plateNumber },
        },
        tx,
      );
    });

    return { deleted: true, id };
  }
}

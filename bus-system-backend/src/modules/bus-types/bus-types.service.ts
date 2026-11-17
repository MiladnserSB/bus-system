import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ErrorCodes } from '../../common/constants/error-codes.js';
import { AppException } from '../../common/exceptions/app.exception.js';
import { generateSeatTemplates } from '../../common/helpers/seat-layout.helper.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import {
  CreateBusTypeDto,
  QueryBusTypesDto,
  UpdateBusTypeDto,
} from './dto/bus-type.dto.js';

@Injectable()
export class BusTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async findAll(query: QueryBusTypesDto) {
    return this.prisma.busType.findMany({
      where: query.includeInactive ? {} : { isActive: true },
      orderBy: [{ totalSeats: 'desc' }, { id: 'asc' }],
    });
  }

  async findOne(id: number) {
    const busType = await this.prisma.busType.findUnique({ where: { id } });
    if (!busType) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        'نوع الباص غير موجود',
      );
    }
    return busType;
  }

  async getLayout(id: number) {
    const busType = await this.findOne(id);
    const seats = await this.prisma.seatTemplate.findMany({
      where: { busTypeId: id },
      orderBy: [{ rowNumber: 'asc' }, { colIndex: 'asc' }],
    });

    return {
      busType,
      totalSeats: seats.length,
      seats,
    };
  }

  async create(dto: CreateBusTypeDto, adminUserId: number) {
    const hasExtraBackSeat = dto.hasExtraBackSeat ?? false;
    const generated = generateSeatTemplates({
      category: dto.category,
      layout: dto.layout,
      rowsCount: dto.rowsCount,
      hasExtraBackSeat,
      expectedTotalSeats: dto.totalSeats,
    });

    const code = dto.code.trim().toUpperCase();
    const nameAr = dto.nameAr.trim();

    const dup = await this.prisma.busType.findFirst({
      where: { OR: [{ code }, { nameAr }] },
    });
    if (dup) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCodes.DUPLICATE_ENTRY,
        'نوع الباص مسجّل مسبقاً بنفس الرمز أو الاسم',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.busType.create({
        data: {
          code,
          nameAr,
          nameEn: dto.nameEn?.trim() || null,
          category: dto.category,
          size: dto.size,
          layout: dto.layout.trim(),
          rowsCount: dto.rowsCount,
          hasExtraBackSeat,
          totalSeats: generated.length,
          isActive: true,
        },
      });

      await tx.seatTemplate.createMany({
        data: generated.map((s) => ({
          busTypeId: created.id,
          seatNumber: s.seatNumber,
          rowNumber: s.rowNumber,
          colLetter: s.colLetter,
          side: s.side,
          colIndex: s.colIndex,
          isExtra: s.isExtra,
        })),
      });

      await this.auditLogsService.log(
        {
          userId: adminUserId,
          action: 'BUS_TYPE_CREATE',
          entity: 'BusType',
          entityId: created.id,
          details: {
            code: created.code,
            layout: created.layout,
            rowsCount: created.rowsCount,
            totalSeats: created.totalSeats,
          },
        },
        tx,
      );

      return created;
    });
  }

  async update(id: number, dto: UpdateBusTypeDto, adminUserId: number) {
    const existing = await this.findOne(id);
    const nameAr = dto.nameAr !== undefined ? dto.nameAr.trim() : existing.nameAr;

    if (dto.nameAr !== undefined) {
      const dup = await this.prisma.busType.findFirst({
        where: { nameAr, id: { not: id } },
      });
      if (dup) {
        throw new AppException(
          HttpStatus.CONFLICT,
          ErrorCodes.DUPLICATE_ENTRY,
          'اسم نوع الباص مسجّل مسبقاً',
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.busType.update({
        where: { id },
        data: {
          nameAr,
          ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn.trim() || null } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });

      await this.auditLogsService.log(
        {
          userId: adminUserId,
          action: 'BUS_TYPE_UPDATE',
          entity: 'BusType',
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

    const [busLinks, tripLinks, templateLinks] = await Promise.all([
      this.prisma.bus.count({ where: { busTypeId: id } }),
      this.prisma.trip.count({ where: { busTypeId: id } }),
      this.prisma.tripTemplate.count({ where: { busTypeId: id } }),
    ]);

    if (busLinks > 0 || tripLinks > 0 || templateLinks > 0) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCodes.RESOURCE_IN_USE,
        'لا يمكن حذف نوع باص مرتبط بباصات أو رحلات، يمكنك تعطيله بدلاً من ذلك',
        { busLinks, tripLinks, templateLinks },
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.busType.delete({ where: { id } });
      await this.auditLogsService.log(
        {
          userId: adminUserId,
          action: 'BUS_TYPE_DELETE',
          entity: 'BusType',
          entityId: id,
          details: { code: existing.code },
        },
        tx,
      );
    });

    return { deleted: true, id };
  }
}

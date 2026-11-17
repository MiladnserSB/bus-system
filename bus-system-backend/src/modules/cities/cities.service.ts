import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ErrorCodes } from '../../common/constants/error-codes.js';
import { AppException } from '../../common/exceptions/app.exception.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { CreateCityDto, QueryCitiesDto, UpdateCityDto } from './dto/city.dto.js';

@Injectable()
export class CitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async findAll(query: QueryCitiesDto) {
    return this.prisma.city.findMany({
      where: query.includeInactive ? {} : { isActive: true },
      orderBy: { id: 'asc' },
    });
  }

  async findOne(id: number) {
    const city = await this.prisma.city.findUnique({ where: { id } });
    if (!city) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        'المدينة غير موجودة',
      );
    }
    return city;
  }

  async create(dto: CreateCityDto, adminUserId: number) {
    const nameAr = dto.nameAr.trim();
    const nameEn = dto.nameEn?.trim() || null;

    await this.ensureUniqueNames(nameAr, nameEn);

    return this.prisma.$transaction(async (tx) => {
      const city = await tx.city.create({
        data: {
          nameAr,
          nameEn,
          isActive: dto.isActive ?? true,
        },
      });

      await this.auditLogsService.log(
        {
          userId: adminUserId,
          action: 'CITY_CREATE',
          entity: 'City',
          entityId: city.id,
          details: { nameAr: city.nameAr, nameEn: city.nameEn },
        },
        tx,
      );

      return city;
    });
  }

  async update(id: number, dto: UpdateCityDto, adminUserId: number) {
    const existing = await this.findOne(id);
    const nameAr = dto.nameAr !== undefined ? dto.nameAr.trim() : existing.nameAr;
    const nameEn =
      dto.nameEn !== undefined ? dto.nameEn.trim() || null : existing.nameEn;

    await this.ensureUniqueNames(nameAr, nameEn, id);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.city.update({
        where: { id },
        data: {
          nameAr,
          nameEn,
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });

      await this.auditLogsService.log(
        {
          userId: adminUserId,
          action: 'CITY_UPDATE',
          entity: 'City',
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
      this.prisma.trip.count({
        where: { OR: [{ originId: id }, { destinationId: id }] },
      }),
      this.prisma.tripTemplate.count({
        where: { OR: [{ originId: id }, { destinationId: id }] },
      }),
    ]);

    if (tripLinks > 0 || templateLinks > 0) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCodes.RESOURCE_IN_USE,
        'لا يمكن حذف مدينة مرتبطة برحلات أو قوالب، يمكنك تعطيلها بدلاً من ذلك',
        { tripLinks, templateLinks },
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.city.delete({ where: { id } });
      await this.auditLogsService.log(
        {
          userId: adminUserId,
          action: 'CITY_DELETE',
          entity: 'City',
          entityId: id,
          details: { nameAr: existing.nameAr },
        },
        tx,
      );
    });

    return { deleted: true, id };
  }

  private async ensureUniqueNames(
    nameAr: string,
    nameEn: string | null,
    excludeId?: number,
  ): Promise<void> {
    const dupAr = await this.prisma.city.findFirst({
      where: {
        nameAr,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (dupAr) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCodes.DUPLICATE_ENTRY,
        'اسم المدينة بالعربية مسجّل مسبقاً',
      );
    }

    if (nameEn) {
      const dupEn = await this.prisma.city.findFirst({
        where: {
          nameEn: { equals: nameEn, mode: 'insensitive' },
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
      });
      if (dupEn) {
        throw new AppException(
          HttpStatus.CONFLICT,
          ErrorCodes.DUPLICATE_ENTRY,
          'اسم المدينة بالإنجليزية مسجّل مسبقاً',
        );
      }
    }
  }
}

import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TripStatus } from '../../../generated/prisma/enums.js';

export class CreateTripDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  originId: number;

  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  destinationId: number;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  busTypeId: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  busId?: number;

  @ApiProperty({ example: 45000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: 'سعر المقعد يجب أن يكون أكبر من صفر' })
  price: number;

  @ApiPropertyOptional({
    description: 'موعد الانطلاق بصيغة ISO UTC',
    example: '2026-12-01T05:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  departAt?: string;

  @ApiPropertyOptional({
    description: 'تاريخ الانطلاق بتوقيت دمشق (بديل عن departAt)',
    example: '2026-12-01',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'صيغة التاريخ يجب أن تكون YYYY-MM-DD',
  })
  departDate?: string;

  @ApiPropertyOptional({
    description: 'ساعة الانطلاق بتوقيت دمشق 24h (بديل عن departAt)',
    example: '08:00',
  })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'صيغة الساعة يجب أن تكون HH:mm',
  })
  departTime?: string;

  @ApiPropertyOptional({
    enum: [TripStatus.OPEN, TripStatus.SCHEDULED],
    default: TripStatus.OPEN,
  })
  @IsOptional()
  @IsEnum(TripStatus)
  status?: TripStatus;

  @ApiPropertyOptional({
    description: 'تأكيد إنشاء رحلة مطابقة عند التنبيه بوجود رحلة مماثلة (REQ-TRIP-03)',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  confirmDuplicate?: boolean = false;
}

export class UpdateTripDto {
  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  originId?: number;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  destinationId?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  busTypeId?: number;

  @ApiPropertyOptional({ example: 1, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  busId?: number | null;

  @ApiPropertyOptional({ example: 50000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: 'سعر المقعد يجب أن يكون أكبر من صفر' })
  price?: number;

  @ApiPropertyOptional({ example: '2026-12-01T06:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  departAt?: string;

  @ApiPropertyOptional({ example: '2026-12-01' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  departDate?: string;

  @ApiPropertyOptional({ example: '09:00' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  departTime?: string;

  @ApiPropertyOptional({ enum: TripStatus })
  @IsOptional()
  @IsEnum(TripStatus)
  status?: TripStatus;
}

export class CancelTripDto {
  @ApiPropertyOptional({ example: 'ظروف تشغيلية طارئة' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class QueryTripsDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  originId?: number;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  destinationId?: number;

  @ApiPropertyOptional({
    description: 'التاريخ بتوقيت دمشق YYYY-MM-DD',
    example: '2026-12-01',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  busTypeId?: number;

  @ApiPropertyOptional({ enum: TripStatus })
  @IsOptional()
  @IsEnum(TripStatus)
  status?: TripStatus;

  @ApiPropertyOptional({ example: 10000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ example: 200000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({
    description: 'تضمين الرحلات الماضية (افتراضي false يعرض القادمة فقط)',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includePast?: boolean = false;

  @ApiPropertyOptional({ enum: ['departAt', 'price'], default: 'departAt' })
  @IsOptional()
  @IsString()
  sortBy?: 'departAt' | 'price' = 'departAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc' = 'asc';

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

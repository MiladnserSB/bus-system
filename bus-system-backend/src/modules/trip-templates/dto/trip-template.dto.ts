import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
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
import { RecurrenceType } from '../../../generated/prisma/enums.js';

export class CreateTripTemplateDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  originId: number;

  @ApiProperty({ example: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  destinationId: number;

  @ApiProperty({ example: 3 })
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

  @ApiProperty({ example: 40000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: 'سعر المقعد يجب أن يكون أكبر من صفر' })
  price: number;

  @ApiProperty({ example: '07:30' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'صيغة ساعة الانطلاق يجب أن تكون HH:mm',
  })
  departureTime: string;

  @ApiProperty({ enum: RecurrenceType, example: RecurrenceType.WEEKLY })
  @IsEnum(RecurrenceType)
  recurrence: RecurrenceType;

  @ApiPropertyOptional({
    description: 'أيام الأسبوع (0=الأحد .. 6=السبت) للتكرار الأسبوعي',
    example: [0, 3, 6],
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  daysOfWeek?: number[];

  @ApiPropertyOptional({
    description: 'يوم الشهر (1..31) للتكرار الشهري',
    example: 15,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  dayOfMonth?: number;

  @ApiProperty({ example: '2026-12-01' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'تاريخ البداية يجب أن يكون بصيغة YYYY-MM-DD',
  })
  startDate: string;

  @ApiPropertyOptional({
    description: 'تاريخ النهاية أو null لـ بلا نهاية',
    example: '2027-01-31',
    nullable: true,
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'تاريخ النهاية يجب أن يكون بصيغة YYYY-MM-DD',
  })
  endDate?: string | null;

  @ApiPropertyOptional({
    description: 'نافذة التوليد المسبق بالأيام (افتراضي من الإعدادات = 30)',
    example: 30,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  generateAheadDays?: number;

  @ApiPropertyOptional({
    description: 'تواريخ استثناء (عطل) أولية',
    example: ['2026-12-25'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { each: true })
  exclusionDates?: string[];
}

export class UpdateTripTemplateDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  originId?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  destinationId?: number;

  @ApiPropertyOptional({ example: 3 })
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

  @ApiPropertyOptional({ example: 42000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  price?: number;

  @ApiPropertyOptional({ example: '08:00' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  departureTime?: string;

  @ApiPropertyOptional({ enum: RecurrenceType })
  @IsOptional()
  @IsEnum(RecurrenceType)
  recurrence?: RecurrenceType;

  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  daysOfWeek?: number[];

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  dayOfMonth?: number | null;

  @ApiPropertyOptional({ example: '2026-12-01' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  generateAheadDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AddExclusionDto {
  @ApiProperty({ example: '2026-12-25' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'تاريخ الاستثناء يجب أن يكون بصيغة YYYY-MM-DD',
  })
  excludedDate: string;

  @ApiPropertyOptional({ example: 'عطلة رسمية' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class PreviewTemplateDto extends CreateTripTemplateDto {}

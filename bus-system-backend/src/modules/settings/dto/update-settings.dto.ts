import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSettingsDto {
  @ApiPropertyOptional({
    description: 'مهلة الإلغاء بالساعات قبل الانطلاق (افتراضي 3)',
    example: 3,
    minimum: 0,
    maximum: 168,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(168)
  cancellationDeadlineHours?: number;

  @ApiPropertyOptional({
    description: 'إغلاق الحجز قبل الانطلاق بالدقائق (افتراضي 60)',
    example: 60,
    minimum: 0,
    maximum: 1440,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1440)
  bookingCutoffMinutes?: number;

  @ApiPropertyOptional({
    description: 'الحد الأقصى للمقاعد في الحجز الواحد (افتراضي 6)',
    example: 6,
    minimum: 1,
    maximum: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  maxSeatsPerBooking?: number;

  @ApiPropertyOptional({
    description: 'مدة القفل المؤقت للمقعد بالدقائق (افتراضي 5)',
    example: 5,
    minimum: 1,
    maximum: 60,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  seatHoldTtlMinutes?: number;

  @ApiPropertyOptional({
    description: 'مدة التوليد المسبق للرحلات المجدولة بالأيام (افتراضي 30)',
    example: 30,
    minimum: 1,
    maximum: 365,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  templateGenerateAheadDays?: number;

  @ApiPropertyOptional({
    description: 'المدة بالساعات لتحويل الرحلة إلى منتهية تلقائياً (افتراضي 12)',
    example: 12,
    minimum: 1,
    maximum: 72,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(72)
  tripAutoCompleteHours?: number;

  @ApiPropertyOptional({
    description: 'مدد التذكير قبل الانطلاق بالساعات مفصولة بفاصلة',
    example: '24,3',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\s*,\s*\d+)*$/, {
    message: 'صيغة مدد التذكير يجب أن تكون أرقاماً مفصولة بفاصلة مثل 24,3',
  })
  reminderHoursBefore?: string;
}

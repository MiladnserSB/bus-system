import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingStatus, PaymentMethod } from '../../../generated/prisma/enums.js';

export class PassengerSeatInputDto {
  @ApiProperty({ example: '5A' })
  @IsString()
  @IsNotEmpty({ message: 'رقم المقعد مطلوب' })
  @MaxLength(10)
  seatNumber: string;

  @ApiProperty({ example: 'محمد العلي' })
  @IsString()
  @IsNotEmpty({ message: 'اسم الراكب مطلوب' })
  @MaxLength(120)
  passengerName: string;

  @ApiProperty({ example: '+963944123456' })
  @IsString()
  @IsNotEmpty({ message: 'رقم هاتف الراكب مطلوب' })
  @MaxLength(20)
  passengerPhone: string;
}

export class CreateBookingDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  tripId: number;

  @ApiProperty({ type: [PassengerSeatInputDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'يجب اختيار مقعد واحد على الأقل' })
  @ValidateNested({ each: true })
  @Type(() => PassengerSeatInputDto)
  passengers: PassengerSeatInputDto[];

  @ApiPropertyOptional({
    description: 'معرّف القفل المؤقت إن وُجد',
  })
  @IsOptional()
  @IsString()
  holdId?: string;

  @ApiPropertyOptional({
    description: 'معرّف جلسة الضيف عند الحجز دون حساب',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  guestSessionId?: string;

  @ApiPropertyOptional({ example: 'محمد العلي' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactName?: string;

  @ApiPropertyOptional({ example: '+963944123456' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  contactPhone?: string;

  @ApiPropertyOptional({
    enum: PaymentMethod,
    default: PaymentMethod.CASH_ON_BOARDING,
  })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({
    description: 'مفتاح عدم التكرار (أو عبر ترويسة Idempotency-Key)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}

export class CancelBookingDto {
  @ApiPropertyOptional({ example: 'تغيير خطة السفر' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class UpdatePassengerItemDto {
  @ApiProperty({ example: '5A' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  seatNumber: string;

  @ApiPropertyOptional({ example: 'ليلى العلي' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  passengerName?: string;

  @ApiPropertyOptional({ example: '+963944555666' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  passengerPhone?: string;
}

export class UpdateBookingPassengersDto {
  @ApiProperty({ type: [UpdatePassengerItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdatePassengerItemDto)
  passengers: UpdatePassengerItemDto[];
}

export class QueryBookingsDto {
  @ApiPropertyOptional({ example: 'BK-20261117-0001' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ example: '+963944123456' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  tripId?: number;

  @ApiPropertyOptional({
    description: 'تاريخ الحجز بتوقيت دمشق YYYY-MM-DD',
    example: '2026-11-17',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @ApiPropertyOptional({ enum: BookingStatus })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

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

export class QueryMyBookingsDto {
  @ApiPropertyOptional({
    enum: ['upcoming', 'past', 'cancelled', 'all'],
    default: 'all',
  })
  @IsOptional()
  @IsString()
  tab?: 'upcoming' | 'past' | 'cancelled' | 'all' = 'all';
}

export class DateRangeDto {
  @IsOptional()
  @IsDateString()
  from?: string;
}

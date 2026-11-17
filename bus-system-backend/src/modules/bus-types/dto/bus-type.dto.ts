import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BusCategory, BusSize } from '../../../generated/prisma/enums.js';

export class CreateBusTypeDto {
  @ApiProperty({ example: 'VIP_MEDIUM' })
  @IsString()
  @IsNotEmpty({ message: 'رمز نوع الباص مطلوب' })
  @MaxLength(50)
  code: string;

  @ApiProperty({ example: 'درجة أولى مطوّرة' })
  @IsString()
  @IsNotEmpty({ message: 'الاسم بالعربية مطلوب' })
  @MaxLength(120)
  nameAr: string;

  @ApiPropertyOptional({ example: 'First Class Plus' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nameEn?: string;

  @ApiProperty({ enum: BusCategory, example: BusCategory.FIRST_CLASS })
  @IsEnum(BusCategory)
  category: BusCategory;

  @ApiProperty({ enum: BusSize, example: BusSize.MEDIUM })
  @IsEnum(BusSize)
  size: BusSize;

  @ApiProperty({ example: '2+1' })
  @IsString()
  @Matches(/^\d+\+\d+$/, { message: 'صيغة التخطيط غير صالحة (مثل 2+2 أو 2+1)' })
  layout: string;

  @ApiProperty({ example: 9, minimum: 1, maximum: 30 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  rowsCount: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  hasExtraBackSeat?: boolean = false;

  @ApiPropertyOptional({
    description: 'العدد الكلي المتوقع للمقاعد للتحقق من صحة التوليد (REQ-DATA-05)',
    example: 27,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  totalSeats?: number;
}

export class UpdateBusTypeDto {
  @ApiPropertyOptional({ example: 'عادية 2+2 كبير' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nameAr?: string;

  @ApiPropertyOptional({ example: 'Standard 2+2 Large' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nameEn?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class QueryBusTypesDto {
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeInactive?: boolean = false;
}

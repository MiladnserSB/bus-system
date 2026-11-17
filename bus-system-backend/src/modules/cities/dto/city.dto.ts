import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateCityDto {
  @ApiProperty({ example: 'دمشق' })
  @IsString()
  @IsNotEmpty({ message: 'اسم المدينة بالعربية مطلوب' })
  @MaxLength(100)
  nameAr: string;

  @ApiPropertyOptional({ example: 'Damascus' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nameEn?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;
}

export class UpdateCityDto extends PartialType(CreateCityDto) {}

export class QueryCitiesDto {
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeInactive?: boolean = false;
}

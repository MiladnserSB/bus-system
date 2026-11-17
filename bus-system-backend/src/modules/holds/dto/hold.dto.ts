import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateHoldDto {
  @ApiPropertyOptional({
    description: 'رقم مقعد واحد (مثال: 5A)',
    example: '5A',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  seatNumber?: string;

  @ApiPropertyOptional({
    description: 'قائمة أرقام المقاعد لقفلها معاً',
    example: ['5A', '5B'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  seatNumbers?: string[];

  @ApiPropertyOptional({
    description: 'معرف جلسة الضيف عند الحجز دون حساب (REQ-AUTH-06)',
    example: 'guest-abc-123',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  guestSessionId?: string;
}

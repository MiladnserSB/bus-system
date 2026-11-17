import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '../../../generated/prisma/enums.js';

export class CreateUserDto {
  @ApiProperty({ example: 'سارة الأحمد' })
  @IsString()
  @IsNotEmpty({ message: 'الاسم مطلوب' })
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 'sara.rec' })
  @IsString()
  @IsNotEmpty({ message: 'اسم المستخدم مطلوب' })
  @MaxLength(60)
  username: string;

  @ApiPropertyOptional({ example: 'sara@masar-bus.sy' })
  @IsOptional()
  @IsEmail({}, { message: 'البريد الإلكتروني غير صالح' })
  @MaxLength(160)
  email?: string;

  @ApiProperty({ example: '+963944111222' })
  @IsString()
  @IsNotEmpty({ message: 'رقم الهاتف مطلوب' })
  phone: string;

  @ApiProperty({
    description: 'كلمة المرور المؤقتة (8 أحرف على الأقل)',
    example: 'Temp@1234',
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: 'كلمة المرور يجب ألا تقل عن 8 أحرف' })
  password: string;

  @ApiPropertyOptional({
    enum: [Role.RECEPTIONIST, Role.ADMIN],
    default: Role.RECEPTIONIST,
  })
  @IsOptional()
  @IsEnum(Role)
  role?: Role = Role.RECEPTIONIST;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'سارة الأحمد' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: 'sara.rec' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  username?: string;

  @ApiPropertyOptional({ example: 'sara@masar-bus.sy' })
  @IsOptional()
  @IsEmail({}, { message: 'البريد الإلكتروني غير صالح' })
  @MaxLength(160)
  email?: string;

  @ApiPropertyOptional({ example: '+963944111222' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ enum: [Role.RECEPTIONIST, Role.ADMIN] })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}

export class UpdateUserStatusDto {
  @ApiProperty({ example: false })
  @IsBoolean()
  isActive: boolean;
}

export class ResetPasswordDto {
  @ApiProperty({
    description: 'كلمة المرور المؤقتة الجديدة (8 أحرف على الأقل)',
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: 'كلمة المرور المؤقتة يجب ألا تقل عن 8 أحرف' })
  temporaryPassword: string;
}

export class QueryUsersDto {
  @ApiPropertyOptional({ enum: Role })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}

export class UpdateProfileDto {
  @ApiProperty({ example: 'أحمد خالد الحسن' })
  @IsString()
  @IsNotEmpty({ message: 'الاسم مطلوب' })
  @MaxLength(120)
  name: string;
}

export class RequestPhoneChangeOtpDto {
  @ApiProperty({ example: '+963944999888' })
  @IsString()
  @IsNotEmpty({ message: 'رقم الهاتف الجديد مطلوب' })
  newPhone: string;
}

export class VerifyPhoneChangeOtpDto {
  @ApiProperty({ example: '+963944999888' })
  @IsString()
  @IsNotEmpty({ message: 'رقم الهاتف الجديد مطلوب' })
  newPhone: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @IsNotEmpty({ message: 'رمز التحقق مطلوب' })
  code: string;
}

import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StaffLoginDto {
  @ApiPropertyOptional({
    description: 'اسم المستخدم أو البريد الإلكتروني',
    example: 'admin',
  })
  @IsOptional()
  @IsString()
  identifier?: string;

  @ApiPropertyOptional({
    description: 'اسم المستخدم (بديل لحقل identifier)',
    example: 'admin',
  })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({
    description: 'البريد الإلكتروني (بديل لحقل identifier)',
    example: 'admin@masar-bus.sy',
  })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiProperty({ example: 'Admin@123456' })
  @IsString()
  @IsNotEmpty({ message: 'كلمة المرور مطلوبة' })
  password: string;
}

export class RequestOtpDto {
  @ApiProperty({
    description: 'رقم الهاتف السوري',
    example: '+963944123456',
  })
  @IsString()
  @IsNotEmpty({ message: 'رقم الهاتف مطلوب' })
  phone: string;
}

export class VerifyOtpDto {
  @ApiProperty({ example: '+963944123456' })
  @IsString()
  @IsNotEmpty({ message: 'رقم الهاتف مطلوب' })
  phone: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @IsNotEmpty({ message: 'رمز التحقق مطلوب' })
  code: string;

  @ApiPropertyOptional({
    description: 'اسم الزبون عند التسجيل لأول مرة',
    example: 'أحمد العلي',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: 'موافقة الزبون على معالجة بيانات الاتصال (القسم 6.3)',
    example: true,
  })
  @IsOptional()
  consentAccepted?: boolean;
}

export class PhoneLoginDto {
  @ApiProperty({
    description: 'رقم الهاتف السوري للدخول المباشر (وضع الديمو)',
    example: '+963932111222',
  })
  @IsString()
  @IsNotEmpty({ message: 'رقم الهاتف مطلوب' })
  phone: string;

  @ApiPropertyOptional({
    description: 'اسم الزبون عند التسجيل لأول مرة',
    example: 'رامي الدمشقي',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: 'موافقة الزبون على معالجة بيانات الاتصال',
    example: true,
  })
  @IsOptional()
  consentAccepted?: boolean;
}

export class RefreshTokenDto {
  @ApiProperty({ description: 'رمز التحديث (Refresh Token)' })
  @IsString()
  @IsNotEmpty({ message: 'رمز التحديث مطلوب' })
  refreshToken: string;
}

export class LogoutDto {
  @ApiPropertyOptional({ description: 'رمز التحديث لإلغائه' })
  @IsOptional()
  @IsString()
  refreshToken?: string;

  @ApiPropertyOptional({ description: 'رمز جهاز FCM لإلغاء تسجيله عند الخروج' })
  @IsOptional()
  @IsString()
  fcmToken?: string;
}

export class ChangePasswordDto {
  @ApiProperty({ description: 'كلمة المرور الحالية' })
  @IsString()
  @IsNotEmpty({ message: 'كلمة المرور الحالية مطلوبة' })
  currentPassword: string;

  @ApiProperty({
    description: 'كلمة المرور الجديدة (8 أحرف على الأقل)',
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: 'كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف' })
  newPassword: string;
}

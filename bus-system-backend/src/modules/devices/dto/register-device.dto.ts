import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { DevicePlatform } from '../../../generated/prisma/enums.js';

export class RegisterDeviceDto {
  @ApiProperty({
    description: 'رمز جهاز Firebase Cloud Messaging',
    example: 'fcm-token-example-xyz',
  })
  @IsString()
  @IsNotEmpty({ message: 'رمز الجهاز مطلوب' })
  @MaxLength(512)
  fcmToken: string;

  @ApiProperty({
    enum: DevicePlatform,
    default: DevicePlatform.ANDROID,
  })
  @IsEnum(DevicePlatform, { message: 'منصة الجهاز غير صالحة' })
  platform: DevicePlatform = DevicePlatform.ANDROID;
}

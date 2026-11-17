import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AllowPasswordChangePending } from '../../common/decorators/allow-password-change-pending.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.type.js';
import {
  RequestPhoneChangeOtpDto,
  UpdateProfileDto,
  VerifyPhoneChangeOtpDto,
} from './dto/user.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('Profile')
@ApiBearerAuth()
@Controller('me')
export class ProfileController {
  constructor(private readonly usersService: UsersService) {}

  @AllowPasswordChangePending()
  @Get()
  @ApiOperation({ summary: 'جلب بيانات الملف الشخصي للمستخدم الحالي' })
  getProfile(@CurrentUser() user: AuthUser) {
    return this.usersService.getProfile(user.id);
  }

  @Patch()
  @ApiOperation({ summary: 'تعديل الاسم في الملف الشخصي' })
  updateProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(user.id, dto);
  }

  @Post('phone/request-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'طلب OTP لتغيير رقم الهاتف' })
  requestPhoneChangeOtp(
    @CurrentUser() user: AuthUser,
    @Body() dto: RequestPhoneChangeOtpDto,
  ) {
    return this.usersService.requestPhoneChangeOtp(user.id, dto);
  }

  @Post('phone/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'تأكيد تغيير رقم الهاتف برمز OTP' })
  verifyPhoneChangeOtp(
    @CurrentUser() user: AuthUser,
    @Body() dto: VerifyPhoneChangeOtpDto,
  ) {
    return this.usersService.verifyPhoneChangeOtp(user.id, dto);
  }
}

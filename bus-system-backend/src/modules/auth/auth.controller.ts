import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AllowPasswordChangePending } from '../../common/decorators/allow-password-change-pending.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.type.js';
import { AuthService } from './auth.service.js';
import {
  ChangePasswordDto,
  LogoutDto,
  PhoneLoginDto,
  RefreshTokenDto,
  RequestOtpDto,
  StaffLoginDto,
  VerifyOtpDto,
} from './dto/auth.dto.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'تسجيل دخول المدير وموظف الاستقبال' })
  staffLogin(@Body() dto: StaffLoginDto) {
    return this.authService.staffLogin(dto);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'طلب رمز تحقق OTP عبر SMS للزبون' })
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.authService.requestOtp(dto);
  }

  @Public()
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'التحقق من OTP وتسجيل الدخول أو إنشاء حساب زبون' })
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('phone-login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'تسجيل دخول مباشر برقم الهاتف بدون OTP (مؤقتاً للديمو والاختبار)',
  })
  phoneLogin(@Body() dto: PhoneLoginDto) {
    return this.authService.phoneLogin(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'تحديث Access Token باستخدام Refresh Token' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  @ApiBearerAuth()
  @AllowPasswordChangePending()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'تسجيل الخروج وإلغاء التوكن ورمز الجهاز' })
  logout(@CurrentUser() user: AuthUser, @Body() dto: LogoutDto) {
    return this.authService.logout(user.id, dto);
  }

  @ApiBearerAuth()
  @AllowPasswordChangePending()
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'تغيير كلمة المرور للموظف أو المدير' })
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user.id, dto);
  }
}

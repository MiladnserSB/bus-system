import { Body, Controller, Delete, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/enums.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.type.js';
import { DevicesService } from './devices.service.js';
import { RegisterDeviceDto } from './dto/register-device.dto.js';

@ApiTags('Devices')
@ApiBearerAuth()
@Roles(Role.CUSTOMER)
@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Post()
  @ApiOperation({ summary: 'تسجيل رمز جهاز FCM للإشعارات (للزبون)' })
  register(@CurrentUser() user: AuthUser, @Body() dto: RegisterDeviceDto) {
    return this.devicesService.registerDevice(user.id, dto);
  }

  @Delete(':fcmToken')
  @ApiOperation({ summary: 'إلغاء تسجيل رمز جهاز FCM (للزبون)' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('fcmToken') fcmToken: string,
  ) {
    await this.devicesService.deactivateDevice(user.id, fcmToken);
    return { deactivated: true };
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RegisterDeviceDto } from './dto/register-device.dto.js';

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  async registerDevice(userId: number, dto: RegisterDeviceDto) {
    return this.prisma.userDevice.upsert({
      where: { fcmToken: dto.fcmToken },
      update: {
        userId,
        platform: dto.platform,
        isActive: true,
        lastSeenAt: new Date(),
      },
      create: {
        userId,
        fcmToken: dto.fcmToken,
        platform: dto.platform,
        isActive: true,
      },
    });
  }

  async deactivateDevice(userId: number, fcmToken: string): Promise<void> {
    await this.prisma.userDevice.updateMany({
      where: { userId, fcmToken },
      data: { isActive: false },
    });
  }

  async deactivateAllForUser(userId: number): Promise<void> {
    await this.prisma.userDevice.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    });
  }
}

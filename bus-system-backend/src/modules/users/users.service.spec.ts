import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '../../generated/prisma/enums.js';
import { UsersService } from './users.service.js';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: any;
  let redis: any;
  let auditLogsService: any;
  let devicesService: any;
  let notificationsService: any;

  beforeEach(() => {
    prisma = {
      user: {
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn().mockResolvedValue({ id: 2, role: Role.RECEPTIONIST }),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue({ id: 2, isActive: false }),
      },
      refreshToken: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
      $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => cb(prisma)),
    };
    redis = { client: { ttl: vi.fn(), get: vi.fn(), set: vi.fn(), del: vi.fn() } };
    auditLogsService = { log: vi.fn().mockResolvedValue(undefined) };
    devicesService = { deactivateAllForUser: vi.fn().mockResolvedValue(undefined) };
    notificationsService = { sendOtpSms: vi.fn().mockResolvedValue(undefined) };

    service = new UsersService(
      prisma,
      redis,
      new ConfigService({ otpHmacSecret: 'secret' }),
      auditLogsService,
      devicesService,
      notificationsService,
    );
  });

  it('immediately revokes sessions and increments tokenVersion when disabling staff (REQ-AUTH-12)', async () => {
    await service.updateStatus(2, { isActive: false }, 1);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isActive: false,
          tokenVersion: { increment: 1 },
        }),
      }),
    );
    expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
    expect(devicesService.deactivateAllForUser).toHaveBeenCalledWith(2);
  });

  it('forces mustChangePassword=true on admin password reset (REQ-AUTH-08)', async () => {
    await service.resetPassword(2, { temporaryPassword: 'NewTemp@123' }, 1);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mustChangePassword: true,
          tokenVersion: { increment: 1 },
        }),
      }),
    );
  });
});

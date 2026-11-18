import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '../../generated/prisma/enums.js';
import { ErrorCodes } from '../../common/constants/error-codes.js';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: any;
  let redis: any;
  let jwtService: any;
  let configService: any;
  let auditLogsService: any;
  let notificationsService: any;
  let devicesService: any;

  beforeEach(() => {
    prisma = {
      user: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      refreshToken: {
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => cb(prisma)),
    };

    redis = {
      client: {
        ttl: vi.fn().mockResolvedValue(-2),
        get: vi.fn(),
        set: vi.fn().mockResolvedValue('OK'),
        del: vi.fn().mockResolvedValue(1),
      },
      incrWithWindow: vi.fn().mockResolvedValue(1),
    };

    jwtService = {
      signAsync: vi.fn().mockResolvedValue('signed-access-jwt'),
    };

    configService = new ConfigService({
      jwtAccessSecret: 'test-access-secret-32-chars-minimum',
      jwtRefreshExpiresDays: 7,
      otpHmacSecret: 'test-otp-secret-32-chars-minimum',
      rateLimitOtpHourlyMax: 5,
    });

    auditLogsService = { log: vi.fn().mockResolvedValue(undefined) };
    notificationsService = { sendOtpSms: vi.fn().mockResolvedValue(undefined) };
    devicesService = {
      deactivateDevice: vi.fn().mockResolvedValue(undefined),
      deactivateAllForUser: vi.fn().mockResolvedValue(undefined),
    };

    service = new AuthService(
      prisma,
      redis,
      jwtService,
      configService,
      auditLogsService,
      notificationsService,
      devicesService,
    );
  });

  it('logs in staff with valid credentials and returns access + refresh tokens', async () => {
    const hash = await argon2.hash('Secret@123');
    prisma.user.findFirst.mockResolvedValue({
      id: 1,
      name: 'Admin',
      username: 'admin',
      email: 'admin@masar-bus.sy',
      phone: '+963900000001',
      passwordHash: hash,
      role: Role.ADMIN,
      isActive: true,
      mustChangePassword: false,
      failedLoginAttempts: 0,
      lockedUntil: null,
      tokenVersion: 0,
    });
    prisma.refreshToken.create.mockResolvedValue({ id: 1 });

    const result = await service.staffLogin({
      identifier: 'admin',
      password: 'Secret@123',
    });

    expect(result.accessToken).toBe('signed-access-jwt');
    expect(result.refreshToken).toBeTruthy();
    expect(result.expiresInSeconds).toBe(900);
    expect(result.user.role).toBe(Role.ADMIN);
  });

  it('locks staff account for 15 minutes and writes audit log on 5th failed login (REQ-AUTH-04)', async () => {
    const hash = await argon2.hash('Correct@123');
    prisma.user.findFirst.mockResolvedValue({
      id: 2,
      name: 'Rec',
      username: 'rec1',
      email: null,
      phone: '+963900000002',
      passwordHash: hash,
      role: Role.RECEPTIONIST,
      isActive: true,
      mustChangePassword: false,
      failedLoginAttempts: 4,
      lockedUntil: null,
      tokenVersion: 0,
    });
    prisma.user.update.mockResolvedValue({});

    await expect(
      service.staffLogin({ identifier: 'rec1', password: 'WrongPassword' }),
    ).rejects.toMatchObject({
      code: ErrorCodes.ACCOUNT_LOCKED,
    });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 2 },
        data: expect.objectContaining({
          failedLoginAttempts: 5,
          lockedUntil: expect.any(Date),
        }),
      }),
    );
    expect(auditLogsService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ACCOUNT_LOCKED', entityId: 2 }),
    );
  });

  it('enforces OTP resend cooldown and hourly limit (REQ-AUTH-05, SEC-05)', async () => {
    redis.client.ttl.mockResolvedValueOnce(45);
    await expect(service.requestOtp({ phone: '0944123456' })).rejects.toMatchObject({
      code: ErrorCodes.OTP_COOLDOWN,
    });

    redis.client.ttl.mockResolvedValueOnce(-2);
    redis.incrWithWindow.mockResolvedValueOnce(6);
    await expect(service.requestOtp({ phone: '0944123456' })).rejects.toMatchObject({
      code: ErrorCodes.OTP_RATE_LIMIT,
    });
  });

  it('stores hashed OTP, enforces 3 max verification attempts, and creates new customer on valid OTP', async () => {
    const phone = '+963944123456';
    const validHash = service.hashOtp(phone, '654321');
    redis.client.get.mockResolvedValue(
      JSON.stringify({ hash: validHash, attempts: 2 }),
    );

    await expect(
      service.verifyOtp({ phone: '0944123456', code: '000000' }),
    ).rejects.toMatchObject({ code: ErrorCodes.OTP_MAX_ATTEMPTS });
    expect(redis.client.del).toHaveBeenCalledWith(`otp:code:${phone}`);

    redis.client.get.mockResolvedValueOnce(
      JSON.stringify({ hash: validHash, attempts: 0 }),
    );
    prisma.user.findUnique.mockResolvedValueOnce(null);
    prisma.user.create.mockResolvedValueOnce({
      id: 10,
      name: 'مسافر جديد',
      username: null,
      email: null,
      phone,
      role: Role.CUSTOMER,
      isActive: true,
      mustChangePassword: false,
      tokenVersion: 0,
    });
    prisma.refreshToken.create.mockResolvedValueOnce({ id: 2 });

    const verified = await service.verifyOtp({
      phone: '0944123456',
      code: '654321',
      name: 'مسافر جديد',
    });

    expect(verified.user.id).toBe(10);
    expect(verified.accessToken).toBe('signed-access-jwt');
  });

  it('signs in or registers customer directly via phoneLogin without OTP', async () => {
    const phone = '+963932111222';
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 11,
      name: 'رامي الدمشقي',
      username: null,
      email: null,
      phone,
      role: Role.CUSTOMER,
      isActive: true,
      mustChangePassword: false,
      tokenVersion: 0,
    });
    prisma.refreshToken.create.mockResolvedValueOnce({ id: 3 });

    const session = await service.phoneLogin({
      phone: '0932111222',
      consentAccepted: true,
    });
    expect(session.user.id).toBe(11);
    expect(session.user.role).toBe(Role.CUSTOMER);
    expect(session.accessToken).toBe('signed-access-jwt');
  });

  it('rotates refresh tokens and revokes on logout', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 5,
      userId: 1,
      tokenHash: 'old',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      user: {
        id: 1,
        name: 'Admin',
        username: 'admin',
        email: null,
        phone: '+963900000001',
        role: Role.ADMIN,
        isActive: true,
        mustChangePassword: false,
        tokenVersion: 0,
      },
    });

    const refreshed = await service.refresh({ refreshToken: 'raw-token' });
    expect(refreshed.accessToken).toBe('signed-access-jwt');
    expect(prisma.refreshToken.update).toHaveBeenCalled();
    expect(prisma.refreshToken.create).toHaveBeenCalled();

    await service.logout(1, { fcmToken: 'fcm-1' });
    expect(devicesService.deactivateDevice).toHaveBeenCalledWith(1, 'fcm-1');
  });
});

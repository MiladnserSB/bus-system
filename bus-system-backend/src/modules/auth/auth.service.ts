import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { Role } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RedisService } from '../../redis/redis.service.js';
import { ErrorCodes } from '../../common/constants/error-codes.js';
import { AppException } from '../../common/exceptions/app.exception.js';
import { normalizePhone } from '../../common/helpers/phone.helper.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { DevicesService } from '../devices/devices.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  ChangePasswordDto,
  LogoutDto,
  PhoneLoginDto,
  RefreshTokenDto,
  RequestOtpDto,
  StaffLoginDto,
  VerifyOtpDto,
} from './dto/auth.dto.js';

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 15;
const OTP_TTL_SECONDS = 300;
const OTP_COOLDOWN_SECONDS = 60;
const OTP_MAX_ATTEMPTS = 3;

interface StoredOtpPayload {
  hash: string;
  attempts: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditLogsService: AuditLogsService,
    private readonly notificationsService: NotificationsService,
    private readonly devicesService: DevicesService,
  ) {}

  async staffLogin(dto: StaffLoginDto) {
    const loginIdentifier = (
      dto.identifier ??
      dto.username ??
      dto.email ??
      ''
    ).trim();

    if (!loginIdentifier) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCodes.VALIDATION_ERROR,
        'يرجى إدخال اسم المستخدم أو البريد الإلكتروني',
      );
    }

    const user = await this.prisma.user.findFirst({
      where: {
        role: { in: [Role.ADMIN, Role.RECEPTIONIST] },
        OR: [{ username: loginIdentifier }, { email: loginIdentifier }],
      },
    });

    if (!user || !user.passwordHash) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        ErrorCodes.INVALID_CREDENTIALS,
        'بيانات الدخول غير صحيحة',
      );
    }

    if (!user.isActive) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        ErrorCodes.ACCOUNT_DISABLED,
        'تم تعطيل هذا الحساب، يرجى مراجعة الإدارة',
      );
    }

    const now = new Date();
    if (user.lockedUntil && user.lockedUntil > now) {
      const remainingMinutes = Math.ceil(
        (user.lockedUntil.getTime() - now.getTime()) / 60_000,
      );
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        ErrorCodes.ACCOUNT_LOCKED,
        `تم قفل الحساب مؤقتاً بسبب محاولات دخول فاشلة متكررة. حاول بعد ${remainingMinutes} دقيقة`,
        { lockedUntil: user.lockedUntil.toISOString() },
      );
    }

    const passwordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordValid) {
      const nextAttempts =
        user.lockedUntil && user.lockedUntil <= now
          ? 1
          : user.failedLoginAttempts + 1;
      const shouldLock = nextAttempts >= MAX_FAILED_LOGIN_ATTEMPTS;
      const lockedUntil = shouldLock
        ? new Date(now.getTime() + LOCK_DURATION_MINUTES * 60_000)
        : null;

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: nextAttempts,
          lockedUntil,
        },
      });

      if (shouldLock) {
        await this.auditLogsService.log({
          userId: user.id,
          action: 'ACCOUNT_LOCKED',
          entity: 'User',
          entityId: user.id,
          details: {
            reason: '5 consecutive failed login attempts',
            lockedUntil: lockedUntil?.toISOString(),
          },
        });
        throw new AppException(
          HttpStatus.TOO_MANY_REQUESTS,
          ErrorCodes.ACCOUNT_LOCKED,
          'تم قفل الحساب لمدة 15 دقيقة بعد 5 محاوالت دخول خاطئة متتالية',
          { lockedUntil: lockedUntil?.toISOString() },
        );
      }

      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        ErrorCodes.INVALID_CREDENTIALS,
        'بيانات الدخول غير صحيحة',
      );
    }

    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    return this.issueSession(user);
  }

  async requestOtp(dto: RequestOtpDto) {
    const phone = normalizePhone(dto.phone);
    const maxHourly =
      this.configService.get<number>('rateLimitOtpHourlyMax') ?? 5;

    const cooldownKey = `otp:cooldown:${phone}`;
    const cooldownTtl = await this.redis.client.ttl(cooldownKey);
    if (cooldownTtl > 0) {
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        ErrorCodes.OTP_COOLDOWN,
        `يرجى الانتظار ${cooldownTtl} ثانية قبل إعادة إرسال الرمز`,
        { retryAfterSeconds: cooldownTtl },
      );
    }

    const hourlyKey = `otp:hourly:${phone}`;
    const hourlyCount = await this.redis.incrWithWindow(hourlyKey, 3600);
    if (hourlyCount > maxHourly) {
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        ErrorCodes.OTP_RATE_LIMIT,
        'تجاوزت الحد المسموح لطلبات رمز التحقق في الساعة، يرجى المحاولة لاحقاً',
        { limitPerHour: maxHourly },
      );
    }

    const code = String(randomInt(100000, 1000000));
    const hash = this.hashOtp(phone, code);
    const payload: StoredOtpPayload = { hash, attempts: 0 };

    await this.redis.client.set(
      `otp:code:${phone}`,
      JSON.stringify(payload),
      'EX',
      OTP_TTL_SECONDS,
    );
    await this.redis.client.set(cooldownKey, '1', 'EX', OTP_COOLDOWN_SECONDS);

    await this.notificationsService.sendOtpSms(phone, code);

    return {
      sent: true,
      expiresInSeconds: OTP_TTL_SECONDS,
      resendAfterSeconds: OTP_COOLDOWN_SECONDS,
      message: 'تم إرسال رمز التحقق إلى رقم هاتفك',
    };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const phone = normalizePhone(dto.phone);
    const codeKey = `otp:code:${phone}`;
    const raw = await this.redis.client.get(codeKey);

    if (!raw) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCodes.OTP_EXPIRED,
        'انتهت صلاحية رمز التحقق أو لم يتم طلبه',
      );
    }

    const stored = JSON.parse(raw) as StoredOtpPayload;
    const candidateHash = this.hashOtp(phone, dto.code.trim());
    const matches = timingSafeEqual(
      Buffer.from(stored.hash, 'hex'),
      Buffer.from(candidateHash, 'hex'),
    );

    if (!matches) {
      const nextAttempts = stored.attempts + 1;
      if (nextAttempts >= OTP_MAX_ATTEMPTS) {
        await this.redis.client.del(codeKey);
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          ErrorCodes.OTP_MAX_ATTEMPTS,
          'تم استنفاد المحاولات المسموحة للرمز، يرجى طلب رمز جديد',
        );
      }

      const remainingTtl = await this.redis.client.ttl(codeKey);
      await this.redis.client.set(
        codeKey,
        JSON.stringify({ hash: stored.hash, attempts: nextAttempts }),
        'EX',
        remainingTtl > 0 ? remainingTtl : OTP_TTL_SECONDS,
      );

      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCodes.OTP_INVALID,
        'رمز التحقق غير صحيح',
        { remainingAttempts: OTP_MAX_ATTEMPTS - nextAttempts },
      );
    }

    await this.redis.client.del(codeKey);
    return this.upsertCustomerAndIssueSession(
      phone,
      dto.name,
      dto.consentAccepted,
    );
  }

  /**
   * Direct customer sign-in by phone number without OTP (temporarily enabled for
   * demo filming & testing).
   */
  async phoneLogin(dto: PhoneLoginDto) {
    const phone = normalizePhone(dto.phone);
    return this.upsertCustomerAndIssueSession(
      phone,
      dto.name,
      dto.consentAccepted,
    );
  }

  private async upsertCustomerAndIssueSession(
    phone: string,
    name?: string,
    consentAccepted?: boolean,
  ) {
    let user = await this.prisma.user.findUnique({ where: { phone } });
    if (user && !user.isActive) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        ErrorCodes.ACCOUNT_DISABLED,
        'تم تعطيل هذا الحساب',
      );
    }

    if (user && user.role !== Role.CUSTOMER) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ErrorCodes.FORBIDDEN,
        'يرجى تسجيل دخول حسابات الموظفين عبر لوحة الإدارة',
      );
    }

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          name: name?.trim() || 'مسافر',
          phone,
          role: Role.CUSTOMER,
          isActive: true,
          mustChangePassword: false,
          consentAcceptedAt: consentAccepted ? new Date() : null,
        },
      });
    } else if (name && name.trim() && user.name === 'مسافر') {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          name: name.trim(),
          ...(consentAccepted && !user.consentAcceptedAt
            ? { consentAcceptedAt: new Date() }
            : {}),
        },
      });
    }

    return this.issueSession(user);
  }

  async refresh(dto: RefreshTokenDto) {
    const tokenHash = this.hashRefreshToken(dto.refreshToken);
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    const now = new Date();
    if (
      !existing ||
      existing.revokedAt !== null ||
      existing.expiresAt <= now
    ) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        ErrorCodes.INVALID_REFRESH_TOKEN,
        'رمز التحديث غير صالح أو منتهي الصلاحية',
      );
    }

    if (!existing.user.isActive) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        ErrorCodes.ACCOUNT_DISABLED,
        'تم تعطيل هذا الحساب',
      );
    }

    const newRefreshPlain = this.generateRefreshTokenValue();
    const newRefreshHash = this.hashRefreshToken(newRefreshPlain);
    const expiresDays =
      this.configService.get<number>('jwtRefreshExpiresDays') ?? 7;
    const expiresAt = new Date(Date.now() + expiresDays * 86_400_000);

    await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: now },
      });
      await tx.refreshToken.create({
        data: {
          userId: existing.user.id,
          tokenHash: newRefreshHash,
          expiresAt,
        },
      });
    });

    const accessToken = await this.signAccessToken(existing.user);

    return {
      accessToken,
      refreshToken: newRefreshPlain,
      expiresInSeconds: 900,
      user: this.sanitizeUser(existing.user),
    };
  }

  async logout(userId: number, dto: LogoutDto) {
    const now = new Date();
    if (dto.refreshToken) {
      const tokenHash = this.hashRefreshToken(dto.refreshToken);
      await this.prisma.refreshToken.updateMany({
        where: { userId, tokenHash, revokedAt: null },
        data: { revokedAt: now },
      });
    } else {
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });
    }

    if (dto.fcmToken) {
      await this.devicesService.deactivateDevice(userId, dto.fcmToken);
    } else {
      await this.devicesService.deactivateAllForUser(userId);
    }

    return { loggedOut: true };
  }

  async changePassword(userId: number, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.passwordHash) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCodes.INVALID_CURRENT_PASSWORD,
        'هذا الحساب لا يستخدم كلمة مرور',
      );
    }

    const matches = await argon2.verify(user.passwordHash, dto.currentPassword);
    if (!matches) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCodes.INVALID_CURRENT_PASSWORD,
        'كلمة المرور الحالية غير صحيحة',
      );
    }

    const newHash = await argon2.hash(dto.newPassword);
    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.user.update({
        where: { id: userId },
        data: {
          passwordHash: newHash,
          mustChangePassword: false,
          tokenVersion: { increment: 1 },
        },
      });

      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await this.auditLogsService.log(
        {
          userId,
          action: 'PASSWORD_CHANGED',
          entity: 'User',
          entityId: userId,
          details: {},
        },
        tx,
      );

      return saved;
    });

    return this.issueSession(updated);
  }

  hashOtp(phone: string, code: string): string {
    const secret =
      this.configService.get<string>('otpHmacSecret') ??
      this.configService.get<string>('OTP_HMAC_SECRET') ??
      'dev-otp-hmac-secret-replace-in-production-32chars';
    return createHmac('sha256', secret)
      .update(`${phone}:${code}`)
      .digest('hex');
  }

  private async issueSession(user: {
    id: number;
    name: string;
    username: string | null;
    email: string | null;
    phone: string;
    role: Role;
    mustChangePassword: boolean;
    tokenVersion: number;
  }) {
    const accessToken = await this.signAccessToken(user);
    const refreshToken = this.generateRefreshTokenValue();
    const refreshHash = this.hashRefreshToken(refreshToken);
    const expiresDays =
      this.configService.get<number>('jwtRefreshExpiresDays') ?? 7;

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: refreshHash,
        expiresAt: new Date(Date.now() + expiresDays * 86_400_000),
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresInSeconds: 900,
      user: this.sanitizeUser(user),
    };
  }

  private async signAccessToken(user: {
    id: number;
    role: Role;
    tokenVersion: number;
  }): Promise<string> {
    return this.jwtService.signAsync(
      {
        sub: user.id,
        role: user.role,
        tokenVersion: user.tokenVersion,
        type: 'access',
      },
      {
        secret: this.configService.get<string>('jwtAccessSecret') ??
          this.configService.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: '15m',
      },
    );
  }

  private generateRefreshTokenValue(): string {
    return randomBytes(48).toString('base64url');
  }

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private sanitizeUser(user: {
    id: number;
    name: string;
    username: string | null;
    email: string | null;
    phone: string;
    role: Role;
    mustChangePassword: boolean;
  }) {
    return {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      phone: user.phone,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    };
  }
}

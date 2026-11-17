import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { Prisma } from '../../generated/prisma/client.js';
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
  CreateUserDto,
  QueryUsersDto,
  RequestPhoneChangeOtpDto,
  ResetPasswordDto,
  UpdateProfileDto,
  UpdateUserDto,
  UpdateUserStatusDto,
  VerifyPhoneChangeOtpDto,
} from './dto/user.dto.js';

const USER_PUBLIC_SELECT = {
  id: true,
  name: true,
  username: true,
  email: true,
  phone: true,
  role: true,
  isActive: true,
  mustChangePassword: true,
  lockedUntil: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
    private readonly auditLogsService: AuditLogsService,
    private readonly devicesService: DevicesService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async findAll(query: QueryUsersDto) {
    const where: Prisma.UserWhereInput = {};
    if (query.role) {
      where.role = query.role;
    }
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }
    if (query.search?.trim()) {
      const q = query.search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { username: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
      ];
    }

    return this.prisma.user.findMany({
      where,
      select: USER_PUBLIC_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: USER_PUBLIC_SELECT,
    });
    if (!user) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        'المستخدم غير موجود',
      );
    }
    return user;
  }

  async create(dto: CreateUserDto, adminUserId: number) {
    if (dto.role === Role.CUSTOMER) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCodes.VALIDATION_ERROR,
        'حسابات الزبائن تُنشأ عبر OTP ولا تُنشأ من لوحة الموظفين',
      );
    }

    const phone = normalizePhone(dto.phone);
    const passwordHash = await argon2.hash(dto.password);
    const role = dto.role ?? Role.RECEPTIONIST;

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: dto.name.trim(),
          username: dto.username.trim(),
          email: dto.email?.trim() || null,
          phone,
          passwordHash,
          role,
          isActive: true,
          mustChangePassword: true,
        },
        select: USER_PUBLIC_SELECT,
      });

      await this.auditLogsService.log(
        {
          userId: adminUserId,
          action: 'USER_CREATE',
          entity: 'User',
          entityId: created.id,
          details: { role: created.role, username: created.username },
        },
        tx,
      );

      return created;
    });
  }

  async update(id: number, dto: UpdateUserDto, adminUserId: number) {
    const existing = await this.findOne(id);
    if (dto.role === Role.CUSTOMER) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCodes.VALIDATION_ERROR,
        'لا يمكن تحويل حساب موظف إلى زبون',
      );
    }

    const data: Prisma.UserUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.username !== undefined) data.username = dto.username.trim();
    if (dto.email !== undefined) data.email = dto.email.trim() || null;
    if (dto.phone !== undefined) data.phone = normalizePhone(dto.phone);
    if (dto.role !== undefined) data.role = dto.role;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data,
        select: USER_PUBLIC_SELECT,
      });

      await this.auditLogsService.log(
        {
          userId: adminUserId,
          action: 'USER_UPDATE',
          entity: 'User',
          entityId: id,
          details: { before: existing, after: updated },
        },
        tx,
      );

      return updated;
    });
  }

  async updateStatus(
    id: number,
    dto: UpdateUserStatusDto,
    adminUserId: number,
  ) {
    if (id === adminUserId && !dto.isActive) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCodes.VALIDATION_ERROR,
        'لا يمكنك تعطيل حسابك الشخصي أثناء تسجيل الدخول',
      );
    }

    await this.findOne(id);

    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.user.update({
        where: { id },
        data: {
          isActive: dto.isActive,
          ...(!dto.isActive
            ? { tokenVersion: { increment: 1 } }
            : { failedLoginAttempts: 0, lockedUntil: null }),
        },
        select: USER_PUBLIC_SELECT,
      });

      if (!dto.isActive) {
        await tx.refreshToken.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      await this.auditLogsService.log(
        {
          userId: adminUserId,
          action: 'USER_STATUS_CHANGE',
          entity: 'User',
          entityId: id,
          details: { isActive: dto.isActive },
        },
        tx,
      );

      return saved;
    });

    if (!dto.isActive) {
      await this.devicesService.deactivateAllForUser(id);
    }

    return updated;
  }

  async resetPassword(id: number, dto: ResetPasswordDto, adminUserId: number) {
    await this.findOne(id);
    const passwordHash = await argon2.hash(dto.temporaryPassword);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          passwordHash,
          mustChangePassword: true,
          tokenVersion: { increment: 1 },
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });

      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await this.auditLogsService.log(
        {
          userId: adminUserId,
          action: 'USER_PASSWORD_RESET',
          entity: 'User',
          entityId: id,
          details: { forcedPasswordChange: true },
        },
        tx,
      );
    });

    return {
      reset: true,
      mustChangePassword: true,
      message: 'تمت إعادة تعيين كلمة المرور المؤقتة بنجاح',
    };
  }

  async getProfile(userId: number) {
    return this.findOne(userId);
  }

  async updateProfile(userId: number, dto: UpdateProfileDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { name: dto.name.trim() },
      select: USER_PUBLIC_SELECT,
    });
  }

  async requestPhoneChangeOtp(
    userId: number,
    dto: RequestPhoneChangeOtpDto,
  ) {
    const newPhone = normalizePhone(dto.newPhone);

    const existingOwner = await this.prisma.user.findUnique({
      where: { phone: newPhone },
      select: { id: true },
    });
    if (existingOwner && existingOwner.id !== userId) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCodes.DUPLICATE_ENTRY,
        'رقم الهاتف مستخدم في حساب آخر',
      );
    }

    const cooldownKey = `otp:phone_change:cooldown:${userId}`;
    const ttl = await this.redis.client.ttl(cooldownKey);
    if (ttl > 0) {
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        ErrorCodes.OTP_COOLDOWN,
        `يرجى الانتظار ${ttl} ثانية قبل إعادة إرسال الرمز`,
      );
    }

    const code = String(randomInt(100000, 1000000));
    const hash = this.hashPhoneChangeOtp(userId, newPhone, code);

    await this.redis.client.set(
      `otp:phone_change:${userId}:${newPhone}`,
      JSON.stringify({ hash, attempts: 0 }),
      'EX',
      300,
    );
    await this.redis.client.set(cooldownKey, '1', 'EX', 60);

    await this.notificationsService.sendOtpSms(newPhone, code);

    return {
      sent: true,
      expiresInSeconds: 300,
      message: 'تم إرسال رمز التحقق إلى رقم الهاتف الجديد',
    };
  }

  async verifyPhoneChangeOtp(userId: number, dto: VerifyPhoneChangeOtpDto) {
    const newPhone = normalizePhone(dto.newPhone);
    const key = `otp:phone_change:${userId}:${newPhone}`;
    const raw = await this.redis.client.get(key);

    if (!raw) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCodes.OTP_EXPIRED,
        'انتهت صلاحية رمز التحقق أو لم يتم طلبه',
      );
    }

    const stored = JSON.parse(raw) as { hash: string; attempts: number };
    const candidate = this.hashPhoneChangeOtp(userId, newPhone, dto.code.trim());
    const valid = timingSafeEqual(
      Buffer.from(stored.hash, 'hex'),
      Buffer.from(candidate, 'hex'),
    );

    if (!valid) {
      const nextAttempts = stored.attempts + 1;
      if (nextAttempts >= 3) {
        await this.redis.client.del(key);
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          ErrorCodes.OTP_MAX_ATTEMPTS,
          'تم استنفاد المحاولات المسموحة للرمز',
        );
      }
      const remainingTtl = await this.redis.client.ttl(key);
      await this.redis.client.set(
        key,
        JSON.stringify({ hash: stored.hash, attempts: nextAttempts }),
        'EX',
        remainingTtl > 0 ? remainingTtl : 300,
      );
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCodes.OTP_INVALID,
        'رمز التحقق غير صحيح',
      );
    }

    await this.redis.client.del(key);

    return this.prisma.user.update({
      where: { id: userId },
      data: { phone: newPhone },
      select: USER_PUBLIC_SELECT,
    });
  }

  private hashPhoneChangeOtp(
    userId: number,
    phone: string,
    code: string,
  ): string {
    const secret =
      this.configService.get<string>('otpHmacSecret') ??
      'dev-otp-hmac-secret-replace-in-production-32chars';
    return createHmac('sha256', secret)
      .update(`phone-change:${userId}:${phone}:${code}`)
      .digest('hex');
  }
}

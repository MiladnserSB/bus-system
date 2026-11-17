import { Injectable, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ErrorCodes } from '../../common/constants/error-codes.js';
import { AppException } from '../../common/exceptions/app.exception.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { UpdateSettingsDto } from './dto/update-settings.dto.js';

export interface PolicySettings {
  cancellationDeadlineHours: number;
  bookingCutoffMinutes: number;
  maxSeatsPerBooking: number;
  seatHoldTtlMinutes: number;
  templateGenerateAheadDays: number;
  tripAutoCompleteHours: number;
  reminderHoursBefore: number[];
}

export const SETTING_KEYS = {
  CANCELLATION_DEADLINE_HOURS: 'cancellation_deadline_hours',
  BOOKING_CUTOFF_MINUTES: 'booking_cutoff_minutes',
  MAX_SEATS_PER_BOOKING: 'max_seats_per_booking',
  SEAT_HOLD_TTL_MINUTES: 'seat_hold_ttl_minutes',
  TEMPLATE_GENERATE_AHEAD_DAYS: 'template_generate_ahead_days',
  TRIP_AUTO_COMPLETE_HOURS: 'trip_auto_complete_hours',
  REMINDER_HOURS_BEFORE: 'reminder_hours_before',
} as const;

const POLICY_DEFAULTS: PolicySettings = {
  cancellationDeadlineHours: 3,
  bookingCutoffMinutes: 60,
  maxSeatsPerBooking: 6,
  seatHoldTtlMinutes: 5,
  templateGenerateAheadDays: 30,
  tripAutoCompleteHours: 12,
  reminderHoursBefore: [24, 3],
};

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async getAll() {
    const [policy, rows] = await Promise.all([
      this.getPolicy(),
      this.prisma.setting.findMany({ orderBy: { key: 'asc' } }),
    ]);

    return { policy, items: rows };
  }

  async getPolicy(): Promise<PolicySettings> {
    const rows = await this.prisma.setting.findMany();
    const map = new Map(rows.map((r) => [r.key, r.value]));

    return {
      cancellationDeadlineHours: this.parseIntSetting(
        map.get(SETTING_KEYS.CANCELLATION_DEADLINE_HOURS),
        POLICY_DEFAULTS.cancellationDeadlineHours,
      ),
      bookingCutoffMinutes: this.parseIntSetting(
        map.get(SETTING_KEYS.BOOKING_CUTOFF_MINUTES),
        POLICY_DEFAULTS.bookingCutoffMinutes,
      ),
      maxSeatsPerBooking: this.parseIntSetting(
        map.get(SETTING_KEYS.MAX_SEATS_PER_BOOKING),
        POLICY_DEFAULTS.maxSeatsPerBooking,
      ),
      seatHoldTtlMinutes: this.parseIntSetting(
        map.get(SETTING_KEYS.SEAT_HOLD_TTL_MINUTES),
        POLICY_DEFAULTS.seatHoldTtlMinutes,
      ),
      templateGenerateAheadDays: this.parseIntSetting(
        map.get(SETTING_KEYS.TEMPLATE_GENERATE_AHEAD_DAYS),
        POLICY_DEFAULTS.templateGenerateAheadDays,
      ),
      tripAutoCompleteHours: this.parseIntSetting(
        map.get(SETTING_KEYS.TRIP_AUTO_COMPLETE_HOURS),
        POLICY_DEFAULTS.tripAutoCompleteHours,
      ),
      reminderHoursBefore: this.parseReminderHours(
        map.get(SETTING_KEYS.REMINDER_HOURS_BEFORE),
      ),
    };
  }

  async updateSettings(dto: UpdateSettingsDto, adminUserId: number) {
    const updates: Array<{ key: string; value: string }> = [];

    if (dto.cancellationDeadlineHours !== undefined) {
      updates.push({
        key: SETTING_KEYS.CANCELLATION_DEADLINE_HOURS,
        value: String(dto.cancellationDeadlineHours),
      });
    }
    if (dto.bookingCutoffMinutes !== undefined) {
      updates.push({
        key: SETTING_KEYS.BOOKING_CUTOFF_MINUTES,
        value: String(dto.bookingCutoffMinutes),
      });
    }
    if (dto.maxSeatsPerBooking !== undefined) {
      updates.push({
        key: SETTING_KEYS.MAX_SEATS_PER_BOOKING,
        value: String(dto.maxSeatsPerBooking),
      });
    }
    if (dto.seatHoldTtlMinutes !== undefined) {
      updates.push({
        key: SETTING_KEYS.SEAT_HOLD_TTL_MINUTES,
        value: String(dto.seatHoldTtlMinutes),
      });
    }
    if (dto.templateGenerateAheadDays !== undefined) {
      updates.push({
        key: SETTING_KEYS.TEMPLATE_GENERATE_AHEAD_DAYS,
        value: String(dto.templateGenerateAheadDays),
      });
    }
    if (dto.tripAutoCompleteHours !== undefined) {
      updates.push({
        key: SETTING_KEYS.TRIP_AUTO_COMPLETE_HOURS,
        value: String(dto.tripAutoCompleteHours),
      });
    }
    if (dto.reminderHoursBefore !== undefined) {
      const normalized = dto.reminderHoursBefore
        .split(',')
        .map((n) => Number.parseInt(n.trim(), 10))
        .filter((n) => Number.isInteger(n) && n > 0 && n <= 168);
      if (normalized.length === 0) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          ErrorCodes.VALIDATION_ERROR,
          'يجب تحديد ساعة تذكير واحدة على الأقل بين 1 و168',
        );
      }
      updates.push({
        key: SETTING_KEYS.REMINDER_HOURS_BEFORE,
        value: Array.from(new Set(normalized)).join(','),
      });
    }

    if (updates.length === 0) {
      return this.getAll();
    }

    const previousPolicy = await this.getPolicy();

    await this.prisma.$transaction(async (tx) => {
      for (const item of updates) {
        await tx.setting.upsert({
          where: { key: item.key },
          update: { value: item.value, updatedById: adminUserId },
          create: { key: item.key, value: item.value, updatedById: adminUserId },
        });
      }

      await this.auditLogsService.log(
        {
          userId: adminUserId,
          action: 'SETTINGS_UPDATE',
          entity: 'Setting',
          entityId: 'policy',
          details: {
            previous: previousPolicy,
            changes: updates,
          },
        },
        tx,
      );
    });

    return this.getAll();
  }

  private parseIntSetting(raw: string | undefined, fallback: number): number {
    if (!raw) return fallback;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }

  private parseReminderHours(raw: string | undefined): number[] {
    if (!raw) return POLICY_DEFAULTS.reminderHoursBefore;
    const parsed = raw
      .split(',')
      .map((s) => Number.parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n) && n > 0);
    return parsed.length > 0 ? parsed : POLICY_DEFAULTS.reminderHoursBefore;
  }
}

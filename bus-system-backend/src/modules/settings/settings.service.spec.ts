import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsService } from './settings.service.js';

describe('SettingsService', () => {
  let service: SettingsService;
  let prisma: any;
  let auditLogsService: any;

  beforeEach(() => {
    prisma = {
      setting: {
        findMany: vi.fn().mockResolvedValue([]),
        upsert: vi.fn().mockResolvedValue({}),
      },
      $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => cb(prisma)),
    };
    auditLogsService = { log: vi.fn().mockResolvedValue(undefined) };
    service = new SettingsService(prisma, auditLogsService);
  });

  it('returns SRS default policy settings when table has no overrides', async () => {
    const policy = await service.getPolicy();
    expect(policy.cancellationDeadlineHours).toBe(3);
    expect(policy.bookingCutoffMinutes).toBe(60);
    expect(policy.maxSeatsPerBooking).toBe(6);
    expect(policy.seatHoldTtlMinutes).toBe(5);
    expect(policy.templateGenerateAheadDays).toBe(30);
    expect(policy.tripAutoCompleteHours).toBe(12);
    expect(policy.reminderHoursBefore).toEqual([24, 3]);
  });

  it('updates policy values in transaction and records audit log (REQ-SET-06)', async () => {
    await service.updateSettings(
      { cancellationDeadlineHours: 4, maxSeatsPerBooking: 5 },
      1,
    );
    expect(prisma.setting.upsert).toHaveBeenCalledTimes(2);
    expect(auditLogsService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SETTINGS_UPDATE' }),
      prisma,
    );
  });
});

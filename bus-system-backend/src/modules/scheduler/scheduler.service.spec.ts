import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JobRunStatus, TripStatus } from '../../generated/prisma/enums.js';
import { SchedulerService } from './scheduler.service.js';

describe('SchedulerService', () => {
  let service: SchedulerService;
  let prisma: any;
  let redis: any;
  let configService: ConfigService;
  let settingsService: any;
  let tripTemplatesService: any;
  let notificationsService: any;

  beforeEach(() => {
    prisma = {
      schedulerJobLog: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({ id: 1 }),
        update: vi.fn().mockResolvedValue({ id: 1 }),
      },
      trip: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    redis = {
      client: { scan: vi.fn().mockResolvedValue(['0', []]), get: vi.fn(), del: vi.fn() },
      acquireDistributedLock: vi.fn().mockResolvedValue(true),
      releaseDistributedLock: vi.fn().mockResolvedValue(undefined),
    };

    configService = new ConfigService({
      backupDir: './backups',
      backupRetentionDays: 30,
    });

    settingsService = {
      getPolicy: vi.fn().mockResolvedValue({
        bookingCutoffMinutes: 60,
        tripAutoCompleteHours: 12,
        reminderHoursBefore: [24, 3],
      }),
    };

    tripTemplatesService = {
      runGeneratorForAllActiveTemplates: vi.fn().mockResolvedValue({
        processedTemplates: 2,
        createdTrips: 10,
        errors: [],
      }),
    };

    notificationsService = {
      sendTripReminder: vi.fn().mockResolvedValue(1),
    };

    service = new SchedulerService(
      prisma,
      redis,
      configService,
      settingsService,
      tripTemplatesService,
      notificationsService,
    );
  });

  it('skips daily trip generation if already executed successfully for the same day (REQ-AUTO-07)', async () => {
    prisma.schedulerJobLog.findUnique.mockResolvedValueOnce({
      status: JobRunStatus.SUCCESS,
    });

    const outcome = await service.generateDailyTrips(
      new Date('2026-11-17T02:00:00.000+03:00'),
    );

    expect(outcome.executed).toBe(false);
    expect(outcome.reason).toBe('ALREADY_EXECUTED');
    expect(tripTemplatesService.runGeneratorForAllActiveTemplates).not.toHaveBeenCalled();
  });

  it('skips execution if another instance holds the Redis distributed lock', async () => {
    redis.acquireDistributedLock.mockResolvedValueOnce(false);

    const outcome = await service.syncTripStatuses(new Date());
    expect(outcome.executed).toBe(false);
    expect(outcome.reason).toBe('LOCK_HELD');
    expect(prisma.trip.updateMany).not.toHaveBeenCalled();
  });

  it('transitions trip statuses (CLOSED, DEPARTED, COMPLETED) and releases distributed lock', async () => {
    const outcome = await service.syncTripStatuses(new Date());

    expect(outcome.executed).toBe(true);
    expect(prisma.trip.updateMany).toHaveBeenCalledTimes(3);
    expect(prisma.trip.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ data: { status: TripStatus.CLOSED } }),
    );
    expect(prisma.trip.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ data: { status: TripStatus.DEPARTED } }),
    );
    expect(prisma.trip.updateMany).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ data: { status: TripStatus.COMPLETED } }),
    );
    expect(redis.releaseDistributedLock).toHaveBeenCalled();
  });

  it('records FAILED job log and releases lock if task throws (REQ-AUTO-06)', async () => {
    tripTemplatesService.runGeneratorForAllActiveTemplates.mockRejectedValueOnce(
      new Error('Template explosion'),
    );

    await expect(service.generateDailyTrips()).rejects.toThrow('Template explosion');

    expect(prisma.schedulerJobLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: JobRunStatus.FAILED,
          errorMessage: 'Template explosion',
        }),
      }),
    );
    expect(redis.releaseDistributedLock).toHaveBeenCalled();
  });

  it('dispatches scheduled reminders and sweeps expired hold groups', async () => {
    prisma.trip.findMany
      .mockResolvedValueOnce([{ id: 10 }])
      .mockResolvedValueOnce([{ id: 11 }]);

    const reminderRes = await service.sendScheduledReminders(new Date());
    expect(reminderRes.executed).toBe(true);
    expect(notificationsService.sendTripReminder).toHaveBeenCalledWith(10, 24);
    expect(notificationsService.sendTripReminder).toHaveBeenCalledWith(11, 3);

    redis.client.scan.mockResolvedValueOnce(['0', ['hold:group:old']]);
    redis.client.get.mockResolvedValueOnce(
      JSON.stringify({ expiresAt: new Date(Date.now() - 10_000).toISOString() }),
    );
    const sweepRes = await service.cleanupExpiredLocks();
    expect(sweepRes.summary).toEqual({
      scannedGroups: 1,
      removedStaleGroups: 1,
    });
    expect(redis.client.del).toHaveBeenCalledWith('hold:group:old');
  });
});

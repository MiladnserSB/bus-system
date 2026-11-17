import {
  createCipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { JobRunStatus, TripStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RedisService } from '../../redis/redis.service.js';
import { formatDamascusDate } from '../../common/helpers/damascus-time.helper.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { TripTemplatesService } from '../trip-templates/trip-templates.service.js';

const execFileAsync = promisify(execFile);

export interface JobExecutionOutcome<T = Record<string, unknown>> {
  executed: boolean;
  skipped?: boolean;
  reason?: string;
  runKey: string;
  summary?: T;
}

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
    private readonly settingsService: SettingsService,
    private readonly tripTemplatesService: TripTemplatesService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron('0 0 2 * * *', {
    name: 'daily-trip-generation',
    timeZone: 'Asia/Damascus',
  })
  async handleDailyTripGenerationCron(): Promise<void> {
    await this.generateDailyTrips();
  }

  @Cron('0 * * * * *', {
    name: 'trip-status-and-reminders',
    timeZone: 'Asia/Damascus',
  })
  async handleTripLifecycleCron(): Promise<void> {
    await this.syncTripStatuses();
    await this.sendScheduledReminders();
  }

  @Cron('0 */5 * * * *', {
    name: 'expired-locks-sweep',
    timeZone: 'Asia/Damascus',
  })
  async handleExpiredLocksSweepCron(): Promise<void> {
    await this.cleanupExpiredLocks();
  }

  @Cron('0 0 3 * * *', {
    name: 'daily-database-backup',
    timeZone: 'Asia/Damascus',
  })
  async handleDailyBackupCron(): Promise<void> {
    await this.runDailyBackup();
  }

  async generateDailyTrips(now = new Date()): Promise<JobExecutionOutcome> {
    const dayKey = formatDamascusDate(now);
    const runKey = `daily-trip-generation:${dayKey}`;

    return this.executeLockedIdempotentJob(
      'daily-trip-generation',
      runKey,
      120,
      true,
      async () => {
        const result =
          await this.tripTemplatesService.runGeneratorForAllActiveTemplates();
        return {
          processedTemplates: result.processedTemplates,
          createdTrips: result.createdTrips,
          errorCount: result.errors.length,
          errors: result.errors,
        };
      },
    );
  }

  async syncTripStatuses(now = new Date()): Promise<JobExecutionOutcome> {
    const minuteBucket = now.toISOString().slice(0, 16);
    const runKey = `trip-status-sync:${minuteBucket}`;

    return this.executeLockedIdempotentJob(
      'trip-status-sync',
      runKey,
      55,
      false,
      async () => {
        const policy = await this.settingsService.getPolicy();
        const cutoffTime = new Date(
          now.getTime() + policy.bookingCutoffMinutes * 60_000,
        );
        const completeBefore = new Date(
          now.getTime() - policy.tripAutoCompleteHours * 3_600_000,
        );

        const closedRes = await this.prisma.trip.updateMany({
          where: {
            status: { in: [TripStatus.OPEN, TripStatus.FULL] },
            departAt: { gt: now, lte: cutoffTime },
          },
          data: { status: TripStatus.CLOSED },
        });

        const departedRes = await this.prisma.trip.updateMany({
          where: {
            status: {
              in: [TripStatus.OPEN, TripStatus.FULL, TripStatus.CLOSED],
            },
            departAt: { lte: now, gt: completeBefore },
          },
          data: { status: TripStatus.DEPARTED },
        });

        const completedRes = await this.prisma.trip.updateMany({
          where: {
            status: {
              in: [
                TripStatus.OPEN,
                TripStatus.FULL,
                TripStatus.CLOSED,
                TripStatus.DEPARTED,
              ],
            },
            departAt: { lte: completeBefore },
          },
          data: { status: TripStatus.COMPLETED },
        });

        return {
          closedCount: closedRes.count,
          departedCount: departedRes.count,
          completedCount: completedRes.count,
        };
      },
    );
  }

  async sendScheduledReminders(now = new Date()): Promise<JobExecutionOutcome> {
    const minuteBucket = now.toISOString().slice(0, 16);
    const runKey = `trip-reminders:${minuteBucket}`;

    return this.executeLockedIdempotentJob(
      'trip-reminders',
      runKey,
      55,
      false,
      async () => {
        const policy = await this.settingsService.getPolicy();
        let totalSent = 0;

        for (const hours of policy.reminderHoursBefore) {
          const windowStart = new Date(
            now.getTime() + Math.max(0, hours - 0.5) * 3_600_000,
          );
          const windowEnd = new Date(now.getTime() + hours * 3_600_000);

          const trips = await this.prisma.trip.findMany({
            where: {
              status: {
                in: [TripStatus.OPEN, TripStatus.FULL, TripStatus.CLOSED],
              },
              departAt: { gt: windowStart, lte: windowEnd },
            },
            select: { id: true },
          });

          for (const trip of trips) {
            totalSent += await this.notificationsService.sendTripReminder(
              trip.id,
              hours,
            );
          }
        }

        return { remindersSent: totalSent };
      },
    );
  }

  async cleanupExpiredLocks(): Promise<JobExecutionOutcome> {
    const runKey = `expired-locks-sweep:${new Date().toISOString().slice(0, 16)}`;

    return this.executeLockedIdempotentJob(
      'expired-locks-sweep',
      runKey,
      55,
      false,
      async () => {
        let scannedGroups = 0;
        let removedStaleGroups = 0;
        let cursor = '0';

        do {
          const [nextCursor, keys] = await this.redis.client.scan(
            cursor,
            'MATCH',
            'hold:group:*',
            'COUNT',
            100,
          );
          cursor = nextCursor;

          for (const key of keys) {
            scannedGroups += 1;
            const raw = await this.redis.client.get(key);
            if (!raw) continue;
            try {
              const parsed = JSON.parse(raw) as {
                expiresAt?: string;
                tripId?: number;
                seatNumbers?: string[];
              };
              if (
                parsed.expiresAt &&
                new Date(parsed.expiresAt).getTime() <= Date.now()
              ) {
                await this.redis.client.del(key);
                removedStaleGroups += 1;
              }
            } catch {
              await this.redis.client.del(key);
              removedStaleGroups += 1;
            }
          }
        } while (cursor !== '0');

        return { scannedGroups, removedStaleGroups };
      },
    );
  }

  async runDailyBackup(now = new Date()): Promise<JobExecutionOutcome> {
    const dayKey = formatDamascusDate(now);
    const runKey = `daily-database-backup:${dayKey}`;

    return this.executeLockedIdempotentJob(
      'daily-database-backup',
      runKey,
      300,
      true,
      async () => {
        const backupDir = resolve(
          this.configService.get<string>('backupDir') ??
            this.configService.get<string>('BACKUP_DIR') ??
            './backups',
        );
        const pgDumpPath =
          this.configService.get<string>('backupPgDumpPath') ??
          this.configService.get<string>('BACKUP_PG_DUMP_PATH') ??
          'pg_dump';
        const databaseUrl =
          this.configService.get<string>('databaseUrl') ??
          this.configService.get<string>('DATABASE_URL') ??
          '';
        const retentionDays =
          this.configService.get<number>('backupRetentionDays') ?? 30;
        const encKeyRaw =
          this.configService.get<string>('backupEncryptionKey') ??
          'dev-backup-key-32-bytes-minimum!!';

        await mkdir(backupDir, { recursive: true });
        const rawDumpFile = resolve(backupDir, `backup-${dayKey}.sql`);
        const encryptedFile = `${rawDumpFile}.enc`;

        try {
          await execFileAsync(pgDumpPath, [
            databaseUrl,
            '-f',
            rawDumpFile,
            '--no-owner',
          ]);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'pg_dump failed';
          this.logger.warn(
            `pg_dump unavailable or skipped in current environment: ${msg}`,
          );
          return {
            status: 'PG_DUMP_SKIPPED',
            reason: msg,
            prunedCount: await this.pruneOldBackups(backupDir, retentionDays),
          };
        }

        const plainBuffer = await readFile(rawDumpFile);
        const key = createHash('sha256').update(encKeyRaw).digest();
        const iv = randomBytes(12);
        const cipher = createCipheriv('aes-256-gcm', key, iv);
        const encrypted = Buffer.concat([
          cipher.update(plainBuffer),
          cipher.final(),
        ]);
        const authTag = cipher.getAuthTag();
        await writeFile(
          encryptedFile,
          Buffer.concat([iv, authTag, encrypted]),
        );
        await unlink(rawDumpFile).catch(() => undefined);

        const prunedCount = await this.pruneOldBackups(
          backupDir,
          retentionDays,
        );

        return {
          status: 'BACKUP_ENCRYPTED',
          encryptedFile,
          prunedCount,
        };
      },
    );
  }

  async executeLockedIdempotentJob<T extends Record<string, unknown>>(
    jobName: string,
    runKey: string,
    lockTtlSeconds: number,
    dedupeOncePerRunKey: boolean,
    taskFn: () => Promise<T>,
  ): Promise<JobExecutionOutcome<T>> {
    if (dedupeOncePerRunKey) {
      const alreadyDone = await this.prisma.schedulerJobLog.findUnique({
        where: { runKey },
        select: { status: true },
      });
      if (alreadyDone?.status === JobRunStatus.SUCCESS) {
        return {
          executed: false,
          skipped: true,
          reason: 'ALREADY_EXECUTED',
          runKey,
        };
      }
    }

    const lockKey = `scheduler:lock:${jobName}`;
    const lockToken = randomUUID();
    const acquired = await this.redis.acquireDistributedLock(
      lockKey,
      lockToken,
      lockTtlSeconds,
    );

    if (!acquired) {
      return {
        executed: false,
        skipped: true,
        reason: 'LOCK_HELD',
        runKey,
      };
    }

    const logRunKey = dedupeOncePerRunKey
      ? runKey
      : `${runKey}:${randomUUID().slice(0, 8)}`;

    const jobLog = await this.prisma.schedulerJobLog.upsert({
      where: { runKey: logRunKey },
      update: {
        status: JobRunStatus.RUNNING,
        startedAt: new Date(),
        finishedAt: null,
        errorMessage: null,
      },
      create: {
        jobName,
        runKey: logRunKey,
        status: JobRunStatus.RUNNING,
      },
    });

    try {
      const summary = await taskFn();
      await this.prisma.schedulerJobLog.update({
        where: { id: jobLog.id },
        data: {
          status: JobRunStatus.SUCCESS,
          summary: summary as object,
          finishedAt: new Date(),
        },
      });
      return { executed: true, runKey: logRunKey, summary };
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Unknown scheduler error';
      this.logger.error(
        `[ALERT][Scheduler:${jobName}] Job failed (${logRunKey}): ${errorMessage}`,
        err instanceof Error ? err.stack : undefined,
      );
      await this.prisma.schedulerJobLog.update({
        where: { id: jobLog.id },
        data: {
          status: JobRunStatus.FAILED,
          errorMessage,
          finishedAt: new Date(),
        },
      });
      throw err;
    } finally {
      await this.redis.releaseDistributedLock(lockKey, lockToken);
    }
  }

  private async pruneOldBackups(
    backupDir: string,
    retentionDays: number,
  ): Promise<number> {
    const files = await readdir(backupDir).catch(() => []);
    const cutoffMs = Date.now() - retentionDays * 86_400_000;
    let deleted = 0;

    for (const file of files) {
      if (!file.endsWith('.enc')) continue;
      const fullPath = resolve(backupDir, file);
      const info = await stat(fullPath).catch(() => null);
      if (info && info.mtimeMs < cutoffMs) {
        await unlink(fullPath).catch(() => undefined);
        deleted += 1;
      }
    }

    return deleted;
  }
}

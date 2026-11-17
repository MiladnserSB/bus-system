import { execSync, spawn, ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import EmbeddedPostgres from 'embedded-postgres';
import { Redis } from 'ioredis';
import { Pool } from 'pg';
import { runSeed } from '../../prisma/seed.js';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';

export interface TestHarness {
  app: INestApplication;
  prisma: PrismaClient;
  redis: Redis;
  databaseUrl: string;
  redisUrl: string;
  cleanup: () => Promise<void>;
}

function findRedisServerExecutable(): string | null {
  if (process.env.REDIS_SERVER_BIN && existsSync(process.env.REDIS_SERVER_BIN)) {
    return process.env.REDIS_SERVER_BIN;
  }

  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    const packagesRoot = join(localAppData, 'Microsoft', 'WinGet', 'Packages');
    if (existsSync(packagesRoot)) {
      for (const pkgDir of readdirSync(packagesRoot)) {
        if (!pkgDir.toLowerCase().includes('redis')) continue;
        const candidate = join(packagesRoot, pkgDir, 'redis-server.exe');
        if (existsSync(candidate)) {
          return candidate;
        }
        const subDirs = readdirSync(join(packagesRoot, pkgDir), {
          withFileTypes: true,
        });
        for (const sub of subDirs) {
          if (sub.isDirectory()) {
            const nested = join(
              packagesRoot,
              pkgDir,
              sub.name,
              'redis-server.exe',
            );
            if (existsSync(nested)) return nested;
          }
        }
      }
    }
  }

  try {
    const found = execSync('where.exe redis-server', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find(Boolean);
    if (found && existsSync(found)) return found;
  } catch {
    // fallback
  }

  return null;
}

async function waitForRedis(redisUrl: string, timeoutMs = 15_000): Promise<Redis> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const client = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 1000,
    });
    client.on('error', () => {});
    try {
      await client.connect();
      const pong = await client.ping();
      if (pong === 'PONG') {
        return client;
      }
    } catch {
      // retry
    }
    client.disconnect();
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Redis failed to respond at ${redisUrl} within ${timeoutMs}ms`);
}

export async function createTestHarness(options?: {
  pgPort?: number;
  redisPort?: number;
  rateLimitMax?: number;
}): Promise<TestHarness> {
  const projectRoot = resolve(import.meta.dirname, '..', '..');
  const pgPort = options?.pgPort ?? 5441;
  const redisPort = options?.redisPort ?? 6389;
  const pgDir = join(tmpdir(), `bus-system-pg-${pgPort}`);
  const redisDir = join(tmpdir(), `bus-system-redis-${redisPort}`);

  let embeddedPg: EmbeddedPostgres | null = null;
  let redisProcess: ChildProcess | null = null;

  let databaseUrl = process.env.TEST_DATABASE_URL ?? '';
  if (!databaseUrl) {
    rmSync(pgDir, { recursive: true, force: true });
    embeddedPg = new EmbeddedPostgres({
      databaseDir: pgDir,
      port: pgPort,
      user: 'postgres',
      password: 'postgres',
      persistent: false,
      initdbFlags: ['--encoding=SQL_ASCII', '--locale=C'],
    });
    await embeddedPg.initialise();
    await embeddedPg.start();
    const adminPgClient = embeddedPg.getPgClient('postgres');
    await adminPgClient.connect();
    await adminPgClient.query(
      "CREATE DATABASE bus_system_test WITH ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0",
    );
    await adminPgClient.end();
    databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${pgPort}/bus_system_test?schema=public`;
  }

  let redisUrl = process.env.TEST_REDIS_URL ?? '';
  if (!redisUrl) {
    const redisBin = findRedisServerExecutable();
    if (!redisBin) {
      throw new Error(
        'redis-server executable not found. Set TEST_REDIS_URL or REDIS_SERVER_BIN.',
      );
    }
    rmSync(redisDir, { recursive: true, force: true });
    mkdirSync(redisDir, { recursive: true });
    redisProcess = spawn(
      redisBin,
      [
        '--port',
        String(redisPort),
        '--bind',
        '127.0.0.1',
        '--save',
        '',
        '--appendonly',
        'no',
        '--dir',
        redisDir,
      ],
      { stdio: 'ignore' },
    );
    redisUrl = `redis://127.0.0.1:${redisPort}`;
  }

  const redis = await waitForRedis(redisUrl);
  await redis.flushall();

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = databaseUrl;
  process.env.REDIS_URL = redisUrl;
  process.env.RATE_LIMIT_GLOBAL_MAX = String(options?.rateLimitMax ?? 5000);
  process.env.RATE_LIMIT_BOOKING_MAX = String(options?.rateLimitMax ?? 5000);
  process.env.RATE_LIMIT_GLOBAL_TTL_MS = '60000';
  process.env.RATE_LIMIT_OTP_HOURLY_MAX = '5';
  process.env.JWT_ACCESS_SECRET = 'e2e-access-secret-minimum-32-characters';
  process.env.JWT_REFRESH_SECRET = 'e2e-refresh-secret-minimum-32-characters';
  process.env.OTP_HMAC_SECRET = 'e2e-otp-secret-minimum-32-characters';
  process.env.QR_HMAC_SECRET = 'e2e-qr-secret-minimum-32-characters';
  process.env.SMS_PROVIDER = 'log';

  execSync('npx prisma migrate deploy', {
    cwd: projectRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });

  const pool = new Pool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  // Run seed twice to prove idempotency (REQ-SCHD / Seed verification)
  await runSeed(prisma);
  await runSeed(prisma);

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  configureApp(app, { enableSwagger: true });
  await app.init();

  const cleanup = async () => {
    await app.close();
    await prisma.$disconnect();
    await pool.end();
    if (redis.status !== 'end') {
      await redis.quit().catch(() => redis.disconnect());
    }
    if (redisProcess && !redisProcess.killed) {
      redisProcess.kill();
    }
    if (embeddedPg) {
      await embeddedPg.stop();
    }
    rmSync(pgDir, { recursive: true, force: true });
    rmSync(redisDir, { recursive: true, force: true });
  };

  return {
    app,
    prisma,
    redis,
    databaseUrl,
    redisUrl,
    cleanup,
  };
}

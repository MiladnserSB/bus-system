import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import { Redis } from 'ioredis';
import { Pool } from 'pg';

const backendDir = resolve(import.meta.dirname, '..');
const envFilePath = join(backendDir, '.env');

if (existsSync(envFilePath) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(envFilePath);
}

const DEFAULT_DATABASE_URL =
  'postgresql://postgres:postgres@127.0.0.1:5432/bus_system?schema=public';
const DEFAULT_REDIS_URL = 'redis://127.0.0.1:6379';

const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
const redisUrl = process.env.REDIS_URL ?? DEFAULT_REDIS_URL;

function parsePort(urlStr, fallbackPort) {
  try {
    const parsed = new URL(urlStr);
    return parsed.port ? Number.parseInt(parsed.port, 10) : fallbackPort;
  } catch {
    return fallbackPort;
  }
}

function parseDbName(urlStr, fallbackName = 'bus_system') {
  try {
    const parsed = new URL(urlStr);
    const cleaned = parsed.pathname.replace(/^\/+/, '').trim();
    return cleaned || fallbackName;
  } catch {
    return fallbackName;
  }
}

async function canConnectPostgres(urlStr) {
  const pool = new Pool({
    connectionString: urlStr,
    connectionTimeoutMillis: 1500,
  });
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await pool.end().catch(() => {});
  }
}

async function canConnectRedis(urlStr) {
  const client = new Redis(urlStr, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 1200,
    retryStrategy: () => null,
  });
  client.on('error', () => {});
  try {
    await client.connect();
    const pong = await client.ping();
    return pong === 'PONG';
  } catch {
    return false;
  } finally {
    client.disconnect();
  }
}

function findRedisServerExecutable() {
  if (process.env.REDIS_SERVER_BIN && existsSync(process.env.REDIS_SERVER_BIN)) {
    return process.env.REDIS_SERVER_BIN;
  }

  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    const packagesRoot = join(localAppData, 'Microsoft', 'WinGet', 'Packages');
    if (existsSync(packagesRoot)) {
      for (const pkgDir of readdirSync(packagesRoot)) {
        if (!pkgDir.toLowerCase().includes('redis')) continue;
        const direct = join(packagesRoot, pkgDir, 'redis-server.exe');
        if (existsSync(direct)) return direct;
        for (const sub of readdirSync(join(packagesRoot, pkgDir), {
          withFileTypes: true,
        })) {
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

  const lookupCmd =
    process.platform === 'win32'
      ? 'where.exe redis-server'
      : 'command -v redis-server';
  try {
    const found = execSync(lookupCmd, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    if (found && existsSync(found)) return found;
  } catch {
    // Fallback below
  }

  return null;
}

async function waitForRedis(urlStr, timeoutMs = 15_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await canConnectRedis(urlStr)) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error(`Redis failed to respond at ${urlStr} within ${timeoutMs}ms`);
}

async function main() {
  let embeddedPg = null;
  let redisProcess = null;

  const pgPort = parsePort(databaseUrl, 5432);
  const dbName = parseDbName(databaseUrl, 'bus_system');
  const redisPort = parsePort(redisUrl, 6379);

  if (await canConnectPostgres(databaseUrl)) {
    console.log(`[dev] Using running PostgreSQL instance (${databaseUrl}).`);
  } else {
    const pgDir = join(backendDir, '.local-pgdata');
    console.log(`[dev] Starting Embedded PostgreSQL on port ${pgPort}...`);
    const isInitialized = existsSync(join(pgDir, 'PG_VERSION'));
    const stalePidFile = join(pgDir, 'postmaster.pid');
    if (isInitialized && existsSync(stalePidFile)) {
      rmSync(stalePidFile, { force: true });
    }
    embeddedPg = new EmbeddedPostgres({
      databaseDir: pgDir,
      port: pgPort,
      user: 'postgres',
      password: 'postgres',
      persistent: true,
      initdbFlags: ['--encoding=SQL_ASCII', '--locale=C'],
    });
    if (!isInitialized) {
      await embeddedPg.initialise();
    }
    await embeddedPg.start();

    const adminClient = embeddedPg.getPgClient('postgres');
    await adminClient.connect();
    const dbCheck = await adminClient.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [dbName],
    );
    if (dbCheck.rowCount === 0) {
      await adminClient.query(
        `CREATE DATABASE "${dbName}" WITH ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0`,
      );
    }
    await adminClient.end();
  }

  if (await canConnectRedis(redisUrl)) {
    console.log(`[dev] Using running Redis instance (${redisUrl}).`);
  } else {
    const redisBin = findRedisServerExecutable();
    if (!redisBin) {
      throw new Error(
        'Redis server is not running and redis-server executable was not found. Start Redis on 6379 or set REDIS_SERVER_BIN.',
      );
    }
    const redisDir = join(backendDir, '.local-redis');
    rmSync(redisDir, { recursive: true, force: true });
    mkdirSync(redisDir, { recursive: true });
    console.log(`[dev] Starting local Redis on port ${redisPort}...`);
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
    await waitForRedis(redisUrl);
  }

  const runtimeEnv = {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV ?? 'development',
    PORT: process.env.PORT ?? '3000',
    DATABASE_URL: databaseUrl,
    REDIS_URL: redisUrl,
    CORS_ORIGINS:
      process.env.CORS_ORIGINS ??
      'http://localhost:3000,http://localhost:3001,http://localhost:8081',
    JWT_ACCESS_SECRET:
      process.env.JWT_ACCESS_SECRET ??
      'dev-access-secret-replace-in-production-32chars',
    JWT_REFRESH_SECRET:
      process.env.JWT_REFRESH_SECRET ??
      'dev-refresh-secret-replace-in-production-32chars',
    OTP_HMAC_SECRET:
      process.env.OTP_HMAC_SECRET ??
      'dev-otp-hmac-secret-replace-in-production-32chars',
    QR_HMAC_SECRET:
      process.env.QR_HMAC_SECRET ??
      'dev-qr-hmac-secret-replace-in-production-32chars',
    SMS_PROVIDER: process.env.SMS_PROVIDER ?? 'log',
  };

  if (!existsSync(join(backendDir, 'src', 'generated', 'prisma', 'client.ts'))) {
    console.log('[dev] Generating Prisma Client...');
    execSync('npx prisma generate', {
      cwd: backendDir,
      env: runtimeEnv,
      stdio: 'inherit',
    });
  }

  console.log('[dev] Applying Prisma migrations & idempotent seed...');
  execSync('npx prisma migrate deploy', {
    cwd: backendDir,
    env: runtimeEnv,
    stdio: 'inherit',
  });
  execSync('npx prisma db seed', {
    cwd: backendDir,
    env: runtimeEnv,
    stdio: 'inherit',
  });

  const nestCli = join(
    backendDir,
    'node_modules',
    '@nestjs',
    'cli',
    'bin',
    'nest.js',
  );
  console.log(
    `[dev] Starting NestJS Backend (--watch) on http://localhost:${runtimeEnv.PORT}/api/v1 (Swagger: /api/docs)...`,
  );
  const nestProc = spawn(process.execPath, [nestCli, 'start', '--watch'], {
    cwd: backendDir,
    env: runtimeEnv,
    stdio: 'inherit',
  });

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      nestProc.kill();
    } catch {}
    try {
      if (redisProcess && !redisProcess.killed) redisProcess.kill();
    } catch {}
    try {
      if (embeddedPg) await embeddedPg.stop();
    } catch {}
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  nestProc.on('exit', (code) => {
    void shutdown().then(() => process.exit(code ?? 0));
  });
}

main().catch((err) => {
  console.error('[dev] Failed to start bus-system-backend:', err);
  process.exit(1);
});

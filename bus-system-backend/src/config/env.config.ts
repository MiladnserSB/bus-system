export interface AppEnvironment {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  redisUrl: string;
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  jwtAccessExpiresIn: string;
  jwtRefreshExpiresDays: number;
  otpHmacSecret: string;
  qrHmacSecret: string;
  corsOrigins: string[];
  rateLimitGlobalTtlMs: number;
  rateLimitGlobalMax: number;
  rateLimitOtpHourlyMax: number;
  smsProvider: 'log' | 'http';
  smsHttpUrl: string;
  smsApiKey: string;
  smsSenderId: string;
  fcmProjectId: string;
  fcmClientEmail: string;
  fcmPrivateKey: string;
  backupDir: string;
  backupEncryptionKey: string;
  backupRetentionDays: number;
  backupPgDumpPath: string;
}

export function loadEnvConfig(): AppEnvironment {
  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: Number.parseInt(process.env.PORT ?? '3000', 10),
    databaseUrl:
      process.env.DATABASE_URL ??
      'postgresql://postgres:postgres@localhost:5432/bus_system?schema=public',
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
    jwtAccessSecret:
      process.env.JWT_ACCESS_SECRET ??
      'dev-access-secret-replace-in-production-32chars',
    jwtRefreshSecret:
      process.env.JWT_REFRESH_SECRET ??
      'dev-refresh-secret-replace-in-production-32chars',
    jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    jwtRefreshExpiresDays: Number.parseInt(
      process.env.JWT_REFRESH_EXPIRES_DAYS ?? '7',
      10,
    ),
    otpHmacSecret:
      process.env.OTP_HMAC_SECRET ??
      'dev-otp-hmac-secret-replace-in-production-32chars',
    qrHmacSecret:
      process.env.QR_HMAC_SECRET ??
      'dev-qr-hmac-secret-replace-in-production-32chars',
    corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:3001')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    rateLimitGlobalTtlMs: Number.parseInt(
      process.env.RATE_LIMIT_GLOBAL_TTL_MS ?? '60000',
      10,
    ),
    rateLimitGlobalMax: Number.parseInt(
      process.env.RATE_LIMIT_GLOBAL_MAX ?? '60',
      10,
    ),
    rateLimitOtpHourlyMax: Number.parseInt(
      process.env.RATE_LIMIT_OTP_HOURLY_MAX ?? '5',
      10,
    ),
    smsProvider:
      process.env.SMS_PROVIDER === 'http' ? 'http' : 'log',
    smsHttpUrl: process.env.SMS_HTTP_URL ?? '',
    smsApiKey: process.env.SMS_API_KEY ?? '',
    smsSenderId: process.env.SMS_SENDER_ID ?? 'MASAR',
    fcmProjectId: process.env.FCM_PROJECT_ID ?? '',
    fcmClientEmail: process.env.FCM_CLIENT_EMAIL ?? '',
    fcmPrivateKey: (process.env.FCM_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
    backupDir: process.env.BACKUP_DIR ?? './backups',
    backupEncryptionKey:
      process.env.BACKUP_ENCRYPTION_KEY ??
      'dev-backup-key-32-bytes-minimum!!',
    backupRetentionDays: Number.parseInt(
      process.env.BACKUP_RETENTION_DAYS ?? '30',
      10,
    ),
    backupPgDumpPath: process.env.BACKUP_PG_DUMP_PATH ?? 'pg_dump',
  };
}

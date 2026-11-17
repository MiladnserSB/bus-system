import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

const RELEASE_IF_MATCH_LUA = `
local current = redis.call("get", KEYS[1])
if not current then
  return 0
end
if current == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return -1
`;

const RELEASE_LOCK_BY_HOLD_LUA = `
local current = redis.call("get", KEYS[1])
if not current then
  return 0
end
local ok, decoded = pcall(cjson.decode, current)
if ok and decoded and (decoded.holdId == ARGV[1] or decoded.holderKey == ARGV[2]) then
  return redis.call("del", KEYS[1])
end
return -1
`;

export interface SeatLockPayload {
  holdId: string;
  holderKey: string;
  tripId: number;
  seatNumber: string;
  createdAt: string;
  expiresAt: string;
}

export interface HoldGroupPayload {
  holdId: string;
  holderKey: string;
  tripId: number;
  seatNumbers: string[];
  createdAt: string;
  expiresAt: string;
}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor(configService?: ConfigService) {
    const redisUrl =
      configService?.get<string>('REDIS_URL') ??
      process.env.REDIS_URL ??
      'redis://localhost:6379';

    this.client = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    });

    this.client.on('error', (err: Error) => {
      this.logger.warn(`Redis connection notice: ${err.message}`);
    });
  }

  async onModuleInit(): Promise<void> {
    if (this.client.status === 'wait') {
      await this.client.connect();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.status !== 'end') {
      await this.client.quit();
    }
  }

  seatLockKey(tripId: number, seatNumber: string): string {
    return `lock:trip:${tripId}:seat:${seatNumber}`;
  }

  holdGroupKey(holdId: string): string {
    return `hold:group:${holdId}`;
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }

  async acquireSeatLock(
    tripId: number,
    seatNumber: string,
    payload: SeatLockPayload,
    ttlSeconds: number,
  ): Promise<boolean> {
    const key = this.seatLockKey(tripId, seatNumber);
    const result = await this.client.set(
      key,
      JSON.stringify(payload),
      'EX',
      ttlSeconds,
      'NX',
    );
    return result === 'OK';
  }

  async getSeatLock(
    tripId: number,
    seatNumber: string,
  ): Promise<SeatLockPayload | null> {
    const raw = await this.client.get(this.seatLockKey(tripId, seatNumber));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SeatLockPayload;
    } catch {
      return null;
    }
  }

  async getSeatLocksForTrip(
    tripId: number,
    seatNumbers: string[],
  ): Promise<Map<string, SeatLockPayload>> {
    const map = new Map<string, SeatLockPayload>();
    if (seatNumbers.length === 0) {
      return map;
    }
    const keys = seatNumbers.map((s) => this.seatLockKey(tripId, s));
    const values = await this.client.mget(...keys);
    values.forEach((raw, idx) => {
      if (!raw) return;
      try {
        map.set(seatNumbers[idx], JSON.parse(raw) as SeatLockPayload);
      } catch {
        // Ignore malformed cache entries
      }
    });
    return map;
  }

  async releaseSeatLockIfOwned(
    tripId: number,
    seatNumber: string,
    holdId: string,
    holderKey: string,
  ): Promise<number> {
    const key = this.seatLockKey(tripId, seatNumber);
    const res = await this.client.eval(
      RELEASE_LOCK_BY_HOLD_LUA,
      1,
      key,
      holdId,
      holderKey,
    );
    return Number(res);
  }

  async forceReleaseSeatLocks(
    tripId: number,
    seatNumbers: string[],
  ): Promise<void> {
    if (seatNumbers.length === 0) return;
    const keys = seatNumbers.map((s) => this.seatLockKey(tripId, s));
    await this.client.del(...keys);
  }

  async saveHoldGroup(
    payload: HoldGroupPayload,
    ttlSeconds: number,
  ): Promise<void> {
    await this.client.set(
      this.holdGroupKey(payload.holdId),
      JSON.stringify(payload),
      'EX',
      ttlSeconds,
    );
  }

  async getHoldGroup(holdId: string): Promise<HoldGroupPayload | null> {
    const raw = await this.client.get(this.holdGroupKey(holdId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as HoldGroupPayload;
    } catch {
      return null;
    }
  }

  async deleteHoldGroup(holdId: string): Promise<void> {
    await this.client.del(this.holdGroupKey(holdId));
  }

  async acquireDistributedLock(
    lockKey: string,
    token: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    const res = await this.client.set(lockKey, token, 'EX', ttlSeconds, 'NX');
    return res === 'OK';
  }

  async releaseDistributedLock(lockKey: string, token: string): Promise<void> {
    await this.client.eval(RELEASE_IF_MATCH_LUA, 1, lockKey, token);
  }

  async incrWithWindow(key: string, windowSeconds: number): Promise<number> {
    const count = await this.client.incr(key);
    if (count === 1) {
      await this.client.expire(key, windowSeconds);
    }
    return count;
  }
}

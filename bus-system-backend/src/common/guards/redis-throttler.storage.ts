import { Injectable } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface.js';
import { RedisService } from '../../redis/redis.service.js';

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: RedisService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const redisKey = `throttle:${throttlerName}:${key}`;
    const blockKey = `${redisKey}:blocked`;

    const blockedTtlMs = await this.redis.client.pttl(blockKey);
    if (blockedTtlMs > 0) {
      return {
        totalHits: limit + 1,
        timeToExpire: Math.ceil(blockedTtlMs / 1000),
        isBlocked: true,
        timeToBlockExpire: Math.ceil(blockedTtlMs / 1000),
      };
    }

    const ttlMs = Math.max(1000, ttl);
    const totalHits = await this.redis.client.incr(redisKey);
    if (totalHits === 1) {
      await this.redis.client.pexpire(redisKey, ttlMs);
    }
    const pttl = await this.redis.client.pttl(redisKey);
    const timeToExpire = Math.max(1, Math.ceil((pttl > 0 ? pttl : ttlMs) / 1000));

    if (totalHits > limit && blockDuration > 0) {
      await this.redis.client.set(blockKey, '1', 'PX', blockDuration);
      return {
        totalHits,
        timeToExpire,
        isBlocked: true,
        timeToBlockExpire: Math.ceil(blockDuration / 1000),
      };
    }

    return {
      totalHits,
      timeToExpire,
      isBlocked: false,
      timeToBlockExpire: 0,
    };
  }
}

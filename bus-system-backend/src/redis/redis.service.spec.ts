import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { RedisService } from './redis.service.js';

describe('RedisService', () => {
  it('constructs seat lock and hold group keys in SRS format', () => {
    const configService = new ConfigService({
      REDIS_URL: 'redis://localhost:6379',
    });
    const service = new RedisService(configService);
    expect(service.seatLockKey(42, '5A')).toBe('lock:trip:42:seat:5A');
    expect(service.holdGroupKey('abc')).toBe('hold:group:abc');
  });
});

import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service.js';
import { RedisService } from './redis/redis.service.js';

@Injectable()
export class AppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  getInfo() {
    return {
      service: 'bus-system-backend',
      version: '1.0.0',
      timezone: 'Asia/Damascus',
    };
  }

  async getHealth() {
    await this.prisma.$queryRaw`SELECT 1`;
    const pong = await this.redis.ping();
    return {
      status: 'ok',
      postgres: 'up',
      redis: pong === 'PONG' ? 'up' : pong,
      timestamp: new Date().toISOString(),
    };
  }
}

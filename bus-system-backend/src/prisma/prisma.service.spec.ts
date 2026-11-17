import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { PrismaService } from './prisma.service.js';

describe('PrismaService', () => {
  it('constructs cleanly with ConfigService', () => {
    const configService = new ConfigService({
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/bus_system',
    });
    const service = new PrismaService(configService);
    expect(service).toBeDefined();
  });
});

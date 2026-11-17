import { Test, TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaService } from './prisma/prisma.service.js';
import { RedisService } from './redis/redis.service.js';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: PrismaService,
          useValue: { $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]) },
        },
        {
          provide: RedisService,
          useValue: { ping: vi.fn().mockResolvedValue('PONG') },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  it('returns service info', () => {
    expect(appController.getInfo()).toMatchObject({
      service: 'bus-system-backend',
      version: '1.0.0',
    });
  });

  it('returns health status when postgres and redis respond', async () => {
    const health = await appController.getHealth();
    expect(health.status).toBe('ok');
    expect(health.postgres).toBe('up');
    expect(health.redis).toBe('up');
  });
});

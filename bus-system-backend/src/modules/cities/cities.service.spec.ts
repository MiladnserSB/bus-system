import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCodes } from '../../common/constants/error-codes.js';
import { CitiesService } from './cities.service.js';

describe('CitiesService', () => {
  let service: CitiesService;
  let prisma: any;
  let auditLogsService: any;

  beforeEach(() => {
    prisma = {
      city: {
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      trip: { count: vi.fn().mockResolvedValue(0) },
      tripTemplate: { count: vi.fn().mockResolvedValue(0) },
      $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => cb(prisma)),
    };
    auditLogsService = { log: vi.fn().mockResolvedValue(undefined) };
    service = new CitiesService(prisma, auditLogsService);
  });

  it('prevents deleting a city linked to trips (REQ-DATA-08)', async () => {
    prisma.city.findUnique.mockResolvedValueOnce({ id: 1, nameAr: 'دمشق' });
    prisma.trip.count.mockResolvedValueOnce(2);

    await expect(service.remove(1, 1)).rejects.toMatchObject({
      code: ErrorCodes.RESOURCE_IN_USE,
    });
  });

  it('creates a city and records audit log', async () => {
    prisma.city.create.mockResolvedValueOnce({
      id: 1,
      nameAr: 'تدمر',
      nameEn: 'Palmyra',
      isActive: true,
    });
    const created = await service.create(
      { nameAr: 'تدمر', nameEn: 'Palmyra' },
      1,
    );
    expect(created.nameAr).toBe('تدمر');
    expect(auditLogsService.log).toHaveBeenCalled();
  });
});

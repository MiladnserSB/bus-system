import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCodes } from '../../common/constants/error-codes.js';
import { BusesService } from './buses.service.js';

describe('BusesService', () => {
  let service: BusesService;
  let prisma: any;
  let auditLogsService: any;

  beforeEach(() => {
    prisma = {
      bus: {
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      busType: { findUnique: vi.fn().mockResolvedValue({ id: 1 }) },
      trip: { count: vi.fn().mockResolvedValue(0) },
      tripTemplate: { count: vi.fn().mockResolvedValue(0) },
      $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => cb(prisma)),
    };
    auditLogsService = { log: vi.fn().mockResolvedValue(undefined) };
    service = new BusesService(prisma, auditLogsService);
  });

  it('rejects duplicate plateNumber with 409 DUPLICATE_PLATE_NUMBER (4.2.2)', async () => {
    prisma.bus.findUnique.mockResolvedValueOnce({ id: 1, plateNumber: 'دمشق 111' });

    await expect(
      service.create({ plateNumber: 'دمشق 111', busTypeId: 1 }, 1),
    ).rejects.toMatchObject({ code: ErrorCodes.DUPLICATE_PLATE_NUMBER });
  });
});

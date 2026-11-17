import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BusCategory, BusSize } from '../../generated/prisma/enums.js';
import { ErrorCodes } from '../../common/constants/error-codes.js';
import { BusTypesService } from './bus-types.service.js';

describe('BusTypesService', () => {
  let service: BusTypesService;
  let prisma: any;
  let auditLogsService: any;

  beforeEach(() => {
    prisma = {
      busType: {
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      seatTemplate: {
        findMany: vi.fn().mockResolvedValue([]),
        createMany: vi.fn().mockResolvedValue({ count: 27 }),
      },
      bus: { count: vi.fn().mockResolvedValue(0) },
      trip: { count: vi.fn().mockResolvedValue(0) },
      tripTemplate: { count: vi.fn().mockResolvedValue(0) },
      $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => cb(prisma)),
    };
    auditLogsService = { log: vi.fn().mockResolvedValue(undefined) };
    service = new BusTypesService(prisma, auditLogsService);
  });

  it('creates a custom bus type and auto-generates seat_templates (REQ-DATA-04, REQ-DATA-06)', async () => {
    prisma.busType.create.mockResolvedValueOnce({
      id: 7,
      code: 'VIP_CUSTOM',
      nameAr: 'مخصصة',
      layout: '2+1',
      rowsCount: 9,
      totalSeats: 27,
    });

    const created = await service.create(
      {
        code: 'VIP_CUSTOM',
        nameAr: 'مخصصة',
        category: BusCategory.FIRST_CLASS,
        size: BusSize.MEDIUM,
        layout: '2+1',
        rowsCount: 9,
        hasExtraBackSeat: false,
        totalSeats: 27,
      },
      1,
    );

    expect(created.totalSeats).toBe(27);
    expect(prisma.seatTemplate.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ busTypeId: 7, seatNumber: '1A' }),
        ]),
      }),
    );
  });

  it('blocks deletion when bus type is referenced (REQ-DATA-08)', async () => {
    prisma.busType.findUnique.mockResolvedValueOnce({ id: 1, code: 'STD' });
    prisma.bus.count.mockResolvedValueOnce(1);

    await expect(service.remove(1, 1)).rejects.toMatchObject({
      code: ErrorCodes.RESOURCE_IN_USE,
    });
  });
});

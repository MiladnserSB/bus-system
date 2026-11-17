import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReportsService } from './reports.service.js';

describe('ReportsService', () => {
  let service: ReportsService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      booking: { count: vi.fn().mockResolvedValue(5) },
      trip: { count: vi.fn().mockResolvedValue(2), findMany: vi.fn().mockResolvedValue([]) },
      bookingSeat: {
        findMany: vi.fn().mockResolvedValue([
          {
            bookingId: 1,
            unitPrice: 45000,
            trip: {
              originId: 1,
              destinationId: 2,
              busTypeId: 1,
              origin: { nameAr: 'دمشق' },
              destination: { nameAr: 'حلب' },
              busType: { nameAr: 'عادية 2+2 كبير' },
            },
          },
          {
            bookingId: 1,
            unitPrice: 45000,
            trip: {
              originId: 1,
              destinationId: 2,
              busTypeId: 1,
              origin: { nameAr: 'دمشق' },
              destination: { nameAr: 'حلب' },
              busType: { nameAr: 'عادية 2+2 كبير' },
            },
          },
        ]),
      },
      user: { findMany: vi.fn().mockResolvedValue([]) },
    };
    service = new ReportsService(prisma);
  });

  it('computes revenue strictly from confirmed non-cancelled active seats (REQ-RPT-09)', async () => {
    const revenue = await service.getRevenueReport({});
    expect(revenue.totalRevenue).toBe(90000);
    expect(revenue.totalSeatsSold).toBe(2);
    expect(prisma.bookingSeat.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          status: 'CONFIRMED',
        }),
      }),
    );
  });

  it('exports CSV with UTF-8 BOM and valid PDF buffer (REQ-RPT-06)', async () => {
    const csv = service.toCsv([{ route: 'دمشق ← حلب', revenue: 90000 }]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('دمشق ← حلب');

    const pdf = await service.toPdf('Revenue Report', [
      { route: 'Damascus - Aleppo', revenue: 90000 },
    ]);
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  });
});

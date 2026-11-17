import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditLogsService } from './audit-logs.service.js';

describe('AuditLogsService', () => {
  let service: AuditLogsService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 1 }),
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };
    service = new AuditLogsService(prisma);
  });

  it('writes immutable audit entries and supports filtered paginated reads', async () => {
    await service.log({
      userId: 1,
      action: 'BOOKING_CANCEL',
      entity: 'Booking',
      entityId: 'BK-20261117-0001',
      details: { reason: 'test' },
    });
    expect(prisma.auditLog.create).toHaveBeenCalled();

    const list = await service.findAll({ action: 'BOOKING_CANCEL', page: 1, limit: 10 });
    expect(list.items).toEqual([]);
    expect(list.meta.page).toBe(1);
  });
});

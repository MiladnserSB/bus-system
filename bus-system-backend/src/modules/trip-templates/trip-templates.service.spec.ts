import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RecurrenceType } from '../../generated/prisma/enums.js';
import { TripTemplatesService } from './trip-templates.service.js';

describe('TripTemplatesService', () => {
  let service: TripTemplatesService;
  let prisma: any;
  let auditLogsService: any;
  let settingsService: any;

  beforeEach(() => {
    prisma = {
      city: { findUnique: vi.fn().mockResolvedValue({ id: 1, isActive: true }) },
      busType: { findUnique: vi.fn().mockResolvedValue({ id: 1, isActive: true }) },
      bus: { findUnique: vi.fn() },
      tripTemplate: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      templateExclusion: {
        createMany: vi.fn(),
        upsert: vi.fn(),
        findFirst: vi.fn(),
        delete: vi.fn(),
      },
      trip: {
        createMany: vi.fn().mockResolvedValue({ count: 3 }),
        updateMany: vi.fn(),
        deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => cb(prisma)),
    };

    auditLogsService = { log: vi.fn().mockResolvedValue(undefined) };
    settingsService = {
      getPolicy: vi.fn().mockResolvedValue({ templateGenerateAheadDays: 30 }),
    };

    service = new TripTemplatesService(prisma, auditLogsService, settingsService);
  });

  it('computes DAILY candidate slots while skipping excluded holiday dates (REQ-SCHD-10)', () => {
    const now = new Date('2026-12-01T00:00:00.000Z');
    const slots = service.computeCandidateSlots({
      departureTime: '08:00',
      recurrence: RecurrenceType.DAILY,
      daysOfWeek: [],
      dayOfMonth: null,
      startDate: '2026-12-01',
      endDate: '2026-12-05',
      generateAheadDays: 30,
      excludedDates: new Set(['2026-12-03']),
      now,
    });

    expect(slots.map((s) => s.date)).toEqual([
      '2026-12-01',
      '2026-12-02',
      '2026-12-04',
      '2026-12-05',
    ]);
  });

  it('computes WEEKLY slots strictly matching selected daysOfWeek (REQ-SCHD-02)', () => {
    const now = new Date('2026-12-01T00:00:00.000Z'); // 2026-12-01 is Tuesday (2)
    const slots = service.computeCandidateSlots({
      departureTime: '07:30',
      recurrence: RecurrenceType.WEEKLY,
      daysOfWeek: [0, 3, 6], // Sun, Wed, Sat
      dayOfMonth: null,
      startDate: '2026-12-01',
      endDate: '2026-12-10',
      generateAheadDays: 30,
      excludedDates: new Set(),
      now,
    });

    expect(slots.map((s) => s.date)).toEqual([
      '2026-12-02', // Wed
      '2026-12-05', // Sat
      '2026-12-06', // Sun
      '2026-12-09', // Wed
    ]);
  });

  it('clamps MONTHLY day 31 onto Feb 28/29 and Apr 30 (REQ-SCHD-11)', () => {
    const now = new Date('2027-01-01T00:00:00.000Z');
    const slots = service.computeCandidateSlots({
      departureTime: '10:00',
      recurrence: RecurrenceType.MONTHLY,
      daysOfWeek: [],
      dayOfMonth: 31,
      startDate: '2027-01-01',
      endDate: '2027-05-05',
      generateAheadDays: 150,
      excludedDates: new Set(),
      now,
    });

    expect(slots.map((s) => s.date)).toEqual([
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
      '2027-04-30',
    ]);
  });

  it('isolates failing templates during batch generation (REQ-SCHD-13)', async () => {
    prisma.tripTemplate.findMany.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);
    vi.spyOn(service, 'generateTripsForTemplate')
      .mockRejectedValueOnce(new Error('DB glitch on template 1'))
      .mockResolvedValueOnce(5);

    const summary = await service.runGeneratorForAllActiveTemplates();
    expect(summary.processedTemplates).toBe(2);
    expect(summary.createdTrips).toBe(5);
    expect(summary.errors).toEqual([
      { templateId: 1, message: 'DB glitch on template 1' },
    ]);
  });

  it('creates, previews, updates unbooked trips only, toggles, adds/removes exclusions, and deletes template', async () => {
    const templateRow = {
      id: 1,
      originId: 1,
      destinationId: 2,
      busTypeId: 1,
      busId: null,
      price: 40000,
      departureTime: '08:00',
      recurrence: RecurrenceType.DAILY,
      daysOfWeek: [],
      dayOfMonth: null,
      startDate: new Date('2026-12-01T00:00:00.000Z'),
      endDate: new Date('2026-12-05T00:00:00.000Z'),
      generateAheadDays: 30,
      isActive: true,
      createdById: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      origin: { id: 1, nameAr: 'دمشق' },
      destination: { id: 2, nameAr: 'حلب' },
      busType: { id: 1, nameAr: 'عادية' },
      bus: null,
      exclusions: [],
      _count: { trips: 3 },
    };

    prisma.tripTemplate.create.mockResolvedValue(templateRow);
    prisma.tripTemplate.findUnique.mockResolvedValue(templateRow);
    prisma.tripTemplate.findMany.mockResolvedValue([templateRow]);

    const preview = await service.preview({
      originId: 1,
      destinationId: 2,
      busTypeId: 1,
      price: 40000,
      departureTime: '08:00',
      recurrence: RecurrenceType.DAILY,
      startDate: '2026-12-01',
      endDate: '2026-12-03',
    });
    expect(preview.count).toBeGreaterThanOrEqual(0);

    const created = await service.create(
      {
        originId: 1,
        destinationId: 2,
        busTypeId: 1,
        price: 40000,
        departureTime: '08:00',
        recurrence: RecurrenceType.DAILY,
        startDate: '2026-12-01',
        endDate: '2026-12-05',
        exclusionDates: ['2026-12-02'],
      },
      1,
    );
    expect(created.generatedTripsCount).toBe(3);

    await service.update(1, { price: 42000 }, 1);
    expect(prisma.trip.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          templateId: 1,
          bookings: { none: { status: 'CONFIRMED' } },
        }),
      }),
    );

    await service.toggle(1, 1);
    expect(prisma.tripTemplate.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { isActive: false },
    });

    prisma.templateExclusion.upsert.mockResolvedValueOnce({
      id: 10,
      templateId: 1,
      excludedDate: new Date('2026-12-25T00:00:00.000Z'),
      reason: 'Holiday',
    });
    const excl = await service.addExclusion(
      1,
      { excludedDate: '2026-12-25', reason: 'Holiday' },
      1,
    );
    expect(excl.excludedDate).toBe('2026-12-25');

    prisma.templateExclusion.findFirst.mockResolvedValueOnce({
      id: 10,
      excludedDate: new Date('2026-12-25T00:00:00.000Z'),
    });
    await service.removeExclusion(1, 10, 1);

    const removed = await service.remove(1, 1);
    expect(removed.deleted).toBe(true);
  });
});

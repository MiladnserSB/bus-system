import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationsService } from './notifications.service.js';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: any;
  let smsProvider: any;
  let fcmProvider: any;

  beforeEach(() => {
    prisma = {
      booking: { findUnique: vi.fn() },
      trip: { findUnique: vi.fn() },
      userDevice: { findMany: vi.fn().mockResolvedValue([]) },
      notification: {
        create: vi.fn().mockResolvedValue({ id: 1 }),
        findUnique: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        findFirst: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      notificationPreference: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn(),
      },
    };
    smsProvider = { sendSms: vi.fn().mockResolvedValue({ sent: true, provider: 'log' }) };
    fcmProvider = { sendPush: vi.fn().mockResolvedValue({ sent: false, reason: 'FCM_NOT_CONFIGURED' }) };

    service = new NotificationsService(prisma, smsProvider, fcmProvider);
  });

  it('sends fallback SMS on trip cancellation when Push fails or device is missing (REQ-NOTF-05)', async () => {
    prisma.trip.findUnique.mockResolvedValueOnce({
      id: 1,
      departAt: new Date('2026-12-01T05:00:00.000Z'),
      origin: { nameAr: 'دمشق' },
      destination: { nameAr: 'حلب' },
      bookings: [
        {
          id: 5,
          userId: 10,
          contactPhone: '+963944123456',
          seats: [{ passengerPhone: '+963944123456' }],
        },
      ],
    });

    const summary = await service.notifyTripCancelledOrRescheduled(
      1,
      'TRIP_CANCELLED',
      'صيانة',
    );

    expect(summary.notifiedBookings).toBe(1);
    expect(summary.smsFallbacks).toBe(1);
    expect(smsProvider.sendSms).toHaveBeenCalledWith(
      '+963944123456',
      expect.stringContaining('أُلغيت الرحلة'),
    );
  });

  it('skips non-critical trip reminders when customer opted out (REQ-NOTF-08)', async () => {
    prisma.trip.findUnique.mockResolvedValueOnce({
      id: 1,
      departAt: new Date('2026-12-01T05:00:00.000Z'),
      origin: { nameAr: 'دمشق' },
      destination: { nameAr: 'حلب' },
      bookings: [
        {
          id: 5,
          userId: 10,
          contactPhone: '+963944123456',
          seats: [{ passengerPhone: '+963944123456' }],
        },
      ],
    });
    prisma.notificationPreference.findUnique.mockResolvedValueOnce({
      userId: 10,
      remindersEnabled: false,
      nonCriticalEnabled: true,
    });

    const sent = await service.sendTripReminder(1, 24);
    expect(sent).toBe(0);
  });
});

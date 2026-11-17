import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentMethod, Role } from '../../generated/prisma/enums.js';
import { ErrorCodes } from '../../common/constants/error-codes.js';
import { TicketsService } from './tickets.service.js';

describe('TicketsService', () => {
  let service: TicketsService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      booking: {
        findUnique: vi.fn(),
      },
    };
    const configService = new ConfigService({
      qrHmacSecret: 'test-qr-secret-32-chars-minimum!!',
    });
    service = new TicketsService(prisma, configService);
  });

  it('generates signed QR ticket payload and verifies signature (REQ-TICK-01, REQ-TICK-04, REQ-TICK-06)', async () => {
    const booking = {
      code: 'BK-20261117-0001',
      tripId: 1,
      status: 'CONFIRMED',
      totalPrice: 90000,
      paymentMethod: PaymentMethod.CASH_ON_BOARDING,
      createdAt: new Date('2026-11-17T08:00:00.000Z'),
      trip: {
        departAt: new Date('2026-11-20T05:00:00.000Z'),
        origin: { nameAr: 'دمشق', nameEn: 'Damascus' },
        destination: { nameAr: 'حلب', nameEn: 'Aleppo' },
        busType: { nameAr: 'عادية 2+2 كبير', category: 'STANDARD', size: 'LARGE', layout: '2+2' },
        bus: { plateNumber: 'دمشق 1234' },
      },
      seats: [
        {
          seatNumber: '5A',
          passengerName: 'محمد العلي',
          passengerPhone: '+963944123456',
          unitPrice: 45000,
          status: 'CONFIRMED',
          isActive: true,
        },
        {
          seatNumber: '5B',
          passengerName: 'ليلى العلي',
          passengerPhone: '+963944123456',
          unitPrice: 45000,
          status: 'CONFIRMED',
          isActive: true,
        },
      ],
    };

    const ticket = await service.buildTicket(booking);
    expect(ticket.bookingCode).toBe('BK-20261117-0001');
    expect(ticket.paymentMethodLabel).toBe('نقداً عند الصعود');
    expect(ticket.qrCodeDataUrl.startsWith('data:image/png;base64,')).toBe(true);

    prisma.booking.findUnique.mockResolvedValueOnce({
      code: 'BK-20261117-0001',
      status: 'CONFIRMED',
      trip: { status: 'OPEN', origin: { nameAr: 'دمشق' }, destination: { nameAr: 'حلب' } },
      seats: [{ seatNumber: '5A' }, { seatNumber: '5B' }],
    });

    const verified = await service.verifyQrPayload(JSON.stringify(ticket.qrPayload));
    expect(verified.valid).toBe(true);
    expect(verified.activeSeats).toEqual(['5A', '5B']);

    const tampered = { ...ticket.qrPayload, seats: ['1A'] };
    await expect(service.verifyQrPayload(JSON.stringify(tampered))).rejects.toMatchObject({
      code: ErrorCodes.INVALID_QR_SIGNATURE,
    });
  });

  it('enforces booking ownership and valid guest access token', () => {
    const guestToken = service.signGuestAccessToken('BK-20261117-0001');
    expect(() =>
      service.assertCanAccessBooking('BK-20261117-0001', null, undefined, guestToken),
    ).not.toThrow();

    expect(() =>
      service.assertCanAccessBooking(
        'BK-20261117-0001',
        10,
        {
          id: 99,
          name: 'Other',
          username: null,
          email: null,
          phone: '+963944999999',
          role: Role.CUSTOMER,
          mustChangePassword: false,
          tokenVersion: 0,
        },
      ),
    ).toThrow();
  });
});

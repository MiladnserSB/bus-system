import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DevicePlatform } from '../../generated/prisma/enums.js';
import { DevicesService } from './devices.service.js';

describe('DevicesService', () => {
  let service: DevicesService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      userDevice: {
        upsert: vi.fn().mockResolvedValue({ id: 1, fcmToken: 'tok-1', isActive: true }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    service = new DevicesService(prisma);
  });

  it('registers and deactivates FCM device tokens (REQ-NOTF-06)', async () => {
    const registered = await service.registerDevice(5, {
      fcmToken: 'tok-1',
      platform: DevicePlatform.ANDROID,
    });
    expect(registered.isActive).toBe(true);

    await service.deactivateDevice(5, 'tok-1');
    expect(prisma.userDevice.updateMany).toHaveBeenCalledWith({
      where: { userId: 5, fcmToken: 'tok-1' },
      data: { isActive: false },
    });
  });
});

import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { FcmProvider } from './providers/fcm.provider.js';
import { SmsProvider } from './providers/sms.provider.js';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, SmsProvider, FcmProvider],
  exports: [NotificationsService, SmsProvider, FcmProvider],
})
export class NotificationsModule {}

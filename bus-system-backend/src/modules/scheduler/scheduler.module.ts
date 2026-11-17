import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { TripTemplatesModule } from '../trip-templates/trip-templates.module.js';
import { SchedulerService } from './scheduler.service.js';

@Module({
  imports: [TripTemplatesModule, NotificationsModule],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}

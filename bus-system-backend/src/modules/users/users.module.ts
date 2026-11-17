import { Module } from '@nestjs/common';
import { DevicesModule } from '../devices/devices.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ProfileController } from './profile.controller.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [DevicesModule, NotificationsModule],
  controllers: [UsersController, ProfileController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}

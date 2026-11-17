import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { RedisThrottlerStorage } from './common/guards/redis-throttler.storage.js';
import { RolesGuard } from './common/guards/roles.guard.js';
import { UserAwareThrottlerGuard } from './common/guards/user-throttler.guard.js';
import { loadEnvConfig } from './config/env.config.js';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { BookingsModule } from './modules/bookings/bookings.module.js';
import { BusTypesModule } from './modules/bus-types/bus-types.module.js';
import { BusesModule } from './modules/buses/buses.module.js';
import { CitiesModule } from './modules/cities/cities.module.js';
import { DevicesModule } from './modules/devices/devices.module.js';
import { HoldsModule } from './modules/holds/holds.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { SchedulerModule } from './modules/scheduler/scheduler.module.js';
import { SettingsModule } from './modules/settings/settings.module.js';
import { TicketsModule } from './modules/tickets/tickets.module.js';
import { TripTemplatesModule } from './modules/trip-templates/trip-templates.module.js';
import { TripsModule } from './modules/trips/trips.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RedisModule } from './redis/redis.module.js';
import { RedisService } from './redis/redis.service.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [loadEnvConfig],
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService, RedisService],
      useFactory: (configService: ConfigService, redisService: RedisService) => ({
        throttlers: [
          {
            ttl: configService.get<number>('rateLimitGlobalTtlMs') ?? 60_000,
            limit: configService.get<number>('rateLimitGlobalMax') ?? 60,
          },
        ],
        storage: new RedisThrottlerStorage(redisService),
      }),
    }),
    PrismaModule,
    RedisModule,
    AuditLogsModule,
    SettingsModule,
    AuthModule,
    UsersModule,
    CitiesModule,
    BusTypesModule,
    BusesModule,
    TripsModule,
    TripTemplatesModule,
    HoldsModule,
    BookingsModule,
    TicketsModule,
    DevicesModule,
    NotificationsModule,
    ReportsModule,
    SchedulerModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: UserAwareThrottlerGuard,
    },
  ],
})
export class AppModule {}

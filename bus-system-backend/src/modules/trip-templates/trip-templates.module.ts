import { Module } from '@nestjs/common';
import { TripTemplatesController } from './trip-templates.controller.js';
import { TripTemplatesService } from './trip-templates.service.js';

@Module({
  controllers: [TripTemplatesController],
  providers: [TripTemplatesService],
  exports: [TripTemplatesService],
})
export class TripTemplatesModule {}

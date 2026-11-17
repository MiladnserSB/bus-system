import { Module } from '@nestjs/common';
import { BusesService } from './buses.service.js';
import { BusesController } from './buses.controller.js';

@Module({
  controllers: [BusesController],
  providers: [BusesService],
  exports: [BusesService],
})
export class BusesModule {}

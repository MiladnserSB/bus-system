import { Module } from '@nestjs/common';
import { BusTypesService } from './bus-types.service.js';
import { BusTypesController } from './bus-types.controller.js';

@Module({
  controllers: [BusTypesController],
  providers: [BusTypesService],
  exports: [BusTypesService],
})
export class BusTypesModule {}

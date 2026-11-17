import { Module } from '@nestjs/common';
import { CitiesService } from './cities.service.js';
import { CitiesController } from './cities.controller.js';

@Module({
  controllers: [CitiesController],
  providers: [CitiesService],
  exports: [CitiesService],
})
export class CitiesModule {}

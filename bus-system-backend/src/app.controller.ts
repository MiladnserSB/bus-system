import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from './common/decorators/public.decorator.js';
import { AppService } from './app.service.js';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @SkipThrottle()
  @Get()
  @ApiOperation({ summary: 'معلومات الخدمة' })
  getInfo() {
    return this.appService.getInfo();
  }

  @Public()
  @SkipThrottle()
  @Get('health')
  @ApiOperation({ summary: 'فحص جاهزية قاعدة البيانات وRedis' })
  getHealth() {
    return this.appService.getHealth();
  }
}

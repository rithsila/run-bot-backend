// app.controller.ts
import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Throttle, seconds } from '@nestjs/throttler';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // 5 requests per 10 seconds on just this route
  @Throttle({ default: { limit: 2, ttl: seconds(10) } })
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}

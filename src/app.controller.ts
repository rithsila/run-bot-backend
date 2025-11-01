// app.controller.ts
import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

@Controller()
export class AppController {
  @SkipThrottle()
  @Get('health')
  health() {
    return {
      status: 'ok',
      uptime: process.uptime(),                
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV ?? 'development',
    };
  }
}

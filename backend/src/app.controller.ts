import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getOverview() {
    // This route is intentionally descriptive rather than minimal.
    // In real platforms, a root route often helps humans quickly understand what service they reached.
    return this.appService.getOverview();
  }

  @Get('health')
  getHealth() {
    // Health endpoints are operationally important.
    // Load balancers, orchestration platforms, and Docker health checks rely on routes like this.
    return this.appService.getHealth();
  }
}

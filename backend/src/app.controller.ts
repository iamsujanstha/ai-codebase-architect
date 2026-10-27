import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
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
  async getHealth(@Res() response: Response): Promise<void> {
    // WHY: Orchestrators use HTTP status to keep unready instances out of rotation.
    const health = await this.appService.getHealth();
    const statusCode =
      health.status === 'ok'
        ? HttpStatus.OK
        : HttpStatus.SERVICE_UNAVAILABLE;

    response.status(statusCode).json(health);
  }
}

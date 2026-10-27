import { HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController.getHealth', () => {
  it('returns HTTP 503 when the service reports unavailable', async () => {
    const health = { status: 'error' };
    const appService = {
      getHealth: jest.fn().mockResolvedValue(health),
    } as unknown as AppService;
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;
    const controller = new AppController(appService);

    await controller.getHealth(response);

    expect(response.status).toHaveBeenCalledWith(
      HttpStatus.SERVICE_UNAVAILABLE,
    );
    expect(response.json).toHaveBeenCalledWith(health);
  });

  it('returns HTTP 200 when the service reports healthy', async () => {
    const health = { status: 'ok' };
    const appService = {
      getHealth: jest.fn().mockResolvedValue(health),
    } as unknown as AppService;
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;
    const controller = new AppController(appService);

    await controller.getHealth(response);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(response.json).toHaveBeenCalledWith(health);
  });
});

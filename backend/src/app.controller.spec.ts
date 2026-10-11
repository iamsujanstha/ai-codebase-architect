import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PostgresService } from './database/postgres.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: PostgresService,
          useValue: { isReady: () => true, query: jest.fn() },
        },
        {
          provide: getConnectionToken(),
          useValue: { readyState: 1 },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should describe the gateway service', () => {
      expect(appController.getOverview()).toEqual(
        expect.objectContaining({
          service: 'AI Commerce + Local LLM Backend Gateway',
        }),
      );
    });

    it('should report healthy status', async () => {
      const health = await appController.getHealth();
      expect(health).toEqual(
        expect.objectContaining({
          status: 'ok',
          service: 'backend-gateway',
        }),
      );
    });
  });
});

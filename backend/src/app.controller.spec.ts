import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HEALTH_REPOSITORY_TOKEN } from './database/repositories/health.repository.interface';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: HEALTH_REPOSITORY_TOKEN,
          useValue: {
            isDatabaseReady: () => true,
            getSystemCounts: jest.fn().mockResolvedValue({
              products: 10,
              users: 5,
              orders: 2,
            }),
          },
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

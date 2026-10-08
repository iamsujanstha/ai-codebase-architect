import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
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

    it('should report healthy status', () => {
      expect(appController.getHealth()).toEqual(
        expect.objectContaining({
          status: 'ok',
          service: 'backend-gateway',
        }),
      );
    });
  });
});

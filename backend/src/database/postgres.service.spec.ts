import { ConfigService } from '@nestjs/config';
import { PostgresService } from './postgres.service';

describe('PostgresService startup', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('fails startup and closes the pool after every connection attempt fails', async () => {
    const configService = {
      get: jest
        .fn()
        .mockReturnValue('postgresql://user:password@127.0.0.1:1/test'),
    } as unknown as ConfigService;
    const service = new PostgresService(configService);
    jest.useFakeTimers();

    const initialization = service.onModuleInit();
    const startupFailure = expect(initialization).rejects.toBeDefined();
    await jest.runAllTimersAsync();

    await startupFailure;
    expect(service.isReady()).toBe(false);
    expect(service.getPool()).toBeNull();
  });
});

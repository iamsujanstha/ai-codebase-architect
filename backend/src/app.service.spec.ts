import { AppService } from './app.service';
import { IHealthRepository } from './database/repositories/health.repository.interface';

describe('AppService.getHealth', () => {
  let healthRepository: jest.Mocked<IHealthRepository>;
  let appService: AppService;

  beforeEach(() => {
    healthRepository = {
      isDatabaseReady: jest.fn(),
      getSystemCounts: jest.fn(),
    };
    appService = new AppService(healthRepository);
  });

  it('reports unavailable when the database has not passed its readiness check', async () => {
    healthRepository.isDatabaseReady.mockReturnValue(false);

    const health = await appService.getHealth();

    expect(health.status).toBe('error');
    expect(health.database.state).toBe('disconnected');
    expect(healthRepository.getSystemCounts).not.toHaveBeenCalled();
  });

  it('reports healthy when database readiness queries succeed', async () => {
    healthRepository.isDatabaseReady.mockReturnValue(true);
    healthRepository.getSystemCounts.mockResolvedValue({
      products: 1,
      users: 2,
      orders: 3,
    });

    const health = await appService.getHealth();

    expect(health.status).toBe('ok');
    expect(health.database).toMatchObject({
      state: 'connected',
      counts: { products: 1, users: 2, orders: 3 },
    });
  });

  it('reports unavailable when a database readiness query fails', async () => {
    healthRepository.isDatabaseReady.mockReturnValue(true);
    healthRepository.getSystemCounts.mockRejectedValue(
      new Error('database query failed'),
    );

    const health = await appService.getHealth();

    expect(health.status).toBe('error');
    expect(health.database.state).toBe('error');
  });
});

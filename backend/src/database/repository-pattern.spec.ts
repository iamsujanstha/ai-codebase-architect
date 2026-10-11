import { PostgresOrdersRepository } from '../orders/repositories/postgres-orders.repository';
import { PostgresCatalogRepository } from '../catalog/repositories/postgres-catalog.repository';

describe('Repository Pattern (PostgresService only)', () => {
  it('should define PostgresOrdersRepository and PostgresCatalogRepository', () => {
    expect(PostgresOrdersRepository).toBeDefined();
    expect(PostgresCatalogRepository).toBeDefined();
  });

  it('should have required methods on PostgresOrdersRepository', () => {
    const mockPg: any = { query: jest.fn(), getClient: jest.fn() };
    const repo = new PostgresOrdersRepository(mockPg);
    expect(typeof repo.create).toBe('function');
    expect(typeof repo.findByUserId).toBe('function');
    expect(typeof repo.findById).toBe('function');
    expect(typeof repo.updateStatus).toBe('function');
  });

  it('should have required methods on PostgresCatalogRepository', () => {
    const mockPg: any = { query: jest.fn() };
    const repo = new PostgresCatalogRepository(mockPg);
    expect(typeof repo.getCategoryCounts).toBe('function');
    expect(typeof repo.findFeatured).toBe('function');
    expect(typeof repo.findNewArrivals).toBe('function');
    expect(typeof repo.findCatalogProducts).toBe('function');
    expect(typeof repo.findPaginated).toBe('function');
    expect(typeof repo.findBySlugOrId).toBe('function');
    expect(typeof repo.findById).toBe('function');
    expect(typeof repo.create).toBe('function');
  });
});

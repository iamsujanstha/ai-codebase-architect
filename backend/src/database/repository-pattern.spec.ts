import { PostgresOrdersRepository } from '../orders/repositories/postgres-orders.repository';
import { PostgresCatalogRepository } from '../catalog/repositories/postgres-catalog.repository';
import { PostgresPaymentsRepository } from '../payments/repositories/postgres-payments.repository';
import { PostgresUsersRepository } from '../users/repositories/postgres-users.repository';
import { PostgresChatThreadsRepository } from '../ai/repositories/postgres-chat-threads.repository';
import { PostgresAdminRepository } from '../admin/repositories/postgres-admin.repository';
import { PostgresIdempotencyRepository } from '../common/repositories/postgres-idempotency.repository';
import { PostgresHealthRepository } from './repositories/postgres-health.repository';

describe('Repository Pattern (100% Raw PostgreSQL - Zero ORM)', () => {
  const createMockPg = () => ({
    query: jest.fn().mockResolvedValue({ rows: [] }),
    getClient: jest.fn().mockResolvedValue({
      query: jest.fn().mockResolvedValue({ rows: [{ id: 1 }] }),
      release: jest.fn(),
    }),
    isReady: jest.fn().mockReturnValue(true),
  });

  it('should define all concrete repository implementations', () => {
    expect(PostgresOrdersRepository).toBeDefined();
    expect(PostgresCatalogRepository).toBeDefined();
    expect(PostgresPaymentsRepository).toBeDefined();
    expect(PostgresUsersRepository).toBeDefined();
    expect(PostgresChatThreadsRepository).toBeDefined();
    expect(PostgresAdminRepository).toBeDefined();
    expect(PostgresIdempotencyRepository).toBeDefined();
    expect(PostgresHealthRepository).toBeDefined();
  });

  it('should have required methods on PostgresOrdersRepository', () => {
    const mockPg = createMockPg() as any;
    const repo = new PostgresOrdersRepository(mockPg);
    expect(typeof repo.create).toBe('function');
    expect(typeof repo.findByUserId).toBe('function');
    expect(typeof repo.findById).toBe('function');
    expect(typeof repo.updateStatus).toBe('function');
  });

  it('should have required methods on PostgresCatalogRepository', () => {
    const mockPg = createMockPg() as any;
    const repo = new PostgresCatalogRepository(mockPg);
    expect(typeof repo.count).toBe('function');
    expect(typeof repo.getCategoryCounts).toBe('function');
    expect(typeof repo.findFeatured).toBe('function');
    expect(typeof repo.findNewArrivals).toBe('function');
    expect(typeof repo.findCatalogProducts).toBe('function');
    expect(typeof repo.findPaginated).toBe('function');
    expect(typeof repo.findBySlugOrId).toBe('function');
    expect(typeof repo.findById).toBe('function');
    expect(typeof repo.create).toBe('function');
  });

  it('should have required methods on PostgresPaymentsRepository', () => {
    const mockPg = createMockPg() as any;
    const repo = new PostgresPaymentsRepository(mockPg);
    expect(typeof repo.findProductsByIds).toBe('function');
    expect(typeof repo.findUserByEmail).toBe('function');
    expect(typeof repo.findOrCreateCustomer).toBe('function');
    expect(typeof repo.createOrderSnapshot).toBe('function');
    expect(typeof repo.updateOrderStatus).toBe('function');
    expect(typeof repo.findOrderByOrderNumber).toBe('function');
    expect(typeof repo.findOrdersByUserIdOrEmail).toBe('function');
    expect(typeof repo.markOrderAsPaidAtomic).toBe('function');
    expect(typeof repo.decrementProductStock).toBe('function');
    expect(typeof repo.checkIdempotencyKey).toBe('function');
    expect(typeof repo.createIdempotencyKey).toBe('function');
    expect(typeof repo.markIdempotencyKeyProcessed).toBe('function');
    expect(typeof repo.deleteIdempotencyKey).toBe('function');
    expect(typeof repo.claimPendingOutboxEvents).toBe('function');
    expect(typeof repo.markOutboxEventProcessing).toBe('function');
    expect(typeof repo.markOutboxEventProcessed).toBe('function');
    expect(typeof repo.scheduleOutboxEventRetry).toBe('function');
    expect(typeof repo.deadLetterOutboxEvent).toBe('function');
  });

  it('should have required methods on PostgresUsersRepository', () => {
    const mockPg = createMockPg() as any;
    const repo = new PostgresUsersRepository(mockPg);
    expect(typeof repo.create).toBe('function');
    expect(typeof repo.findByEmail).toBe('function');
    expect(typeof repo.findById).toBe('function');
    expect(typeof repo.findByGoogleId).toBe('function');
    expect(typeof repo.findByResetToken).toBe('function');
    expect(typeof repo.update).toBe('function');
    expect(typeof repo.delete).toBe('function');
    expect(typeof repo.count).toBe('function');
  });

  it('should have required methods on PostgresChatThreadsRepository', () => {
    const mockPg = createMockPg() as any;
    const repo = new PostgresChatThreadsRepository(mockPg);
    expect(typeof repo.findByUserId).toBe('function');
    expect(typeof repo.upsertThreadWithMessages).toBe('function');
    expect(typeof repo.deleteByClientThreadId).toBe('function');
  });

  it('should have required methods on PostgresAdminRepository', () => {
    const mockPg = createMockPg() as any;
    const repo = new PostgresAdminRepository(mockPg);
    expect(typeof repo.getStatsData).toBe('function');
    expect(typeof repo.getProducts).toBe('function');
    expect(typeof repo.createProduct).toBe('function');
    expect(typeof repo.findProductById).toBe('function');
    expect(typeof repo.updateProduct).toBe('function');
    expect(typeof repo.getUsers).toBe('function');
    expect(typeof repo.findUserById).toBe('function');
    expect(typeof repo.findUserWithOrders).toBe('function');
    expect(typeof repo.updateUser).toBe('function');
    expect(typeof repo.deleteUser).toBe('function');
    expect(typeof repo.getOrders).toBe('function');
    expect(typeof repo.findOrderById).toBe('function');
    expect(typeof repo.updateOrderStatus).toBe('function');
    expect(typeof repo.getCategoryCounts).toBe('function');
  });

  it('should have required methods on PostgresIdempotencyRepository', () => {
    const mockPg = createMockPg() as any;
    const repo = new PostgresIdempotencyRepository(mockPg);
    expect(typeof repo.findKey).toBe('function');
    expect(typeof repo.saveKey).toBe('function');
  });

  it('should have required methods on PostgresHealthRepository', () => {
    const mockPg = createMockPg() as any;
    const repo = new PostgresHealthRepository(mockPg);
    expect(typeof repo.isDatabaseReady).toBe('function');
    expect(typeof repo.getSystemCounts).toBe('function');
  });
});

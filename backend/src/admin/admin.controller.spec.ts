import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

describe('AdminController', () => {
  let controller: AdminController;
  let service: Partial<AdminService>;

  beforeEach(async () => {
    service = {
      getStats: jest.fn().mockResolvedValue({
        totalProducts: 8,
        publishedProducts: 6,
        totalUsers: 7,
        revenue30Days: 12480,
        sales7Days: [],
        recentUsers: [],
        lowStockProducts: [],
      }),
      getProducts: jest.fn().mockResolvedValue({
        items: [],
        total: 0,
        counts: { all: 0, published: 0, draft: 0 },
      }),
      createProduct: jest
        .fn()
        .mockImplementation((dto) => Promise.resolve({ id: 'prod-1', ...dto })),
      updateProduct: jest
        .fn()
        .mockImplementation((id, dto) => Promise.resolve({ id, ...dto })),
      softDeleteProduct: jest.fn().mockResolvedValue({
        success: true,
        message: 'Product deleted',
      }),
      getUsers: jest.fn().mockResolvedValue({
        items: [],
        total: 0,
      }),
      updateUserRole: jest
        .fn()
        .mockImplementation((_, targetId, role) =>
          Promise.resolve({ id: targetId, role }),
        ),
      updateUserStatus: jest
        .fn()
        .mockImplementation((_, targetId, status) =>
          Promise.resolve({ id: targetId, status }),
        ),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [{ provide: AdminService, useValue: service }],
    }).compile();

    controller = module.get<AdminController>(AdminController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('Stats', () => {
    it('should return dashboard stats', async () => {
      const stats = await controller.getStats();
      expect(service.getStats).toHaveBeenCalled();
      expect(stats.totalProducts).toBe(8);
      expect(stats.publishedProducts).toBe(6);
    });
  });

  describe('Products CRUD', () => {
    it('should list products', async () => {
      await controller.getProducts(
        'all',
        'desk',
        undefined,
        'price',
        '1',
        '10',
      );
      expect(service.getProducts).toHaveBeenCalledWith({
        status: 'all',
        q: 'desk',
        sort: 'price',
        page: 1,
        pageSize: 10,
      });
    });

    it('should create product', async () => {
      const res = await controller.createProduct({
        title: 'New Desk',
        price: 50000,
        category: 'desk',
      });
      expect(service.createProduct).toHaveBeenCalled();
      expect(res.id).toBe('prod-1');
    });

    it('should update product', async () => {
      const res = await controller.updateProductPatch('prod-1', {
        title: 'Updated Desk',
      });
      expect(service.updateProduct).toHaveBeenCalledWith('prod-1', {
        title: 'Updated Desk',
      });
      expect(res.title).toBe('Updated Desk');
    });

    it('should soft delete product', async () => {
      const res = await controller.deleteProduct('prod-1');
      expect(service.softDeleteProduct).toHaveBeenCalledWith('prod-1');
      expect(res.success).toBe(true);
    });
  });

  describe('User role and status self-protection', () => {
    it('should reject changing own role', async () => {
      const req = { user: { _id: 'admin-1', id: 'admin-1' } };
      await expect(
        controller.updateUserRole(req, 'admin-1', { role: 'customer' }),
      ).rejects.toThrow(BadRequestException);
      expect(service.updateUserRole).not.toHaveBeenCalled();
    });

    it('should allow changing another user role', async () => {
      const req = { user: { _id: 'admin-1', id: 'admin-1' } };
      const res = await controller.updateUserRole(req, 'user-2', {
        role: 'admin',
      });
      expect(service.updateUserRole).toHaveBeenCalledWith(
        'admin-1',
        'user-2',
        'admin',
      );
      expect(res.role).toBe('admin');
    });

    it('should reject suspending own account', async () => {
      const req = { user: { _id: 'admin-1', id: 'admin-1' } };
      await expect(
        controller.updateUserStatus(req, 'admin-1', { status: 'suspended' }),
      ).rejects.toThrow(BadRequestException);
      expect(service.updateUserStatus).not.toHaveBeenCalled();
    });

    it('should allow suspending another user account', async () => {
      const req = { user: { _id: 'admin-1', id: 'admin-1' } };
      const res = await controller.updateUserStatus(req, 'user-2', {
        status: 'suspended',
      });
      expect(service.updateUserStatus).toHaveBeenCalledWith(
        'admin-1',
        'user-2',
        'suspended',
      );
      expect(res.status).toBe('suspended');
    });
  });

  describe('Uploads', () => {
    it('should return relative url for uploaded image', () => {
      const mockFile = { filename: 'test-image.webp' } as any;
      const res = controller.uploadProductImage(mockFile);
      expect(res.url).toBe('/uploads/test-image.webp');
    });
  });
});

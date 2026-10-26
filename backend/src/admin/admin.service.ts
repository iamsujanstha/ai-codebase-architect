import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import {
  ADMIN_REPOSITORY_TOKEN,
  IAdminRepository,
} from './repositories/admin.repository.interface';

@Injectable()
export class AdminService {
  constructor(
    @Inject(ADMIN_REPOSITORY_TOKEN)
    private readonly adminRepo: IAdminRepository,
  ) {}

  // -------------------------------------------------------------
  // Brief API: GET /api/admin/stats
  // -------------------------------------------------------------
  async getStats() {
    const statsData = await this.adminRepo.getStatsData();

    return {
      totalProducts: statsData.totalProducts,
      publishedProducts: statsData.publishedProducts,
      totalUsers: statsData.totalUsers,
      totalOrders: statsData.totalOrders,
      revenue30Days: statsData.revenue30Days,
      sales7Days: statsData.sales7Days,
      recentUsers: statsData.recentUsers.map((u) => ({
        id: u.id.toString(),
        name: u.name,
        email: u.email,
        role: u.role === 'user' ? 'customer' : u.role,
        joined: u.created_at
          ? new Date(u.created_at).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })
          : '',
      })),
      lowStockProducts: statsData.lowStockProducts.map((p) =>
        this.mapProductToAdmin(p),
      ),
    };
  }

  // -------------------------------------------------------------
  // Brief API: GET /api/admin/products
  // -------------------------------------------------------------
  async getProducts(params: {
    status?: string;
    q?: string;
    sort?: string;
    page?: number;
    pageSize?: number;
  }) {
    const res = await this.adminRepo.getProducts(params);

    return {
      items: res.items.map((p) => this.mapProductToAdmin(p)),
      total: res.total,
      counts: {
        all: res.countAll,
        published: res.countPublished,
        draft: res.countDraft,
      },
    };
  }

  // -------------------------------------------------------------
  // Brief API: POST /api/admin/products
  // -------------------------------------------------------------
  async createProduct(dto: CreateProductDto) {
    const title = dto.title || dto.name || 'Untitled Product';
    const category = dto.category || dto.categorySlug || 'accessory';
    const sku = dto.sku || 'ATL-' + Math.floor(1000 + Math.random() * 9000);
    const stock = dto.stock ?? dto.inventoryCount ?? 0;
    const status = dto.status === 'draft' ? 'draft' : 'published';
    const priceDollars = (dto.price || 0) / 100;

    const product = await this.adminRepo.createProduct({
      name: title,
      description: dto.description || title,
      price: priceDollars,
      category,
      stock,
      image_url: dto.imageUrl || null,
      sku,
      status,
      featured: dto.featured ?? false,
    });

    return this.mapProductToAdmin(product);
  }

  // -------------------------------------------------------------
  // Brief API: PATCH /api/admin/products/:id
  // -------------------------------------------------------------
  async updateProduct(id: string | number, dto: UpdateProductDto) {
    const numId = typeof id === 'string' ? parseInt(id, 10) : id;
    const existing = await this.adminRepo.findProductById(numId);
    if (!existing || existing.deleted_at) {
      throw new NotFoundException('Product not found');
    }

    const data: any = {};
    if (dto.title !== undefined || dto.name !== undefined) {
      data.name = dto.title || dto.name;
    }
    if (dto.category !== undefined || dto.categorySlug !== undefined) {
      data.category = dto.category || dto.categorySlug;
    }
    if (dto.price !== undefined) {
      data.price = dto.price / 100;
    }
    if (dto.stock !== undefined || dto.inventoryCount !== undefined) {
      data.stock = dto.stock ?? dto.inventoryCount;
    }
    if (dto.description !== undefined) {
      data.description = dto.description;
    }
    if (dto.status !== undefined) {
      data.status = dto.status === 'draft' ? 'draft' : 'published';
    }
    if (dto.imageUrl !== undefined) {
      data.image_url = dto.imageUrl;
    }
    if (dto.sku !== undefined) {
      data.sku = dto.sku;
    }

    const saved = await this.adminRepo.updateProduct(numId, data);
    return this.mapProductToAdmin(saved);
  }

  // -------------------------------------------------------------
  // Brief API: DELETE /api/admin/products/:id (soft delete)
  // -------------------------------------------------------------
  async softDeleteProduct(id: string | number) {
    const numId = typeof id === 'string' ? parseInt(id, 10) : id;
    const existing = await this.adminRepo.findProductById(numId);
    if (!existing || existing.deleted_at) {
      throw new NotFoundException('Product not found');
    }

    await this.adminRepo.updateProduct(numId, { deleted_at: new Date() });
    return { success: true, message: 'Product deleted' };
  }

  // -------------------------------------------------------------
  // Brief API: GET /api/admin/users
  // -------------------------------------------------------------
  async getUsers(params: {
    role?: string;
    q?: string;
    page?: number;
    pageSize?: number;
  }) {
    return this.adminRepo.getUsers(params);
  }

  // -------------------------------------------------------------
  // Brief API: PATCH /api/admin/users/:id/role
  // -------------------------------------------------------------
  async updateUserRole(
    currentAdminId: string,
    targetUserId: string,
    role: string,
  ) {
    if (String(currentAdminId) === String(targetUserId)) {
      throw new BadRequestException('Cannot change your own role');
    }
    const numId = parseInt(targetUserId, 10);
    const user = await this.adminRepo.findUserById(numId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updated = await this.adminRepo.updateUser(numId, { role });

    return {
      id: updated.id.toString(),
      name: updated.name,
      email: updated.email,
      role: updated.role === 'user' ? 'customer' : updated.role,
      status: updated.status || (updated.is_active ? 'active' : 'suspended'),
    };
  }

  // -------------------------------------------------------------
  // Brief API: PATCH /api/admin/users/:id/status
  // -------------------------------------------------------------
  async updateUserStatus(
    currentAdminId: string,
    targetUserId: string,
    status: string,
  ) {
    if (String(currentAdminId) === String(targetUserId)) {
      throw new BadRequestException('Cannot suspend your own account');
    }
    const numId = parseInt(targetUserId, 10);
    const user = await this.adminRepo.findUserById(numId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updated = await this.adminRepo.updateUser(numId, {
      status,
      is_active: status === 'active',
    });

    return {
      id: updated.id.toString(),
      name: updated.name,
      email: updated.email,
      role: updated.role === 'user' ? 'customer' : updated.role,
      status: updated.status,
    };
  }

  private mapProductToAdmin(product: any) {
    const rawPrice = Number(product.price);
    const priceCents = rawPrice < 1000 ? Math.round(rawPrice * 100) : rawPrice;

    return {
      id: product.id.toString(),
      title: product.name,
      name: product.name,
      category: product.category,
      categorySlug: product.category
        ? product.category.toLowerCase().replace(/[^a-z0-9]+/g, '-')
        : 'general',
      price: priceCents,
      stock: product.stock,
      inventoryCount: product.stock,
      status: product.status || 'draft',
      description: product.description || '',
      sku: product.sku || `SKU-${product.id}`,
      imageUrl: product.image_url || undefined,
      image: product.image_url || undefined,
      images: product.image_url ? [product.image_url] : [],
      featured: product.featured ?? false,
      rating: 4.5,
      reviewCount: 0,
      createdAt: product.created_at,
      updatedAt: product.updated_at,
    };
  }

  // Backward compatibility
  async getDashboardStats() {
    return this.getStats();
  }

  async getAllUsers(page: number = 1, limit: number = 20, search?: string) {
    return this.getUsers({ page, pageSize: limit, q: search });
  }

  async getUserById(userId: string) {
    const numId = parseInt(userId, 10);
    const userWithOrders = await this.adminRepo.findUserWithOrders(numId);
    if (!userWithOrders) throw new NotFoundException('User not found');
    return userWithOrders;
  }

  async updateUser(userId: string, updateUserDto: UpdateUserDto) {
    const numId = parseInt(userId, 10);
    return this.adminRepo.updateUser(numId, updateUserDto);
  }

  async deleteUser(userId: string) {
    const numId = parseInt(userId, 10);
    await this.adminRepo.deleteUser(numId);
    return { message: 'User deleted successfully' };
  }

  async getAllProducts(page: number = 1, limit: number = 20, search?: string) {
    return this.getProducts({ page, pageSize: limit, q: search });
  }

  async getProductById(productId: string) {
    const numId = parseInt(productId, 10);
    const product = await this.adminRepo.findProductById(numId);
    if (!product || product.deleted_at) {
      throw new NotFoundException('Product not found');
    }
    return this.mapProductToAdmin(product);
  }

  async deleteProduct(productId: string) {
    return this.softDeleteProduct(productId);
  }

  async updateProductStock(productId: string, stock: number) {
    const numId = parseInt(productId, 10);
    return this.adminRepo.updateProduct(numId, { stock });
  }

  async getAllOrders(
    page: number = 1,
    limit: number = 20,
    status?: string,
    userId?: string,
  ) {
    const numUserId = userId ? parseInt(userId, 10) : undefined;
    const { orders, total } = await this.adminRepo.getOrders({
      page,
      limit,
      status,
      userId: numUserId,
    });

    return { orders, total, page, totalPages: Math.ceil(total / limit) };
  }

  async getUserOrders(
    userId: string,
    page: number = 1,
    limit: number = 20,
    status?: string,
  ) {
    return this.getAllOrders(page, limit, status, userId);
  }

  async getOrderById(orderId: string) {
    const numId = parseInt(orderId, 10);
    const order = await this.adminRepo.findOrderById(numId);
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async updateOrderStatus(
    orderId: string,
    updateOrderStatusDto: UpdateOrderStatusDto,
  ) {
    const numId = parseInt(orderId, 10);
    return this.adminRepo.updateOrderStatus(numId, updateOrderStatusDto.status);
  }

  async getAllCategories() {
    const categories = await this.adminRepo.getCategoryCounts();
    return categories.map((g) => ({
      id: g.id,
      name: g.name,
      slug: g.id,
      count: g.count,
    }));
  }

  async createCategory(categoryData: any) {
    const name = categoryData.name || 'General';
    const slug =
      categoryData.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return { id: slug, name, slug, count: 0 };
  }

  async updateCategory(id: string, categoryData: any) {
    const newName = categoryData.name || id;
    return {
      id,
      name: newName,
      slug: newName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    };
  }

  async deleteCategory(id: string) {
    return { success: true, message: `Category ${id} removed` };
  }
}

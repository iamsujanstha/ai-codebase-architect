import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------
  // Brief API: GET /api/admin/stats
  // -------------------------------------------------------------
  async getStats() {
    const totalProducts = await this.prisma.products.count({
      where: { deleted_at: null },
    });
    const publishedProducts = await this.prisma.products.count({
      where: {
        deleted_at: null,
        status: { not: 'draft' },
      },
    });
    const totalUsers = await this.prisma.users.count();
    const revenue30Days = await this.calculateRevenueLast30Days();
    const recentUsersDocs = await this.prisma.users.findMany({
      take: 4,
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        created_at: true,
      },
    });
    const lowStockDocs = await this.prisma.products.findMany({
      where: { deleted_at: null, stock: { lte: 5 } },
      take: 10,
    });
    const sales7Days = await this.getSalesLast7Days();

    return {
      totalProducts,
      publishedProducts,
      totalUsers,
      revenue30Days,
      sales7Days,
      recentUsers: recentUsersDocs.map((u) => ({
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
      lowStockProducts: lowStockDocs.map((p) => this.mapProductToAdmin(p)),
    };
  }

  private async calculateRevenueLast30Days(): Promise<number> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await this.prisma.orders.aggregate({
      where: {
        created_at: { gte: thirtyDaysAgo },
        status: { in: ['completed', 'paid'] },
      },
      _sum: {
        total_amount: true,
      },
    });

    const totalDec = result._sum.total_amount;
    // Return cents
    return totalDec ? Math.round(Number(totalDec) * 100) : 0;
  }

  private async getSalesLast7Days() {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const orders = await this.prisma.orders.findMany({
      where: {
        created_at: { gte: sevenDaysAgo },
        status: { in: ['completed', 'paid'] },
      },
      select: {
        total_amount: true,
        created_at: true,
      },
    });

    const result: Array<{ day: string; date: string; sales: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];

      const dayTotal = orders
        .filter(
          (o) =>
            o.created_at &&
            o.created_at.toISOString().split('T')[0] === dateStr,
        )
        .reduce((acc, o) => acc + Number(o.total_amount), 0);

      result.push({
        day: days[d.getDay()],
        date: dateStr,
        sales: Math.round(dayTotal * 100),
      });
    }

    return result;
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
    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.max(1, Number(params.pageSize) || 10);
    const skip = (page - 1) * pageSize;

    const where: any = { deleted_at: null };
    if (params.status && params.status !== 'all') {
      if (params.status === 'published' || params.status === 'live') {
        where.status = { not: 'draft' };
      } else if (params.status === 'draft') {
        where.status = 'draft';
      }
    }

    if (params.q) {
      const q = params.q.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { sku: { contains: q, mode: 'insensitive' } },
        { category: { contains: q, mode: 'insensitive' } },
      ];
    }

    let orderBy: any = { created_at: 'desc' };
    if (params.sort) {
      const isDesc = params.sort.startsWith('-');
      const field = isDesc ? params.sort.substring(1) : params.sort;
      const dir = isDesc ? 'desc' : 'asc';
      if (field === 'title') orderBy = { name: dir };
      else if (field === 'cat' || field === 'category') orderBy = { category: dir };
      else if (field === 'price') orderBy = { price: dir };
      else if (field === 'stock') orderBy = { stock: dir };
      else if (field === 'status') orderBy = { status: dir };
    }

    const [items, total, countAll, countPublished, countDraft] =
      await Promise.all([
        this.prisma.products.findMany({
          where,
          orderBy,
          skip,
          take: pageSize,
        }),
        this.prisma.products.count({ where }),
        this.prisma.products.count({ where: { deleted_at: null } }),
        this.prisma.products.count({
          where: { deleted_at: null, status: { not: 'draft' } },
        }),
        this.prisma.products.count({
          where: { deleted_at: null, status: 'draft' },
        }),
      ]);

    return {
      items: items.map((p) => this.mapProductToAdmin(p)),
      total,
      counts: {
        all: countAll,
        published: countPublished,
        draft: countDraft,
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

    const product = await this.prisma.products.create({
      data: {
        name: title,
        description: dto.description || title,
        price: priceDollars,
        category,
        stock,
        image_url: dto.imageUrl || null,
        sku,
        status,
        featured: dto.featured ?? false,
      },
    });

    return this.mapProductToAdmin(product);
  }

  // -------------------------------------------------------------
  // Brief API: PATCH /api/admin/products/:id
  // -------------------------------------------------------------
  async updateProduct(id: string | number, dto: UpdateProductDto) {
    const numId = typeof id === 'string' ? parseInt(id, 10) : id;
    const existing = await this.prisma.products.findUnique({
      where: { id: numId },
    });
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

    const saved = await this.prisma.products.update({
      where: { id: numId },
      data,
    });

    return this.mapProductToAdmin(saved);
  }

  // -------------------------------------------------------------
  // Brief API: DELETE /api/admin/products/:id (soft delete)
  // -------------------------------------------------------------
  async softDeleteProduct(id: string | number) {
    const numId = typeof id === 'string' ? parseInt(id, 10) : id;
    const existing = await this.prisma.products.findUnique({
      where: { id: numId },
    });
    if (!existing || existing.deleted_at) {
      throw new NotFoundException('Product not found');
    }

    await this.prisma.products.update({
      where: { id: numId },
      data: { deleted_at: new Date() },
    });

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
    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.max(1, Number(params.pageSize) || 10);
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (params.role && params.role !== 'all') {
      if (params.role === 'customer') {
        where.role = { in: ['customer', 'user'] };
      } else {
        where.role = params.role;
      }
    }

    if (params.q) {
      const q = params.q.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [usersList, total] = await Promise.all([
      this.prisma.users.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          is_active: true,
          status: true,
          created_at: true,
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.users.count({ where }),
    ]);

    const userIds = usersList.map((u) => u.id);
    const orderGroups = await this.prisma.orders.groupBy({
      by: ['user_id'],
      where: { user_id: { in: userIds } },
      _count: { id: true },
    });

    const orderCountMap = new Map<number, number>();
    for (const group of orderGroups) {
      orderCountMap.set(group.user_id, group._count.id);
    }

    const items = usersList.map((u) => ({
      id: u.id.toString(),
      name: u.name,
      email: u.email,
      role: u.role === 'user' ? 'customer' : u.role,
      status: u.status || (u.is_active ? 'active' : 'suspended'),
      ordersCount: orderCountMap.get(u.id) || 0,
      createdAt: u.created_at,
      joined: u.created_at
        ? new Date(u.created_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })
        : '',
    }));

    return { items, total };
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
    const user = await this.prisma.users.findUnique({ where: { id: numId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updated = await this.prisma.users.update({
      where: { id: numId },
      data: { role },
    });

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
    const user = await this.prisma.users.findUnique({ where: { id: numId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updated = await this.prisma.users.update({
      where: { id: numId },
      data: {
        status,
        is_active: status === 'active',
      },
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
      sku: product.sku || 'ATL-' + (1000 + (product.id % 9000)),
      title: product.name,
      category: product.category,
      price: priceCents,
      stock: product.stock,
      status: product.status || 'published',
      description: product.description || '',
      imageUrl: product.image_url || '',
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
    const user = await this.prisma.users.findUnique({ where: { id: numId } });
    if (!user) throw new NotFoundException('User not found');
    const orders = await this.prisma.orders.findMany({
      where: { user_id: numId },
      orderBy: { created_at: 'desc' },
      take: 10,
    });
    return { user, orders };
  }

  async updateUser(userId: string, updateUserDto: UpdateUserDto) {
    const numId = parseInt(userId, 10);
    return this.prisma.users.update({
      where: { id: numId },
      data: updateUserDto as any,
    });
  }

  async deleteUser(userId: string) {
    const numId = parseInt(userId, 10);
    await this.prisma.users.delete({ where: { id: numId } });
    return { message: 'User deleted successfully' };
  }

  async getAllProducts(page: number = 1, limit: number = 20, search?: string) {
    return this.getProducts({ page, pageSize: limit, q: search });
  }

  async getProductById(productId: string) {
    const numId = parseInt(productId, 10);
    const product = await this.prisma.products.findUnique({
      where: { id: numId },
    });
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
    return this.prisma.products.update({
      where: { id: numId },
      data: { stock },
    });
  }

  async getAllOrders(page: number = 1, limit: number = 20, status?: string, userId?: string) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (status) where.status = status;
    if (userId) where.user_id = parseInt(userId, 10);

    const [orders, total] = await Promise.all([
      this.prisma.orders.findMany({
        where,
        include: { order_items: true },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.orders.count({ where }),
    ]);

    return { orders, total, page, totalPages: Math.ceil(total / limit) };
  }

  async getUserOrders(userId: string, page: number = 1, limit: number = 20, status?: string) {
    return this.getAllOrders(page, limit, status, userId);
  }

  async getOrderById(orderId: string) {
    const numId = parseInt(orderId, 10);
    const order = await this.prisma.orders.findUnique({
      where: { id: numId },
      include: { order_items: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async updateOrderStatus(orderId: string, updateOrderStatusDto: UpdateOrderStatusDto) {
    const numId = parseInt(orderId, 10);
    return this.prisma.orders.update({
      where: { id: numId },
      data: { status: updateOrderStatusDto.status },
    });
  }

  async getAllCategories() {
    const groups = await this.prisma.products.groupBy({
      by: ['category'],
      _count: { id: true },
    });
    return groups.map((g) => ({
      id: g.category.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name: g.category,
      slug: g.category.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      count: g._count.id,
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
    await this.prisma.products.updateMany({
      where: { category: id },
      data: { category: newName },
    });
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

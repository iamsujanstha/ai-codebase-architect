import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument, UserRole } from '../users/schemas/user.schema';
import { Product, ProductDocument } from '../catalog/schemas/product.schema';
import { Category, CategoryDocument } from '../catalog/schemas/category.schema';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(Category.name) private categoryModel: Model<CategoryDocument>,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
  ) {}

  // -------------------------------------------------------------
  // Brief API: GET /api/admin/stats
  // -------------------------------------------------------------
  async getStats() {
    const [
      totalProducts,
      publishedProducts,
      totalUsers,
      revenue30Days,
      recentUsersDocs,
      lowStockDocs,
    ] = await Promise.all([
      this.productModel.countDocuments({ deletedAt: null }),
      this.productModel.countDocuments({
        deletedAt: null,
        status: { $ne: 'draft' },
      }),
      this.userModel.countDocuments(),
      this.calculateRevenueLast30Days(),
      this.userModel
        .find()
        .sort({ createdAt: -1 })
        .limit(4)
        .select('-password -resetToken -resetTokenExpires')
        .lean(),
      this.productModel
        .find({ deletedAt: null, inventoryCount: { $lte: 5 } })
        .limit(10)
        .lean(),
    ]);

    const sales7Days = await this.getSalesLast7Days();

    return {
      totalProducts,
      publishedProducts,
      totalUsers,
      revenue30Days,
      sales7Days,
      recentUsers: recentUsersDocs.map((u: any) => ({
        id: u._id.toString(),
        name: u.name,
        email: u.email,
        role: u.role === 'user' ? 'customer' : u.role,
        joined: u.createdAt
          ? new Date(u.createdAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })
          : '',
      })),
      lowStockProducts: lowStockDocs.map((p: any) => this.mapProductToAdmin(p)),
    };
  }

  private async calculateRevenueLast30Days(): Promise<number> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const result = await this.orderModel.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo },
          status: { $in: ['completed', 'paid'] },
        },
      },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]);
    return result[0]?.total || 0;
  }

  private async getSalesLast7Days() {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const result: Array<{ day: string; date: string; sales: number }> = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const endOfDay = new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate(),
        23,
        59,
        59,
        999,
      );

      const salesResult = await this.orderModel.aggregate([
        {
          $match: {
            createdAt: { $gte: startOfDay, $lte: endOfDay },
            status: { $in: ['completed', 'paid'] },
          },
        },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]);
      const sales = salesResult[0]?.total || 0;
      result.push({
        day: days[d.getDay()],
        date: d.toISOString().split('T')[0],
        sales,
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

    const baseFilter: any = { deletedAt: null };
    if (params.status && params.status !== 'all') {
      if (params.status === 'published' || params.status === 'live') {
        baseFilter.status = { $ne: 'draft' };
      } else if (params.status === 'draft') {
        baseFilter.status = 'draft';
      }
    }

    if (params.q) {
      const q = params.q.trim();
      baseFilter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { sku: { $regex: q, $options: 'i' } },
        { categorySlug: { $regex: q, $options: 'i' } },
        { categoryName: { $regex: q, $options: 'i' } },
      ];
    }

    let sortObj: any = { createdAt: -1 };
    if (params.sort) {
      const isDesc = params.sort.startsWith('-');
      const field = isDesc ? params.sort.substring(1) : params.sort;
      const order = isDesc ? -1 : 1;
      if (field === 'title') sortObj = { name: order };
      else if (field === 'cat' || field === 'category')
        sortObj = { categorySlug: order };
      else if (field === 'price') sortObj = { price: order };
      else if (field === 'stock') sortObj = { inventoryCount: order };
      else if (field === 'status') sortObj = { status: order };
    }

    const [items, total, countAll, countPublished, countDraft] =
      await Promise.all([
        this.productModel
          .find(baseFilter)
          .sort(sortObj)
          .skip(skip)
          .limit(pageSize)
          .lean(),
        this.productModel.countDocuments(baseFilter),
        this.productModel.countDocuments({ deletedAt: null }),
        this.productModel.countDocuments({
          deletedAt: null,
          status: { $ne: 'draft' },
        }),
        this.productModel.countDocuments({ deletedAt: null, status: 'draft' }),
      ]);

    return {
      items: items.map((p: any) => this.mapProductToAdmin(p)),
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
    const slug =
      (title
        .toLowerCase()
        .replace(/ /g, '-')
        .replace(/[^\w-]+/g, '') || 'product') +
      '-' +
      Date.now().toString(36);
    const category = dto.category || dto.categorySlug || 'accessory';
    const sku = dto.sku || 'ATL-' + Math.floor(1000 + Math.random() * 9000);
    const stock = dto.stock ?? dto.inventoryCount ?? 0;
    const status = dto.status === 'draft' ? 'draft' : 'published';

    const product = new this.productModel({
      name: title,
      slug,
      subtitle: dto.subtitle || dto.description || title,
      shortDescription: dto.shortDescription || dto.description || title,
      description: dto.description || title,
      price: dto.price,
      currency: dto.currency || 'USD',
      inventoryCount: stock,
      categorySlug: category,
      categoryName: dto.categoryName || category,
      status,
      sku,
      imageUrl: dto.imageUrl || '',
      rating: 5.0,
      reviewCount: 0,
      heroBadge: dto.heroBadge || 'New',
      featured: dto.featured ?? false,
      bestSeller: dto.bestSeller ?? false,
      newArrival: dto.newArrival ?? true,
      visual: {
        gradientFrom: '#ff385c',
        gradientTo: '#a93bff',
        accent: '#ff385c',
        glyph: 'box',
      },
      specs: [],
      deletedAt: null,
    });

    const saved = await product.save();
    return this.mapProductToAdmin(saved);
  }

  // -------------------------------------------------------------
  // Brief API: PATCH /api/admin/products/:id
  // -------------------------------------------------------------
  async updateProduct(productId: string, dto: UpdateProductDto) {
    const product = await this.productModel.findById(productId);
    if (!product || product.deletedAt) {
      throw new NotFoundException('Product not found');
    }

    if (dto.title !== undefined || dto.name !== undefined) {
      product.name = dto.title || dto.name!;
    }
    if (dto.category !== undefined || dto.categorySlug !== undefined) {
      product.categorySlug = dto.category || dto.categorySlug!;
      product.categoryName = dto.categoryName || product.categorySlug;
    }
    if (dto.price !== undefined) {
      product.price = dto.price;
    }
    if (dto.stock !== undefined || dto.inventoryCount !== undefined) {
      product.inventoryCount = (dto.stock ?? dto.inventoryCount)!;
    }
    if (dto.description !== undefined) {
      product.description = dto.description;
      product.shortDescription = dto.description;
    }
    if (dto.status !== undefined) {
      product.status = dto.status === 'draft' ? 'draft' : 'published';
    }
    if (dto.imageUrl !== undefined) {
      product.imageUrl = dto.imageUrl;
    }
    if (dto.sku !== undefined) {
      product.sku = dto.sku;
    }

    const saved = await product.save();
    return this.mapProductToAdmin(saved);
  }

  // -------------------------------------------------------------
  // Brief API: DELETE /api/admin/products/:id (soft delete)
  // -------------------------------------------------------------
  async softDeleteProduct(productId: string) {
    const product = await this.productModel.findById(productId);
    if (!product || product.deletedAt) {
      throw new NotFoundException('Product not found');
    }
    product.deletedAt = new Date();
    await product.save();
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

    const filter: any = {};
    if (params.role && params.role !== 'all') {
      if (params.role === 'customer') {
        filter.role = { $in: ['customer', 'user'] };
      } else {
        filter.role = params.role;
      }
    }

    if (params.q) {
      const q = params.q.trim();
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.userModel
        .find(filter)
        .select('-password -resetToken -resetTokenExpires')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),
      this.userModel.countDocuments(filter),
    ]);

    const userIds = users.map((u) => u._id.toString());
    const orderCounts = await this.orderModel.aggregate([
      { $match: { userId: { $in: userIds } } },
      { $group: { _id: '$userId', count: { $sum: 1 } } },
    ]);
    const orderCountMap = new Map<string, number>();
    for (const item of orderCounts) {
      orderCountMap.set(String(item._id), item.count);
    }

    const items = users.map((u: any) => ({
      id: u._id.toString(),
      name: u.name,
      email: u.email,
      role: u.role === 'user' ? 'customer' : u.role,
      status: u.status || (u.isActive === false ? 'suspended' : 'active'),
      ordersCount: orderCountMap.get(u._id.toString()) || 0,
      createdAt: u.createdAt,
      joined: u.createdAt
        ? new Date(u.createdAt).toLocaleDateString('en-US', {
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
    const user = await this.userModel.findById(targetUserId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    user.role = role as any;
    await user.save();
    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role === 'user' ? 'customer' : user.role,
      status: user.status || (user.isActive === false ? 'suspended' : 'active'),
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
    const user = await this.userModel.findById(targetUserId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    user.status = status;
    user.isActive = status === 'active';
    await user.save();
    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role === 'user' ? 'customer' : user.role,
      status: user.status,
    };
  }

  // Map product to brief contract
  private mapProductToAdmin(product: any) {
    return {
      id: product._id ? product._id.toString() : product.id,
      sku:
        product.sku ||
        'ATL-' +
          (product._id
            ? product._id.toString().slice(-4).toUpperCase()
            : '1001'),
      title: product.name || product.title || '',
      category: product.categorySlug || product.categoryName || 'accessory',
      price: product.price,
      stock: product.inventoryCount ?? product.stock ?? 0,
      status: product.status || 'published',
      description: product.description || '',
      imageUrl: product.imageUrl || '',
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }

  // -------------------------------------------------------------
  // Existing methods preserved for backward compatibility
  // -------------------------------------------------------------
  async getDashboardStats() {
    return this.getStats();
  }

  async getAllUsers(page: number = 1, limit: number = 20, search?: string) {
    return this.getUsers({ page, pageSize: limit, q: search });
  }

  async getUserById(userId: string) {
    const user = await this.userModel.findById(userId).lean();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const orders = await this.orderModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
    const orderStats = await this.orderModel.aggregate([
      { $match: { userId } },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalSpent: { $sum: '$total' },
        },
      },
    ]);
    return {
      user,
      orders,
      stats: orderStats[0] || { totalOrders: 0, totalSpent: 0 },
    };
  }

  async updateUser(userId: string, updateUserDto: UpdateUserDto) {
    const user = await this.userModel.findByIdAndUpdate(
      userId,
      { $set: updateUserDto },
      { new: true },
    );
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async deleteUser(userId: string) {
    const user = await this.userModel.findByIdAndDelete(userId);
    if (!user) throw new NotFoundException('User not found');
    return { message: 'User deleted successfully' };
  }

  async getAllProducts(
    page: number = 1,
    limit: number = 20,
    search?: string,
    category?: string,
  ) {
    return this.getProducts({ page, pageSize: limit, q: search });
  }

  async getProductById(productId: string) {
    const product = await this.productModel.findById(productId).lean();
    if (!product || (product as any).deletedAt) {
      throw new NotFoundException('Product not found');
    }
    return this.mapProductToAdmin(product);
  }

  async deleteProduct(productId: string) {
    return this.softDeleteProduct(productId);
  }

  async updateProductStock(productId: string, inventoryCount: number) {
    const product = await this.productModel.findByIdAndUpdate(
      productId,
      { $set: { inventoryCount } },
      { new: true },
    );
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async getAllOrders(
    page: number = 1,
    limit: number = 20,
    status?: string,
    userId?: string,
  ) {
    const skip = (page - 1) * limit;
    const query: any = {};
    if (status) query.status = status;
    if (userId) query.userId = userId;

    const [orders, total] = await Promise.all([
      this.orderModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.orderModel.countDocuments(query),
    ]);

    return {
      orders,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
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
    const order = await this.orderModel.findById(orderId).lean();
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async updateOrderStatus(
    orderId: string,
    updateOrderStatusDto: UpdateOrderStatusDto,
  ) {
    const order = await this.orderModel.findByIdAndUpdate(
      orderId,
      { $set: { status: updateOrderStatusDto.status } },
      { new: true },
    );
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async getAllCategories() {
    return this.categoryModel.find().sort({ sortOrder: 1 }).lean();
  }

  async createCategory(categoryData: any) {
    const slug = categoryData.name
      .toLowerCase()
      .replace(/ /g, '-')
      .replace(/[^\w-]+/g, '');
    const category = new this.categoryModel({ ...categoryData, slug });
    return category.save();
  }

  async updateCategory(categoryId: string, categoryData: any) {
    const category = await this.categoryModel.findByIdAndUpdate(
      categoryId,
      { $set: categoryData },
      { new: true },
    );
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  async deleteCategory(categoryId: string) {
    const category = await this.categoryModel.findByIdAndDelete(categoryId);
    if (!category) throw new NotFoundException('Category not found');
    return { message: 'Category deleted successfully' };
  }
}

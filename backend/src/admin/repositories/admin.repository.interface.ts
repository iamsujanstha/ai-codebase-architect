export interface AdminStatsData {
  totalProducts: number;
  publishedProducts: number;
  totalUsers: number;
  totalOrders: number;
  revenue30Days: number;
  sales7Days: Array<{ day: string; date: string; sales: number }>;
  recentUsers: any[];
  lowStockProducts: any[];
}

export interface IAdminRepository {
  getStatsData(): Promise<AdminStatsData>;
  getProducts(params: {
    status?: string;
    q?: string;
    sort?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{
    items: any[];
    total: number;
    countAll: number;
    countPublished: number;
    countDraft: number;
  }>;
  createProduct(data: any): Promise<any>;
  findProductById(id: number): Promise<any | null>;
  updateProduct(id: number, data: any): Promise<any>;
  getUsers(params: {
    role?: string;
    q?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: any[]; total: number }>;
  findUserById(id: number): Promise<any | null>;
  findUserWithOrders(id: number): Promise<{ user: any; orders: any[] } | null>;
  updateUser(id: number, data: any): Promise<any>;
  deleteUser(id: number): Promise<void>;
  getOrders(params: {
    page: number;
    limit: number;
    status?: string;
    userId?: number;
  }): Promise<{ orders: any[]; total: number }>;
  findOrderById(id: number): Promise<any | null>;
  updateOrderStatus(id: number, status: string): Promise<any>;
  getCategoryCounts(): Promise<
    Array<{ id: string; name: string; count: number }>
  >;
}

export const ADMIN_REPOSITORY_TOKEN = Symbol('IAdminRepository');

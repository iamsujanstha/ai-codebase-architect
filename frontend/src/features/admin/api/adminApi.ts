import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const api = axios.create({
  baseURL: `${API_URL}/admin`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Add error interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      window.dispatchEvent(new Event('atlas:auth-unauthorized'));
      if (!window.location.pathname.startsWith('/login')) {
        const returnTo = window.location.pathname + window.location.search;
        window.location.assign(`/login?redirect=${encodeURIComponent(returnTo)}`);
      }
    }
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  },
);

export interface AdminProduct {
  id: string;
  sku: string;
  title: string;
  category: string;
  price: number; // in cents
  stock: number;
  status: 'draft' | 'published';
  description: string;
  imageUrl: string;
  tags?: string[];
  keyHighlights?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminProductsResponse {
  items: AdminProduct[];
  total: number;
  counts: {
    all: number;
    published: number;
    draft: number;
  };
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: 'customer' | 'admin';
  status: 'active' | 'suspended';
  ordersCount: number;
  createdAt?: string;
  joined: string;
}

export interface AdminUsersResponse {
  items: AdminUser[];
  total: number;
}

export interface SalesDay {
  day: string;
  date: string;
  sales: number;
}

export interface AdminStats {
  totalProducts: number;
  publishedProducts: number;
  totalUsers: number;
  revenue30Days: number;
  sales7Days: SalesDay[];
  recentUsers: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    joined: string;
  }>;
  lowStockProducts: AdminProduct[];
}

export const adminApi = {
  // Dashboard & Stats
  getStats: async (): Promise<AdminStats> => {
    const { data } = await api.get('/stats');
    return data;
  },

  getDashboardStats: async (): Promise<AdminStats> => {
    const { data } = await api.get('/stats');
    return data;
  },

  // Products
  getProducts: async (params?: {
    status?: string;
    q?: string;
    sort?: string;
    page?: number;
    pageSize?: number;
  }): Promise<AdminProductsResponse> => {
    const { data } = await api.get('/products', { params });
    return data;
  },

  getProductById: async (id: string): Promise<AdminProduct> => {
    const { data } = await api.get(`/products/${id}`);
    return data;
  },

  createProduct: async (
    productData: Partial<AdminProduct>,
  ): Promise<AdminProduct> => {
    const { data } = await api.post('/products', productData);
    return data;
  },

  updateProduct: async (
    id: string,
    productData: Partial<AdminProduct>,
  ): Promise<AdminProduct> => {
    const { data } = await api.patch(`/products/${id}`, productData);
    return data;
  },

  deleteProduct: async (
    id: string,
  ): Promise<{ success: boolean; message: string }> => {
    const { data } = await api.delete(`/products/${id}`);
    return data;
  },

  uploadImage: async (file: File): Promise<{ url: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await api.post('/uploads', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },

  updateProductStock: async (id: string, inventoryCount: number) => {
    const { data } = await api.put(`/products/${id}/stock`, { inventoryCount });
    return data;
  },

  // Users
  getUsers: async (params?: {
    role?: string;
    q?: string;
    page?: number;
    pageSize?: number;
  }): Promise<AdminUsersResponse> => {
    const { data } = await api.get('/users', { params });
    return data;
  },

  getUserById: async (id: string) => {
    const { data } = await api.get(`/users/${id}`);
    return data;
  },

  updateUserRole: async (id: string, role: string): Promise<AdminUser> => {
    const { data } = await api.patch(`/users/${id}/role`, { role });
    return data;
  },

  updateUserStatus: async (
    id: string,
    status: 'active' | 'suspended',
  ): Promise<AdminUser> => {
    const { data } = await api.patch(`/users/${id}/status`, { status });
    return data;
  },

  updateUser: async (id: string, userData: any) => {
    const { data } = await api.put(`/users/${id}`, userData);
    return data;
  },

  deleteUser: async (id: string) => {
    const { data } = await api.delete(`/users/${id}`);
    return data;
  },

  // Orders
  getOrders: async (page = 1, limit = 20, status?: string, userId?: string) => {
    const params: any = { page, limit };
    if (status) params.status = status;
    if (userId) params.userId = userId;
    const { data } = await api.get('/orders', { params });
    return data;
  },

  getUserOrders: async (
    userId: string,
    page = 1,
    limit = 20,
    status?: string,
  ) => {
    const params: any = { page, limit };
    if (status) params.status = status;
    const { data } = await api.get(`/users/${userId}/orders`, { params });
    return data;
  },

  getOrderById: async (id: string) => {
    const { data } = await api.get(`/orders/${id}`);
    return data;
  },

  updateOrderStatus: async (id: string, status: string) => {
    const { data } = await api.put(`/orders/${id}/status`, { status });
    return data;
  },

  // Categories
  getCategories: async () => {
    const { data } = await api.get('/categories');
    return data;
  },

  createCategory: async (categoryData: any) => {
    const { data } = await api.post('/categories', categoryData);
    return data;
  },

  updateCategory: async (id: string, categoryData: any) => {
    const { data } = await api.put(`/categories/${id}`, categoryData);
    return data;
  },

  deleteCategory: async (id: string) => {
    const { data } = await api.delete(`/categories/${id}`);
    return data;
  },
};

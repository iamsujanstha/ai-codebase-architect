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
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export const adminApi = {
  // Dashboard
  getDashboardStats: async () => {
    const { data } = await api.get('/dashboard/stats');
    return data;
  },

  // Users
  getUsers: async (page = 1, limit = 20, search?: string) => {
    const { data } = await api.get('/users', { params: { page, limit, search } });
    return data;
  },

  getUserById: async (id: string) => {
    const { data } = await api.get(`/users/${id}`);
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

  // Products
  getProducts: async (page = 1, limit = 20, search?: string, category?: string) => {
    const { data } = await api.get('/products', { params: { page, limit, search, category } });
    return data;
  },

  getProductById: async (id: string) => {
    const { data } = await api.get(`/products/${id}`);
    return data;
  },

  createProduct: async (productData: any) => {
    const { data } = await api.post('/products', productData);
    return data;
  },

  updateProduct: async (id: string, productData: any) => {
    const { data } = await api.put(`/products/${id}`, productData);
    return data;
  },

  deleteProduct: async (id: string) => {
    const { data } = await api.delete(`/products/${id}`);
    return data;
  },

  updateProductStock: async (id: string, inventoryCount: number) => {
    const { data } = await api.put(`/products/${id}/stock`, { inventoryCount });
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

  getUserOrders: async (userId: string, page = 1, limit = 20, status?: string) => {
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

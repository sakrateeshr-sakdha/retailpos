import { Product, Category, Sale, Shop, User, SalesSummary, StockMovement } from '../types/index';

const API_BASE = '/api';

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('retailpos_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = {
    'Content-Type': 'application/json',
    ...getAuthHeader(),
    ...(options.headers || {}),
  };

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({ success: false, message: 'Server response parsing failed' }));

  if (!res.ok) {
    throw new Error(data.message || `Request failed with status ${res.status}`);
  }

  return data;
}

export const api = {
  // Auth
  login: (credentials: { username: string; password: string }) =>
    request<{ success: boolean; token: string; user: User; shop: Shop }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }),

  getMe: () =>
    request<{ success: boolean; user: User; shop: Shop }>('/auth/me'),

  getCashiers: () =>
    request<{ success: boolean; users: User[] }>('/auth/cashiers'),

  createCashier: (data: { name: string; username: string; password: string }) =>
    request<{ success: boolean; user: User }>('/auth/cashiers', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Shop
  getShop: () =>
    request<{ success: boolean; shop: Shop }>('/shop'),

  updateShop: (data: Partial<Shop>) =>
    request<{ success: boolean; shop: Shop }>('/shop', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // Categories
  getCategories: () =>
    request<{ success: boolean; categories: Category[] }>('/categories'),

  createCategory: (data: { name: string; description?: string }) =>
    request<{ success: boolean; category: Category }>('/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Products
  getProducts: (params?: { categoryId?: string; search?: string; lowStock?: boolean }) => {
    const query = new URLSearchParams();
    if (params?.categoryId) query.append('categoryId', params.categoryId);
    if (params?.search) query.append('search', params.search);
    if (params?.lowStock) query.append('lowStock', 'true');
    const qs = query.toString() ? `?${query.toString()}` : '';
    return request<{ success: boolean; count: number; products: Product[] }>(`/products${qs}`);
  },

  searchProducts: (query: string) =>
    request<{ success: boolean; products: Product[] }>(`/products/search?q=${encodeURIComponent(query)}`),

  createProduct: (data: Partial<Product>) =>
    request<{ success: boolean; product: Product }>('/products', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateProduct: (id: string, data: Partial<Product>) =>
    request<{ success: boolean; product: Product }>(`/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteProduct: (id: string) =>
    request<{ success: boolean; message: string }>(`/products/${id}`, {
      method: 'DELETE',
    }),

  // Sales
  createSale: (saleData: any) =>
    request<{ success: boolean; message: string; sale: Sale }>('/sales', {
      method: 'POST',
      body: JSON.stringify(saleData),
    }),

  getSales: (params?: { range?: string; search?: string; paymentMethod?: string; page?: number }) => {
    const query = new URLSearchParams();
    if (params?.range) query.append('range', params.range);
    if (params?.search) query.append('search', params.search);
    if (params?.paymentMethod) query.append('paymentMethod', params.paymentMethod);
    if (params?.page) query.append('page', params.page.toString());
    const qs = query.toString() ? `?${query.toString()}` : '';
    return request<{ success: boolean; sales: Sale[]; pagination: any }>(`/sales${qs}`);
  },

  getSalesSummary: () =>
    request<{ success: boolean; data: SalesSummary }>('/sales/summary'),

  getSaleById: (id: string) =>
    request<{ success: boolean; sale: Sale }>(`/sales/${id}`),

  syncSales: (sales: any[]) =>
    request<{ success: boolean; synced: any[]; failed: any[] }>('/sales/sync', {
      method: 'POST',
      body: JSON.stringify({ sales }),
    }),

  // Stock
  addStock: (data: { productId: string; quantity: number; reason?: string }) =>
    request<{ success: boolean; message: string }>('/stock/in', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  adjustStock: (data: {
    productId: string;
    quantity: number;
    type: 'ADJUSTMENT' | 'RETURN' | 'PURCHASE';
    isDeduction: boolean;
    reason: string;
  }) =>
    request<{ success: boolean; message: string }>('/stock/adjust', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getStockMovements: (params?: { productId?: string; page?: number }) => {
    const query = new URLSearchParams();
    if (params?.productId) query.append('productId', params.productId);
    if (params?.page) query.append('page', params.page.toString());
    const qs = query.toString() ? `?${query.toString()}` : '';
    return request<{ success: boolean; data: { movements: StockMovement[]; pagination: any } }>(
      `/stock/movements${qs}`
    );
  },

  getLowStockAlerts: () =>
    request<{ success: boolean; count: number; data: Product[] }>('/stock/alerts'),
};

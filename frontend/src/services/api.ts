import { Product, Category, Sale, Shop, User, SalesSummary, StockMovement, Customer, CustomerPayment, PaymentMethod, DailyClosing } from '../types/index';

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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
      signal: options.signal || controller.signal,
    });

    const data = await res.json().catch(() => ({ success: false, message: 'Server response parsing failed' }));

    if (!res.ok) {
      const err: any = new Error(data.message || `Request failed with status ${res.status}`);
      err.status = res.status;
      throw err;
    }

    return data;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      const timeoutErr: any = new Error('Request timed out. Please check your network connection.');
      timeoutErr.status = 408;
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export interface OnboardPayload {
  ownerName: string;
  username: string;
  password: string;
  shopName: string;
  phone?: string;
  address?: string;
  gstNumber?: string;
  upiId?: string;
  currency?: string;
  invoicePrefix?: string;
  receiptFooter?: string;
  seedStarterCatalog?: boolean;
}

export const api = {
  // Auth
  login: (credentials: { username: string; password: string }) =>
    request<{ success: boolean; token: string; user: User; shop: Shop }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }),

  onboard: (data: OnboardPayload) =>
    request<{ success: boolean; token: string; user: User; shop: Shop; message: string }>('/auth/onboard', {
      method: 'POST',
      body: JSON.stringify(data),
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

  verifyAdminPin: (pin: string) =>
    request<{ success: boolean; message: string; adminAuthToken: string }>('/auth/verify-admin-pin', {
      method: 'POST',
      body: JSON.stringify({ pin }),
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

  createProduct: (data: Partial<Product>, adminAuthToken?: string) =>
    request<{ success: boolean; product: Product }>('/products', {
      method: 'POST',
      headers: adminAuthToken ? { 'x-admin-pin-auth': adminAuthToken } : {},
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

  importProducts: (data: { products: any[]; updateExisting?: boolean; dryRun?: boolean }) =>
    request<{
      success: boolean;
      message?: string;
      summary: { total: number; imported: number; updated: number; skipped: number; errorsCount: number };
      errors?: { row: number; field: string; message: string; data?: any }[];
      preview?: any[];
    }>('/products/import', {
      method: 'POST',
      body: JSON.stringify(data),
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

  // Customers & Customer Credit
  getCustomers: (params?: { search?: string; hasBalance?: boolean }) => {
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    if (params?.hasBalance !== undefined) query.append('hasBalance', String(params.hasBalance));
    const qs = query.toString() ? `?${query.toString()}` : '';
    return request<{
      success: boolean;
      customers: Customer[];
      summary: {
        totalOutstandingCredit: number;
        totalCustomers: number;
        customersWithBalance: number;
      };
    }>(`/customers${qs}`);
  },

  getCustomer: (id: string) =>
    request<{ success: boolean; customer: Customer }>(`/customers/${id}`),

  createCustomer: (data: {
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    openingBalance?: number;
  }) =>
    request<{ success: boolean; customer: Customer; message: string }>('/customers', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateCustomer: (
    id: string,
    data: {
      name?: string;
      phone?: string;
      email?: string;
      address?: string;
    }
  ) =>
    request<{ success: boolean; customer: Customer; message: string }>(`/customers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  recordCustomerPayment: (
    id: string,
    data: {
      amount: number;
      paymentMethod: PaymentMethod;
      notes?: string;
    }
  ) =>
    request<{
      success: boolean;
      payment: CustomerPayment;
      customer: Customer;
      message: string;
    }>(`/customers/${id}/payments`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteCustomer: (id: string) =>
    request<{ success: boolean; message: string }>(`/customers/${id}`, {
      method: 'DELETE',
    }),

  // Backup & Restore
  getBackupStatus: () =>
    request<{
      success: boolean;
      status: {
        lastBackupAt: string | null;
        counts: { products: number; customers: number; sales: number };
        recentBackups: any[];
      };
    }>('/backup/status'),

  exportBackup: () =>
    request<any>('/backup/export'),

  restoreBackup: (backupData: any) =>
    request<{ success: boolean; message: string; restored: any }>('/backup/restore', {
      method: 'POST',
      body: JSON.stringify(backupData),
    }),

  // Daily Cash Closing
  getClosingSummary: (date?: string) => {
    const qs = date ? `?date=${encodeURIComponent(date)}` : '';
    return request<{
      success: boolean;
      summary: {
        date: string;
        totalBills: number;
        grossSales: number;
        discounts: number;
        netSales: number;
        cashSales: number;
        upiSales: number;
        cardSales: number;
        creditSales: number;
        expectedCash: number;
        isClosed: boolean;
        closingRecord: DailyClosing | null;
      };
    }>(`/closing/summary${qs}`);
  },

  closeDay: (data: { actualCash: number; notes?: string; closingDate?: string }) =>
    request<{ success: boolean; message: string; closing: DailyClosing }>('/closing', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getClosingHistory: (limit?: number) => {
    const qs = limit ? `?limit=${limit}` : '';
    return request<{
      success: boolean;
      closings: DailyClosing[];
    }>(`/closing/history${qs}`);
  },
};

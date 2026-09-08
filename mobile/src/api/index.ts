import { apiRequest } from './client';
import {
  User,
  Shop,
  Product,
  Category,
  Customer,
  CustomerPayment,
  Sale,
  DailyClosing,
  ClosingSummary,
  PaymentMethod,
} from '../types/index';

export const api = {
  // Authentication
  login: (credentials: { username: string; password: string }) =>
    apiRequest<{
      success: boolean;
      message: string;
      token: string;
      user: User;
      shop: Shop;
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }),

  getMe: () =>
    apiRequest<{
      success: boolean;
      user: User;
      shop: Shop;
    }>('/auth/me'),

  verifyAdminPin: (pin: string) =>
    apiRequest<{
      success: boolean;
      message: string;
      adminAuthToken: string;
    }>('/auth/verify-admin-pin', {
      method: 'POST',
      body: JSON.stringify({ pin }),
    }),

  // Products
  getProducts: (params?: { search?: string; categoryId?: string; isActive?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.append('search', params.search);
    if (params?.categoryId) qs.append('categoryId', params.categoryId);
    if (params?.isActive !== undefined) qs.append('isActive', String(params.isActive));
    const qStr = qs.toString() ? `?${qs.toString()}` : '';
    return apiRequest<{ success: boolean; count: number; products: Product[] }>(`/products${qStr}`);
  },

  searchProducts: (q: string) =>
    apiRequest<{ success: boolean; products: Product[] }>(`/products/search?q=${encodeURIComponent(q)}`),

  getProductById: (id: string) =>
    apiRequest<{ success: boolean; product: Product }>(`/products/${id}`),

  createProduct: (productData: Partial<Product>, adminPinToken?: string) =>
    apiRequest<{ success: boolean; message: string; product: Product }>('/products', {
      method: 'POST',
      body: JSON.stringify(productData),
      adminPinAuthToken: adminPinToken,
    }),

  getCategories: () =>
    apiRequest<{ success: boolean; categories: Category[] }>('/categories'),

  // Sales
  createSale: (saleData: any, idempotencyKey?: string) =>
    apiRequest<{ success: boolean; message: string; sale: Sale; isDuplicate?: boolean }>('/sales', {
      method: 'POST',
      body: JSON.stringify({
        ...saleData,
        ...(idempotencyKey ? { idempotencyKey } : {}),
      }),
      idempotencyKey,
    }),

  syncSales: (sales: any[]) =>
    apiRequest<{
      success: boolean;
      synced: { idempotencyKey: string; saleId: string; invoiceNumber: string; status: string }[];
      failed: { idempotencyKey: string; reason: string }[];
    }>('/sales/sync', {
      method: 'POST',
      body: JSON.stringify({ sales }),
    }),

  getSales: (params?: { range?: string; search?: string; page?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.range) qs.append('range', params.range);
    if (params?.search) qs.append('search', params.search);
    if (params?.page) qs.append('page', String(params.page));
    if (params?.limit) qs.append('limit', String(params.limit));
    const qStr = qs.toString() ? `?${qs.toString()}` : '';
    return apiRequest<{ success: boolean; sales: Sale[]; pagination: any }>(`/sales${qStr}`);
  },

  getSalesSummary: () =>
    apiRequest<{
      success: boolean;
      data: {
        today: {
          totalAmount: number;
          billCount: number;
          cashAmount: number;
          upiAmount: number;
          cardAmount: number;
          creditAmount: number;
          totalDiscount: number;
        };
      };
    }>('/sales/summary'),

  getSaleById: (id: string) =>
    apiRequest<{ success: boolean; sale: Sale }>(`/sales/${id}`),

  // Customers & Khata
  getCustomers: (params?: { search?: string; hasBalance?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.append('search', params.search);
    if (params?.hasBalance !== undefined) qs.append('hasBalance', String(params.hasBalance));
    const qStr = qs.toString() ? `?${qs.toString()}` : '';
    return apiRequest<{
      success: boolean;
      customers: Customer[];
      summary: { totalOutstandingCredit: number; totalCustomers: number; customersWithBalance: number };
    }>(`/customers${qStr}`);
  },

  getCustomer: (id: string) =>
    apiRequest<{ success: boolean; customer: Customer }>(`/customers/${id}`),

  createCustomer: (data: { name: string; phone?: string; openingBalance?: number }) =>
    apiRequest<{ success: boolean; customer: Customer; message: string }>('/customers', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  recordCustomerPayment: (id: string, data: { amount: number; paymentMethod: PaymentMethod; notes?: string }) =>
    apiRequest<{
      success: boolean;
      payment: CustomerPayment;
      customer: Customer;
      message: string;
    }>(`/customers/${id}/payments`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Daily Closing
  getClosingSummary: (date?: string) => {
    const qStr = date ? `?date=${encodeURIComponent(date)}` : '';
    return apiRequest<{ success: boolean; summary: ClosingSummary }>(`/closing/summary${qStr}`);
  },

  closeDay: (data: { actualCash: number; notes?: string; closingDate?: string }) =>
    apiRequest<{ success: boolean; message: string; closing: DailyClosing }>('/closing', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getClosingHistory: (limit?: number) => {
    const qStr = limit ? `?limit=${limit}` : '';
    return apiRequest<{ success: boolean; closings: DailyClosing[] }>(`/closing/history${qStr}`);
  },

  // Shop Settings
  getShop: () =>
    apiRequest<{ success: boolean; shop: Shop }>('/shop'),
};

export type Role = 'ADMIN' | 'CASHIER';

export type PaymentMethod = 'CASH' | 'UPI' | 'CARD' | 'CREDIT' | 'KHATA';

export interface User {
  id: string;
  name: string;
  username: string;
  role: Role;
  shopId: string;
}

export interface Shop {
  id: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  currency: string;
  invoicePrefix?: string;
  receiptFooter?: string;
  upiId?: string | null;
  gstEnabled: boolean;
  gstType?: 'INCLUSIVE' | 'EXCLUSIVE';
  gstNumber?: string | null;
  defaultCgstRate?: number;
  defaultSgstRate?: number;
  defaultIgstRate?: number;
  defaultHsnCode?: string | null;
  allowNegativeStock?: boolean;
}

export interface Category {
  id: string;
  name: string;
  description?: string | null;
}

export interface Product {
  id: string;
  shopId: string;
  categoryId?: string | null;
  name: string;
  barcode?: string | null;
  sku?: string | null;
  purchasePrice: number;
  sellingPrice: number;
  stockQuantity: number;
  unit: string;
  lowStockThreshold: number;
  hsnCode?: string | null;
  gstRate?: number | null;
  isActive: boolean;
  category?: Category | null;
}

export interface Customer {
  id: string;
  shopId: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  totalCredit: number;
  createdAt?: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface SaleItem {
  id?: string;
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
}

export interface Payment {
  id?: string;
  method: PaymentMethod;
  amount: number;
  cashReceived?: number | null;
  changeGiven?: number | null;
  referenceNumber?: string | null;
}

export interface Sale {
  id: string;
  shopId: string;
  userId: string;
  customerId?: string | null;
  invoiceNumber: string;
  idempotencyKey?: string | null;
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: PaymentMethod;
  cashReceived?: number | null;
  changeGiven?: number | null;
  status: 'COMPLETED' | 'CANCELLED';
  notes?: string | null;
  createdAt: string;
  items: SaleItem[];
  payments: Payment[];
  customer?: Customer | null;
  user?: { id: string; name: string; username: string };
}

export interface PendingSale {
  id?: number;
  idempotencyKey: string;
  invoiceNumberDraft: string;
  payload: string; // JSON string of sale
  total: number;
  paymentMethod: PaymentMethod;
  createdAt: string;
  status: 'PENDING' | 'SYNCING' | 'FAILED';
  retryCount: number;
  lastError?: string | null;
}

export interface CustomerPayment {
  id: string;
  customerId: string;
  shopId: string;
  userId?: string;
  amount: number;
  paymentMethod: PaymentMethod;
  notes?: string | null;
  createdAt: string;
}

export interface DailyClosing {
  id: string;
  shopId: string;
  userId: string;
  closingDate: string;
  totalBills: number;
  grossSales: number;
  discounts: number;
  netSales: number;
  cashSales: number;
  upiSales: number;
  cardSales: number;
  creditSales: number;
  expectedCash: number;
  actualCash: number;
  cashDifference: number;
  notes?: string | null;
  closedAt: string;
  user?: { id: string; name: string; username: string };
}

export interface ClosingSummary {
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
  billCount?: number;
  totalSales?: number;
  openingCash?: number;
}

export type PrinterSize = '58mm' | '80mm';

export interface PrinterDevice {
  name: string;
  address: string; // MAC address on Android
  connected?: boolean;
}

export type SyncState = 'ONLINE' | 'SYNCING' | 'OFFLINE';

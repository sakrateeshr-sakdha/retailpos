export type PaymentMethod = 'CASH' | 'UPI' | 'CARD' | 'CREDIT' | 'MIXED';

export type UserRole = 'ADMIN' | 'CASHIER';

export interface User {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  shopId: string;
}

export interface Shop {
  id: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  gstNumber?: string | null;
  invoicePrefix: string;
  currency: string;
  upiId?: string | null;
  receiptFooter?: string | null;
  allowNegativeStock: boolean;
}

export interface Category {
  id: string;
  name: string;
  description?: string | null;
  _count?: {
    products: number;
  };
}

export interface Product {
  id: string;
  shopId: string;
  categoryId?: string | null;
  name: string;
  barcode?: string | null;
  sku?: string | null;
  purchasePrice: number | string;
  sellingPrice: number | string;
  stockQuantity: number | string;
  unit: string;
  lowStockThreshold: number | string;
  isActive: boolean;
  category?: Category | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface PaymentItem {
  method: PaymentMethod;
  amount: number;
  cashReceived?: number | null;
  changeGiven?: number | null;
  referenceNumber?: string | null;
}

export interface SaleItem {
  id: string;
  saleId: string;
  productId?: string | null;
  productName: string;
  quantity: number | string;
  unit: string;
  unitPrice: number | string;
  purchasePrice?: number | string;
  totalPrice: number | string;
}

export interface Sale {
  id: string;
  shopId: string;
  userId: string;
  customerId?: string | null;
  invoiceNumber: string;
  idempotencyKey?: string | null;
  subtotal: number | string;
  discount: number | string;
  total: number | string;
  paymentMethod: PaymentMethod;
  status: 'COMPLETED' | 'CANCELLED' | 'REFUNDED';
  notes?: string | null;
  createdAt: string;
  items: SaleItem[];
  payments: PaymentItem[];
  user?: {
    id: string;
    name: string;
    username: string;
  };
  customer?: {
    id: string;
    name: string;
    phone?: string | null;
  } | null;
  shop?: Shop;
}

export interface PendingSale {
  id?: number; // IndexedDB auto-increment id
  idempotencyKey: string;
  items: {
    productId: string;
    productName: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    purchasePrice?: number;
    totalPrice: number;
  }[];
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: PaymentMethod;
  payments: PaymentItem[];
  createdAt: string;
  invoiceNumber: string;
  synced?: boolean;
}

export interface StockMovement {
  id: string;
  productId: string;
  type: 'PURCHASE' | 'SALE' | 'ADJUSTMENT' | 'RETURN';
  quantity: number | string;
  previousStock: number | string;
  newStock: number | string;
  reason?: string | null;
  createdAt: string;
  product?: {
    id: string;
    name: string;
    unit: string;
    barcode?: string | null;
  };
}

export interface SalesSummary {
  today: {
    totalAmount: number;
    billCount: number;
    cashAmount: number;
    upiAmount: number;
    cardAmount: number;
  };
}

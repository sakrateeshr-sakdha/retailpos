import Dexie, { type Table } from 'dexie';
import { Product, PendingSale, Customer } from '../types/index';

export class RetailPOSDatabase extends Dexie {
  products!: Table<Product, string>;
  pendingSales!: Table<PendingSale, number>;
  customers!: Table<Customer, string>;

  constructor() {
    super('RetailPOS_DB');
    this.version(1).stores({
      products: 'id, name, barcode, sku, categoryId, isActive',
      pendingSales: '++id, idempotencyKey, invoiceNumber, createdAt, synced',
    });
    this.version(2).stores({
      products: 'id, name, barcode, sku, categoryId, isActive',
      pendingSales: '++id, idempotencyKey, customerId, invoiceNumber, createdAt, synced',
      customers: 'id, name, phone, shopId',
    });
  }
}

export const db = new RetailPOSDatabase();

// Helper to cache products locally
export async function cacheProducts(products: Product[]): Promise<void> {
  try {
    await db.products.clear();
    await db.products.bulkPut(products);
  } catch (err) {
    console.error('Failed to cache products locally in IndexedDB', err);
  }
}

// Helper to search products offline
export async function searchLocalProducts(query: string): Promise<Product[]> {
  const q = query.toLowerCase().trim();
  if (!q) {
    return db.products.filter((p) => p.isActive).limit(30).toArray();
  }

  return db.products
    .filter((p) => {
      if (!p.isActive) return false;
      const matchName = p.name.toLowerCase().includes(q);
      const matchBarcode = p.barcode ? p.barcode.toLowerCase().includes(q) : false;
      const matchSku = p.sku ? p.sku.toLowerCase().includes(q) : false;
      return matchName || matchBarcode || matchSku;
    })
    .limit(20)
    .toArray();
}

// Helper to cache customers locally
export async function cacheCustomers(customers: Customer[]): Promise<void> {
  try {
    await db.customers.clear();
    await db.customers.bulkPut(customers);
  } catch (err) {
    console.error('Failed to cache customers locally in IndexedDB', err);
  }
}

// Helper to get local customers
export async function getLocalCustomers(): Promise<Customer[]> {
  try {
    return await db.customers.toArray();
  } catch (err) {
    console.error('Failed to read local customers from IndexedDB', err);
    return [];
  }
}


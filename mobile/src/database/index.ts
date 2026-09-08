import * as SQLite from 'expo-sqlite';
import { Product, Category, Customer, PendingSale, Shop } from '../types/index';

// ==================== IN-MEMORY FALLBACK CACHE ====================
// Provides instant fallback and sync guarantee if native SQLite operations
// fail, are locked, or are rejected on specific mobile devices / Expo Go versions.
const memoryProducts = new Map<string, Product>();
const memoryCategories = new Map<string, Category>();
const memoryCustomers = new Map<string, Customer>();
const memoryPendingSales = new Map<string, PendingSale>();
let memoryShopConfig: Shop | null = null;

let dbInstance: SQLite.SQLiteDatabase | null = null;
let dbInitPromise: Promise<SQLite.SQLiteDatabase | null> | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase | null> {
  if (dbInstance) return dbInstance;
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = (async () => {
    try {
      const db = await SQLite.openDatabaseAsync('retailpos.db', { useNewConnection: true });
      await initDatabase(db);
      dbInstance = db;
      return db;
    } catch (err) {
      console.warn('SQLite init warning (using in-memory cache fallback):', err);
      return null;
    }
  })();

  return dbInitPromise;
}

const TABLE_SCHEMAS = [
  `CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    shopId TEXT,
    categoryId TEXT,
    name TEXT NOT NULL,
    barcode TEXT,
    sku TEXT,
    purchasePrice REAL DEFAULT 0,
    sellingPrice REAL NOT NULL,
    stockQuantity REAL DEFAULT 0,
    unit TEXT DEFAULT 'pcs',
    lowStockThreshold REAL DEFAULT 5,
    hsnCode TEXT,
    gstRate REAL DEFAULT 0,
    isActive INTEGER DEFAULT 1,
    updatedAt TEXT
  );`,
  `CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);`,
  `CREATE INDEX IF NOT EXISTS idx_products_name ON products(name COLLATE NOCASE);`,
  `CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    shopId TEXT,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    totalCredit REAL DEFAULT 0,
    updatedAt TEXT
  );`,
  `CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);`,
  `CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name COLLATE NOCASE);`,
  `CREATE TABLE IF NOT EXISTS pending_sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    idempotencyKey TEXT UNIQUE NOT NULL,
    invoiceNumberDraft TEXT NOT NULL,
    payload TEXT NOT NULL,
    total REAL NOT NULL,
    paymentMethod TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    status TEXT DEFAULT 'PENDING',
    retryCount INTEGER DEFAULT 0,
    lastError TEXT
  );`,
  `CREATE INDEX IF NOT EXISTS idx_pending_sales_status ON pending_sales(status);`,
  `CREATE TABLE IF NOT EXISTS shop_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );`
];

export async function initDatabase(db: SQLite.SQLiteDatabase): Promise<void> {
  // Execute each statement independently to prevent transaction locks or batch parsing errors on Android
  for (const sql of TABLE_SCHEMAS) {
    try {
      await db.execAsync(sql);
    } catch (statementErr) {
      console.warn('SQLite statement execution skipped:', statementErr);
    }
  }
}

// ==================== PRODUCTS DAO ====================

export async function upsertProducts(products: Product[]): Promise<void> {
  if (!products || products.length === 0) return;

  // 1. Always update in-memory cache first
  for (const p of products) {
    memoryProducts.set(p.id, {
      ...p,
      purchasePrice: Number(p.purchasePrice || 0),
      sellingPrice: Number(p.sellingPrice || 0),
      stockQuantity: Number(p.stockQuantity || 0),
      lowStockThreshold: Number(p.lowStockThreshold || 5),
      gstRate: p.gstRate !== null && p.gstRate !== undefined ? Number(p.gstRate) : null,
    });
  }

  // 2. Best-effort SQLite persistence
  try {
    const db = await getDatabase();
    if (!db) return;

    for (const p of products) {
      try {
        await db.runAsync(
          `INSERT INTO products (
            id, shopId, categoryId, name, barcode, sku, purchasePrice, sellingPrice,
            stockQuantity, unit, lowStockThreshold, hsnCode, gstRate, isActive, updatedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            barcode = excluded.barcode,
            sku = excluded.sku,
            categoryId = excluded.categoryId,
            purchasePrice = excluded.purchasePrice,
            sellingPrice = excluded.sellingPrice,
            stockQuantity = excluded.stockQuantity,
            unit = excluded.unit,
            lowStockThreshold = excluded.lowStockThreshold,
            hsnCode = excluded.hsnCode,
            gstRate = excluded.gstRate,
            isActive = excluded.isActive,
            updatedAt = datetime('now');`,
          [
            p.id,
            p.shopId || '',
            p.categoryId || null,
            p.name,
            p.barcode || null,
            p.sku || null,
            Number(p.purchasePrice || 0),
            Number(p.sellingPrice || 0),
            Number(p.stockQuantity || 0),
            p.unit || 'pcs',
            Number(p.lowStockThreshold || 5),
            p.hsnCode || null,
            p.gstRate !== null && p.gstRate !== undefined ? Number(p.gstRate) : 0,
            p.isActive ? 1 : 0,
          ]
        );
      } catch {
        // Individual row error ignored
      }
    }
  } catch (err) {
    console.warn('SQLite upsertProducts error:', err);
  }
}

export async function searchProductsOffline(query: string = ''): Promise<Product[]> {
  const q = (query || '').trim().toLowerCase();

  // Try SQLite first
  try {
    const db = await getDatabase();
    if (db) {
      let rows: any[] = [];
      if (!q) {
        rows = await db.getAllAsync<any>(
          `SELECT * FROM products WHERE isActive = 1 ORDER BY name ASC LIMIT 100`
        );
      } else {
        const exactBarcode = await db.getAllAsync<any>(
          `SELECT * FROM products WHERE barcode = ? AND isActive = 1 LIMIT 1`,
          [q]
        );

        const likePattern = `%${q}%`;
        const textMatches = await db.getAllAsync<any>(
          `SELECT * FROM products 
           WHERE isActive = 1 
             AND (name LIKE ? OR barcode LIKE ? OR sku LIKE ?)
           ORDER BY name ASC 
           LIMIT 50`,
          [likePattern, likePattern, likePattern]
        );

        rows = exactBarcode.length > 0
          ? [exactBarcode[0], ...textMatches.filter((p) => p.id !== exactBarcode[0].id)]
          : textMatches;
      }

      if (rows.length > 0) {
        const formatted = rows.map(formatProductRow);
        for (const p of formatted) {
          memoryProducts.set(p.id, p);
        }
        return formatted;
      }
    }
  } catch (err) {
    console.warn('SQLite searchProductsOffline error:', err);
  }

  // Fallback to in-memory cache
  const allProds = Array.from(memoryProducts.values()).filter((p) => p.isActive);
  if (!q) {
    return allProds.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 100);
  }

  return allProds
    .filter((p) => {
      const matchBarcode = p.barcode?.toLowerCase().includes(q);
      const matchName = p.name?.toLowerCase().includes(q);
      const matchSku = p.sku?.toLowerCase().includes(q);
      return matchBarcode || matchName || matchSku;
    })
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 50);
}

export async function findProductByBarcodeOffline(barcode: string): Promise<Product | null> {
  const clean = (barcode || '').trim();
  if (!clean) return null;

  try {
    const db = await getDatabase();
    if (db) {
      const row = await db.getFirstAsync<any>(
        `SELECT * FROM products WHERE barcode = ? AND isActive = 1 LIMIT 1`,
        [clean]
      );
      if (row) return formatProductRow(row);
    }
  } catch (err) {
    console.warn('SQLite findProductByBarcodeOffline error:', err);
  }

  for (const p of memoryProducts.values()) {
    if (p.isActive && p.barcode?.trim().toLowerCase() === clean.toLowerCase()) {
      return p;
    }
  }
  return null;
}

export async function updateLocalProductStock(productId: string, quantityDeducted: number): Promise<void> {
  const cached = memoryProducts.get(productId);
  if (cached) {
    cached.stockQuantity = Math.max(0, cached.stockQuantity - quantityDeducted);
  }

  try {
    const db = await getDatabase();
    if (db) {
      await db.runAsync(
        `UPDATE products SET stockQuantity = stockQuantity - ? WHERE id = ?`,
        [quantityDeducted, productId]
      );
    }
  } catch (err) {
    console.warn('SQLite updateLocalProductStock error:', err);
  }
}

function formatProductRow(row: any): Product {
  return {
    id: row.id,
    shopId: row.shopId,
    categoryId: row.categoryId,
    name: row.name,
    barcode: row.barcode,
    sku: row.sku,
    purchasePrice: Number(row.purchasePrice || 0),
    sellingPrice: Number(row.sellingPrice || 0),
    stockQuantity: Number(row.stockQuantity || 0),
    unit: row.unit || 'pcs',
    lowStockThreshold: Number(row.lowStockThreshold || 5),
    hsnCode: row.hsnCode,
    gstRate: row.gstRate !== null && row.gstRate !== undefined ? Number(row.gstRate) : null,
    isActive: Boolean(row.isActive),
  };
}

// ==================== CATEGORIES DAO ====================

export async function upsertCategories(categories: Category[]): Promise<void> {
  if (!categories || categories.length === 0) return;

  for (const c of categories) {
    memoryCategories.set(c.id, c);
  }

  try {
    const db = await getDatabase();
    if (!db) return;

    for (const c of categories) {
      try {
        await db.runAsync(
          `INSERT INTO categories (id, name, description)
           VALUES (?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             description = excluded.description;`,
          [c.id, c.name, c.description || null]
        );
      } catch {}
    }
  } catch (err) {
    console.warn('SQLite upsertCategories error:', err);
  }
}

export async function getCategoriesOffline(): Promise<Category[]> {
  try {
    const db = await getDatabase();
    if (db) {
      const rows = await db.getAllAsync<Category>(`SELECT * FROM categories ORDER BY name ASC`);
      if (rows.length > 0) {
        for (const c of rows) memoryCategories.set(c.id, c);
        return rows;
      }
    }
  } catch (err) {
    console.warn('SQLite getCategoriesOffline error:', err);
  }

  return Array.from(memoryCategories.values()).sort((a, b) => a.name.localeCompare(b.name));
}

// ==================== CUSTOMERS DAO ====================

export async function upsertCustomers(customers: Customer[]): Promise<void> {
  if (!customers || customers.length === 0) return;

  for (const c of customers) {
    memoryCustomers.set(c.id, {
      ...c,
      totalCredit: Number(c.totalCredit || 0),
    });
  }

  try {
    const db = await getDatabase();
    if (!db) return;

    for (const c of customers) {
      try {
        await db.runAsync(
          `INSERT INTO customers (id, shopId, name, phone, email, address, totalCredit, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             phone = excluded.phone,
             email = excluded.email,
             address = excluded.address,
             totalCredit = excluded.totalCredit,
             updatedAt = datetime('now');`,
          [
            c.id,
            c.shopId || '',
            c.name,
            c.phone || null,
            c.email || null,
            c.address || null,
            Number(c.totalCredit || 0),
          ]
        );
      } catch {}
    }
  } catch (err) {
    console.warn('SQLite upsertCustomers error:', err);
  }
}

function formatCustomerRow(row: any): Customer {
  return {
    id: row.id,
    shopId: row.shopId,
    name: row.name,
    phone: row.phone,
    email: row.email,
    address: row.address,
    totalCredit: Number(row.totalCredit || 0),
  };
}

export async function searchCustomersOffline(query: string = ''): Promise<Customer[]> {
  const q = (query || '').trim().toLowerCase();

  try {
    const db = await getDatabase();
    if (db) {
      let rows: any[] = [];
      if (!q) {
        rows = await db.getAllAsync<any>(`SELECT * FROM customers ORDER BY name ASC LIMIT 50`);
      } else {
        const pattern = `%${q}%`;
        rows = await db.getAllAsync<any>(
          `SELECT * FROM customers WHERE name LIKE ? OR phone LIKE ? ORDER BY name ASC LIMIT 30`,
          [pattern, pattern]
        );
      }
      if (rows.length > 0) {
        const formatted = rows.map(formatCustomerRow);
        for (const c of formatted) memoryCustomers.set(c.id, c);
        return formatted;
      }
    }
  } catch (err) {
    console.warn('SQLite searchCustomersOffline error:', err);
  }

  const allCusts = Array.from(memoryCustomers.values());
  if (!q) return allCusts.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 50);

  return allCusts
    .filter((c) => c.name?.toLowerCase().includes(q) || c.phone?.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 30);
}

export async function updateLocalCustomerCredit(customerId: string, creditDelta: number): Promise<void> {
  const cached = memoryCustomers.get(customerId);
  if (cached) {
    cached.totalCredit = Number(cached.totalCredit || 0) + creditDelta;
  }

  try {
    const db = await getDatabase();
    if (db) {
      await db.runAsync(
        `UPDATE customers SET totalCredit = totalCredit + ? WHERE id = ?`,
        [creditDelta, customerId]
      );
    }
  } catch (err) {
    console.warn('SQLite updateLocalCustomerCredit error:', err);
  }
}

// ==================== OFFLINE SALES QUEUE DAO ====================

export async function createOfflineSaleTransaction(
  salePayload: any,
  idempotencyKey: string,
  invoiceDraft: string
): Promise<void> {
  const pendingItem: PendingSale = {
    id: Date.now(),
    idempotencyKey,
    invoiceNumberDraft: invoiceDraft,
    payload: JSON.stringify(salePayload),
    total: Number(salePayload.total || 0),
    paymentMethod: salePayload.paymentMethod || 'CASH',
    createdAt: salePayload.createdAt || new Date().toISOString(),
    status: 'PENDING',
    retryCount: 0,
    lastError: null,
  };
  memoryPendingSales.set(idempotencyKey, pendingItem);

  // Update memory stock
  if (Array.isArray(salePayload.items)) {
    for (const item of salePayload.items) {
      const p = memoryProducts.get(item.productId);
      if (p) p.stockQuantity = Math.max(0, p.stockQuantity - item.quantity);
    }
  }

  // Update memory customer credit
  if (salePayload.customerId && (salePayload.paymentMethod === 'CREDIT' || salePayload.paymentMethod === 'KHATA')) {
    const c = memoryCustomers.get(salePayload.customerId);
    if (c) c.totalCredit = Number(c.totalCredit || 0) + Number(salePayload.total || 0);
  }

  try {
    const db = await getDatabase();
    if (db) {
      await db.runAsync(
        `INSERT INTO pending_sales (
          idempotencyKey, invoiceNumberDraft, payload, total, paymentMethod, createdAt, status, retryCount
        ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', 0)`,
        [
          idempotencyKey,
          invoiceDraft,
          JSON.stringify(salePayload),
          Number(salePayload.total || 0),
          salePayload.paymentMethod || 'CASH',
          salePayload.createdAt || new Date().toISOString(),
        ]
      );

      if (Array.isArray(salePayload.items)) {
        for (const item of salePayload.items) {
          try {
            await db.runAsync(
              `UPDATE products SET stockQuantity = stockQuantity - ? WHERE id = ?`,
              [item.quantity, item.productId]
            );
          } catch {}
        }
      }

      if (salePayload.customerId && (salePayload.paymentMethod === 'CREDIT' || salePayload.paymentMethod === 'KHATA')) {
        try {
          await db.runAsync(
            `UPDATE customers SET totalCredit = totalCredit + ? WHERE id = ?`,
            [Number(salePayload.total || 0), salePayload.customerId]
          );
        } catch {}
      }
    }
  } catch (err) {
    console.warn('SQLite createOfflineSaleTransaction error:', err);
  }
}

export async function getPendingSalesQueue(): Promise<PendingSale[]> {
  try {
    const db = await getDatabase();
    if (db) {
      const rows = await db.getAllAsync<PendingSale>(
        `SELECT * FROM pending_sales WHERE status = 'PENDING' ORDER BY createdAt ASC`
      );
      if (rows.length > 0) {
        for (const r of rows) memoryPendingSales.set(r.idempotencyKey, r);
        return rows;
      }
    }
  } catch (err) {
    console.warn('SQLite getPendingSalesQueue error:', err);
  }

  return Array.from(memoryPendingSales.values()).filter((s) => s.status === 'PENDING');
}

export const getPendingSalesOffline = getPendingSalesQueue;

export async function removePendingSale(idempotencyKey: string): Promise<void> {
  memoryPendingSales.delete(idempotencyKey);
  try {
    const db = await getDatabase();
    if (db) {
      await db.runAsync(`DELETE FROM pending_sales WHERE idempotencyKey = ?`, [idempotencyKey]);
    }
  } catch (err) {
    console.warn('SQLite removePendingSale error:', err);
  }
}

export async function markPendingSaleFailed(idempotencyKey: string, lastError: string): Promise<void> {
  const cached = memoryPendingSales.get(idempotencyKey);
  if (cached) {
    cached.status = 'FAILED';
    cached.retryCount = (cached.retryCount || 0) + 1;
    cached.lastError = lastError;
  }
  try {
    const db = await getDatabase();
    if (db) {
      await db.runAsync(
        `UPDATE pending_sales 
         SET retryCount = retryCount + 1, lastError = ?, status = 'FAILED' 
         WHERE idempotencyKey = ?`,
        [lastError, idempotencyKey]
      );
    }
  } catch (err) {
    console.warn('SQLite markPendingSaleFailed error:', err);
  }
}

export async function getPendingSalesCount(): Promise<number> {
  try {
    const db = await getDatabase();
    if (db) {
      const res = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM pending_sales WHERE status = 'PENDING'`
      );
      if (res && res.count !== undefined) return res.count;
    }
  } catch (err) {
    console.warn('SQLite getPendingSalesCount error:', err);
  }

  return Array.from(memoryPendingSales.values()).filter((s) => s.status === 'PENDING').length;
}

// ==================== SHOP CONFIG DAO ====================

export async function saveShopConfig(shop: Shop): Promise<void> {
  memoryShopConfig = shop;
  try {
    const db = await getDatabase();
    if (db) {
      await db.runAsync(
        `INSERT INTO shop_config (key, value) VALUES ('shop_data', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
        [JSON.stringify(shop)]
      );
    }
  } catch (err) {
    console.warn('SQLite saveShopConfig error:', err);
  }
}

export async function getLocalShopConfig(): Promise<Shop | null> {
  if (memoryShopConfig) return memoryShopConfig;
  try {
    const db = await getDatabase();
    if (db) {
      const row = await db.getFirstAsync<{ value: string }>(
        `SELECT value FROM shop_config WHERE key = 'shop_data'`
      );
      if (row?.value) {
        memoryShopConfig = JSON.parse(row.value);
        return memoryShopConfig;
      }
    }
  } catch (err) {
    console.warn('SQLite getLocalShopConfig error:', err);
  }
  return null;
}

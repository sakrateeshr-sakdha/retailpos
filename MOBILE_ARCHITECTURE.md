# RetailPOS — Mobile Application Architecture (Android Cashier)

**Target Device:** Android Smartphones & Tablets (Android 8.0 / API 26+)  
**Primary User:** Retail Grocery Cashier  
**Core Mission:** Ultra-fast, single-handed grocery checkout with 100% offline resilience and Bluetooth thermal printing.

---

## 1. Executive Summary & Recommended Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                   React Native / Expo Cashier App                      │
│                                                                        │
│   ┌──────────────────────┐               ┌─────────────────────────┐   │
│   │   Cashier UI Layer   │               │   Hardware Layer        │   │
│   │  • One-Handed Billing│               │  • Bluetooth SPP Print  │   │
│   │  • Fast Barcode Scan │               │  • Camera Barcode (ML)  │   │
│   │  • Quick Cash/UPI Pay│               │  • USB / BT HID Scanner │   │
│   └──────────┬───────────┘               └────────────┬────────────┘   │
│              │                                        │                │
│              ▼                                        ▼                │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │                      Core Mobile Engine                        │   │
│   │  • Local SQLite Database (expo-sqlite)                         │   │
│   │  • Encrypted Keystore (expo-secure-store)                      │   │
│   │  • Background Sync & Idempotent Queue Worker                   │   │
│   │  • NetInfo Connectivity Observer                               │   │
│   └──────────────────────────────┬─────────────────────────────────┘   │
└──────────────────────────────────┼─────────────────────────────────────┘
                                   │ HTTPS / REST
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│             Existing Node.js + Express Backend (:5000)                 │
│                 (Single Source of Truth - Untouched)                   │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ Prisma ORM
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      PostgreSQL 16 Database                            │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Project Setup: Expo Prebuild vs Expo Go vs React Native CLI

### 2.1 The Critical Hardware Constraint: Bluetooth ESC/POS Printing
In Indian grocery and retail environments, **95%+ of portable thermal receipt printers** (Everycom, TVS, BluPrint, Essae, Retsol, NGX, MPT-II) operate over **Bluetooth Classic Serial Port Profile (SPP - RFCOMM)**, NOT Bluetooth Low Energy (BLE). 
* **Expo Go (Standard Managed Client)**: Does **not** include the Android native `BluetoothSocket` code necessary for Bluetooth Classic SPP communication. Therefore, standard Expo Go cannot drive Bluetooth Classic thermal printers.
* **React Native CLI (Bare)**: Supports Bluetooth Classic, but sacrifices Expo's rapid scaffolding, unified TypeScript config, modern build tooling, and managed native asset pipeline.
* **Expo Prebuild (Development Builds / Config Plugins)**: **RECOMMENDED**.
  * Gives 100% access to native Android code, custom Android manifests, and Bluetooth Classic SPP drivers (`react-native-thermal-receipt-printer` / custom local native modules).
  * Retains Expo's modern tooling, OTA updates capability, asset generators, and high-quality libraries (`expo-camera`, `expo-secure-store`, `expo-sqlite`, `expo-haptics`).
  * Run locally with `npx expo run:android` or built in cloud with `eas build`.

**Decision:** Adopt **Expo with Development Builds (`expo prebuild`)** in TypeScript.

---

## 3. Mobile Local Database & Storage Architecture

### 3.1 Why AsyncStorage Is Disqualified
Storing the POS catalogue and pending bills in `AsyncStorage` introduces severe failure modes in grocery retail:
1. **Unindexed Linear Scans**: Searching 1,500 products by barcode in a serialized JSON blob in JS memory causes 200–500ms UI freezes during cashier typing/scanning.
2. **Memory Overhead**: Parsing large JSON strings consumes excessive RAM on low-end 2GB/3GB RAM Android POS phones.
3. **No ACID Guarantees**: A battery pull or force-quit during `AsyncStorage.setItem()` can corrupt the entire pending sales queue.

### 3.2 Chosen Storage Engine: `expo-sqlite`
`expo-sqlite` (modern SDK engine) provides direct, synchronous and asynchronous SQLite bindings backed by SQLite C-libraries on Android.

#### Local SQLite Schema Definition:

```sql
-- 1. Products Table (Local Mirror)
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  barcode TEXT,
  sku TEXT,
  categoryId TEXT,
  purchasePrice REAL DEFAULT 0,
  sellingPrice REAL NOT NULL,
  stockQuantity REAL DEFAULT 0,
  unit TEXT DEFAULT 'pcs',
  lowStockThreshold REAL DEFAULT 5,
  hsnCode TEXT,
  gstRate REAL DEFAULT 0,
  isActive INTEGER DEFAULT 1,
  updatedAt TEXT
);

CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name COLLATE NOCASE);

-- 2. Categories Table
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT
);

-- 3. Customers Table (Khata Ledger)
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  totalCredit REAL DEFAULT 0,
  updatedAt TEXT
);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name COLLATE NOCASE);

-- 4. Pending Sales Queue (Offline Resilience)
CREATE TABLE IF NOT EXISTS pending_sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  idempotencyKey TEXT UNIQUE NOT NULL,
  invoiceNumberDraft TEXT NOT NULL,
  payload TEXT NOT NULL,          -- Full serialized JSON createSaleSchema
  total REAL NOT NULL,
  paymentMethod TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  status TEXT DEFAULT 'PENDING',  -- 'PENDING', 'SYNCING', 'FAILED'
  retryCount INTEGER DEFAULT 0,
  lastError TEXT
);

CREATE INDEX IF NOT EXISTS idx_pending_sales_status ON pending_sales(status);

-- 5. Shop Configuration Key-Value Store
CREATE TABLE IF NOT EXISTS shop_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

### 3.3 Safe Credential & Session Storage: `expo-secure-store`
* JWT access tokens, merchant encryption keys, and cached Admin PIN bcrypt hashes must **never** be stored in plain-text SQLite or AsyncStorage.
* Handled exclusively via `expo-secure-store`, which encrypts data using **Android Keystore (AES-256 GCM in KeyStore-backed SharedPreferences)**.

---

## 4. Native Hardware Capabilities & Integration Plan

### 4.1 Camera Barcode Scanning
* **Module:** `expo-camera` (using modern `CameraView` with `barcodeScannerSettings`) or `@react-native-ml-kit/barcode-scanning`.
* **Cashier UX Requirements:**
  * Sub-100ms barcode recognition (UPC-A, EAN-13, EAN-8, Code-128, Code-39, QR).
  * Continuous Scan Mode: Cashier holds phone over basket items; each scan automatically increments cart item with audio feedback (`expo-av` short beep) and haptic vibration (`expo-haptics`).
  * Scanning throttle / debounce: 400ms lock to avoid accidental burst duplicate scans of the exact same code.

### 4.2 Bluetooth Thermal Printer (ESC/POS)
* **Protocol:** Bluetooth Classic SPP (RFCOMM Channel 1).
* **Supported Paper Widths:** 58mm (32 characters/line) and 80mm (48 characters/line).
* **Module:** `react-native-thermal-receipt-printer` or a lightweight native Android module communicating via `android.bluetooth.BluetoothSocket`.
* **ESC/POS Formatting Pipeline:**
  1. Header: Shop Name (Double height/width bold), Address, Phone, GSTIN.
  2. Invoice metadata: Date, Time, Invoice Number (`INV-XXXX`), Cashier Name.
  3. Items Table: Clean text columns formatted to fixed character widths with automatic word-wrapping.
  4. Tax Breakdown: Taxable Amount, CGST (%), SGST (%), Total Tax.
  5. Payment line: Cash Tendered & Change Given, or "Paid via UPI".
  6. Footer: Custom thank-you note from shop settings.
  7. Paper Cut: Line feed + cut command (`\x1b\x64\x02\x1d\x56\x00`).

### 4.3 External Bluetooth & USB OTG Barcode Scanners (HID Mode)
* **Mechanism:** Handheld laser scanners (Honeywell, TVS, Zebra) paired via Bluetooth or connected via USB-C OTG operate as **Hardware Keyboards (HID)**.
* **Native Implementation Strategy:**
  * In React Native, the Billing screen maintains an active, invisible or primary `TextInput`.
  * External scanners type characters rapidly and emit a terminating `\n` (`KeyEvent.KEYCODE_ENTER`).
  * Crucial Retail UX: Set `showSoftInputOnFocus={false}` when hardware scanner mode is enabled so Android does not pop up the virtual keyboard over the cart.

### 4.4 Network Connectivity & Automatic Sync Worker
* **Module:** `@react-native-community/netinfo`.
* **Sync Engine Lifecycle:**
  1. Listens for network transitions from `isConnected: false` → `isConnected: true`.
  2. Queries `pending_sales` table in SQLite for records with `status = 'PENDING'`.
  3. Packages up to 50 sales into `POST /api/sales/sync`.
  4. For every confirmed key returned in `synced` array (including `already_synced`), deletes the row from SQLite.
  5. For any item in `failed`, increments `retryCount` and logs `lastError`.

---

## 5. Mobile UI & Cashier Ergonomics

The mobile app is engineered specifically for fast-paced retail checkouts where cashiers hold the device in one hand.

```
┌──────────────────────────────────────────────┐
│ [Super Daily Grocery]   [Online] [BT Print]  │
├──────────────────────────────────────────────┤
│ 🔍 Scan barcode or search items...     [📷]  │
├──────────────────────────────────────────────┤
│ CART (3 Items)                               │
│                                              │
│ 1. Nandini Milk 500ml         ₹24            │
│    [-]  2  [+]                               │
│                                              │
│ 2. Britannia Good Day         ₹20            │
│    [-]  1  [+]                               │
│                                              │
│ 3. Sugar 1kg                  ₹42            │
│    [-]  1  [+]                               │
├──────────────────────────────────────────────┤
│ Subtotal: ₹110.00         Discount: ₹0.00    │
│ TOTAL TO PAY:                       ₹110.00  │
├──────────────────────────────────────────────┤
│ [ 💵 CASH ]    [ 📱 UPI QR ]    [ 💳 CARD ]  │
├──────────────────────────────────────────────┤
│ [⚡ COMPLETE SALE & PRINT (₹110)          ]  │
├──────────────────────────────────────────────┤
│  [🛒 Billing] [📦 Products] [🧾 Sales] [👤 Khata] [⚙️ More] │
└──────────────────────────────────────────────┘
```

### 5.1 Bottom Navigation Structure
1. **Billing** (Default):
   - Sticky top search bar with immediate camera scanner button.
   - Live scrollable cart with rapid `+` / `-` quantity buttons.
   - High-contrast Total pill in emerald green.
   - One-tap payment selectors: **Cash** (with quick tender buttons ₹100, ₹200, ₹500), **Dynamic UPI QR** (renders full screen QR for customer scanning), **Card**, **Khata (Store Credit)**.
   - Large bottom checkout CTA: `"Complete Sale (₹110)"`.
2. **Products**:
   - Rapid stock availability lookup.
   - Barcode search.
   - Quick-add product modal (with Admin PIN prompt).
3. **Sales**:
   - Today's sales metrics tally.
   - Search previous bills, view items, and trigger one-tap thermal reprint.
4. **Khata (Customers)**:
   - List of credit customers with outstanding balances.
   - Record customer cash settlement payments.
5. **More**:
   - End-of-day register cash closing.
   - Bluetooth printer discovery, pairing, and test print.
   - Pending offline sync monitor.
   - Staff profile and logout.

---

## 6. Backend Impact & Verification Analysis

### 6.1 Backend Changes Required
* **None.** The existing backend REST API is already complete, strictly typed, authenticated via standard JWT, isolated by tenant `shopId`, and features full idempotency protection and offline batch sync.
* All 24 endpoints documented in [`MOBILE_API_CONTRACT.md`](file:///workspaces/retailpos/MOBILE_API_CONTRACT.md) are active and running in production.

### 6.2 Test Suite Verification
* **Phase 1 Tests:** 23 / 23 PASS.
* **Phase 2 Tests:** 22 / 22 PASS.
* **Total Existing Tests Passing:** **45 / 45 (100% Pass Rate)**.
* No changes made to production backend logic or schema.

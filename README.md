# Mobile-First Grocery Retail POS (PWA)

A fast, lightweight, mobile-first Point of Sale (POS) system specifically designed for grocery shops and small retail stores. Optimized for one-hand mobile operation, fast product lookup, barcode scanning, offline billing, and immediate bill generation.

---

## 📱 Tech Stack

* **Frontend**: React 18, TypeScript, Tailwind CSS, Vite, PWA (Vite PWA Plugin with Service Worker & Web Manifest), Dexie (IndexedDB for offline product catalog & queue), `@zxing` camera barcode scanning.
* **Backend**: Node.js, Express, TypeScript, Prisma ORM, JSON Web Tokens (JWT), Zod validation.
* **Database**: PostgreSQL 16 (running via Docker or standard Postgres).

---

## 🚀 Quick Start

### 1. Database Setup (PostgreSQL)
Ensure PostgreSQL is running on port 5432:
```bash
# Using Docker
docker run --name retailpos-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=retailpos -p 5432:5432 -d postgres:16-alpine
```

### 2. Backend Setup & Seed
```bash
cd backend
npm install
npx prisma db push
npm run prisma:seed    # Seeds grocery categories, sample products, and admin/cashier accounts
npm run dev            # Starts backend on http://localhost:5000
```

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev            # Starts Vite dev server on http://localhost:3000
```

---

## 🔑 Demo Credentials

| Role | Username | Password | Notes |
| :--- | :--- | :--- | :--- |
| **Owner / Admin** | `admin` | `admin123` | Full access to billing, products, stock adjustments, cashier management, and shop settings |
| **Cashier** | `cashier1` | `cashier123` | Fast billing, sales history, and product search |

*(One-tap quick fill buttons are also available directly on the login screen for instant testing).*

---

## 🌟 Key Features

1. **⚡ Fast Billing Screen**:
   * Instant product search by name, barcode, or SKU with live dropdown results.
   * Camera-based live barcode scanner using `@zxing`.
   * One-tap product catalog chips and large touch tiles for fast-moving items.
   * Slide-up cart drawer with quantity steppers (`-` / `+`), item deletion, and instant discount calculator.
   * Instant checkout bar with one-tap **UPI** and **CASH** buttons.
2. **💵 Smart Cash Calculator & Dynamic UPI QR**:
   * Quick rupee preset buttons (Exact, ₹50, ₹100, ₹500) with automatic change-to-return calculation.
   * Merchant UPI ID configuration in Shop settings.
   * Instant dynamic UPI QR code generator pre-filling exact bill amounts for scanning via Google Pay, PhonePe, Paytm, and BHIM.
   * Direct UPI app deep-linking for mobile devices.
3. **🧾 Thermal-Style Receipt Modal**:
   * Formatted grocery receipt with shop details, item breakdown, taxes/discounts, and cashier name.
   * Print button (thermal print formatted) and Web Share / WhatsApp share integration.
4. **📶 Offline Billing & Synchronization**:
   * Product catalog is automatically cached to IndexedDB via Dexie.
   * Bills created during network outages are queued locally and automatically synced when connection is restored.
   * Idempotency keys prevent duplicate billing or duplicate inventory deductions.
5. **📦 Product & Category Management**:
   * Add, edit, price adjust, or deactivate products.
6. **📋 Stock Control**:
   * Inward restock logging, damage/expired deductions, and low-stock alert monitoring.
7. **📊 Sales Dashboard**:
   * Daily sales totals, bill counts, and Cash vs UPI breakdown.

---

## 🧪 Acceptance Test Workflow

The system has been verified against the acceptance test scenario:
1. Login with demo account.
2. Search and add `Milk 1L` (Quantity +1).
3. Search and add `Sugar 1kg`.
4. Tap UPI $\rightarrow$ Complete Sale.
5. Invoice generated $\rightarrow$ Stock reduced atomically in PostgreSQL $\rightarrow$ Entry appears in Sales History.
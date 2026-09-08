# RetailPOS — Mobile API Contract (Cashier Android App)

**Version:** 1.0  
**Target Client:** React Native / Expo Android Cashier Application  
**Backend Host:** Existing Node.js + Express + Prisma REST API (`http://<host>:5000/api`)  
**Database:** Single Source of Truth (PostgreSQL 16)  
**Multi-Tenant Isolation:** All operational endpoints automatically extract `shopId` from the verified JWT payload (`req.user.shopId`). Cross-shop data contamination is physically impossible at the database query level.

---

## 1. Global Conventions & Standards

### 1.1 HTTP Headers
| Header | Required | Description |
| :--- | :--- | :--- |
| `Content-Type` | Yes (for POST/PUT) | Must be `application/json` |
| `Authorization` | Yes (except login) | Format: `Bearer <jwt_token>` |
| `x-admin-pin-auth` | Conditional | Signed 5-minute delegated JWT token required when a Cashier performs Admin-delegated operations (e.g. Quick-Add Product, Stock In) |
| `x-idempotency-key` | Recommended for Sales | Unique client-generated UUID per checkout request to prevent double-charging |

### 1.2 Status Codes & Error Formats
* **`200 OK`**: Request succeeded with response payload.
* **`201 Created`**: Entity created successfully.
* **`400 Bad Request`**: Validation failure (e.g., negative price, subtotal mismatch, discount > subtotal).
* **`401 Unauthorized`**: Token missing, expired, or invalid. Mobile app must clear session and redirect to Login screen.
* **`403 Forbidden`**: Role permission failure (Cashier attempted Admin-only action without valid PIN).
* **`404 Not Found`**: Resource does not exist or belongs to another shop tenant.
* **`500 Internal Server Error`**: Unexpected server exception.

Standard Error Payload:
```json
{
  "success": false,
  "message": "Descriptive human-readable error explanation",
  "errors": [ ... ]
}
```

---

## 2. Authentication & Delegation APIs

### 2.1 Cashier & Admin Login
* **Method & URL:** `POST /api/auth/login`
* **Authentication:** None (Public)
* **Role:** Any active Staff/Owner
* **Request Body:**
```json
{
  "username": "cashier1",
  "password": "password123"
}
```
* **Success Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6...",
  "user": {
    "id": "usr_cly1234567890",
    "name": "Ramesh Kumar",
    "username": "cashier1",
    "role": "CASHIER",
    "shopId": "shop_clx0987654321"
  },
  "shop": {
    "id": "shop_clx0987654321",
    "name": "Super Daily Grocery Store",
    "phone": "9876543210",
    "address": "12 Market Road, Bengaluru",
    "currency": "₹",
    "invoicePrefix": "INV-",
    "receiptFooter": "Thank You! Visit Again 😊",
    "upiId": "superdaily@okhdfcbank",
    "gstEnabled": true,
    "gstType": "INCLUSIVE",
    "gstNumber": "29ABCDE1234F1Z5",
    "defaultCgstRate": 2.5,
    "defaultSgstRate": 2.5,
    "defaultIgstRate": 5.0,
    "defaultHsnCode": "0401",
    "allowNegativeStock": false
  }
}
```
* **Error Responses:**
  * `400 Bad Request`: `{"success": false, "message": "Username and password are required"}`
  * `401 Unauthorized`: `{"success": false, "message": "Invalid username or password"}`
* **Tenant Isolation:** User is looked up globally; shop context is tied to `user.shopId`.
* **Offline Suitability:** Online-only for initial authentication. Token and user profile are cached securely in Android Keystore (`Expo SecureStore`). If offline on app launch, existing valid session allows continued offline billing.

---

### 2.2 Session Validation (`/me`)
* **Method & URL:** `GET /api/auth/me`
* **Authentication:** Bearer Token
* **Role:** Any authenticated user
* **Request Body:** None
* **Success Response (`200 OK`):**
```json
{
  "success": true,
  "user": {
    "id": "usr_cly1234567890",
    "name": "Ramesh Kumar",
    "username": "cashier1",
    "role": "CASHIER",
    "shopId": "shop_clx0987654321"
  },
  "shop": {
    "id": "shop_clx0987654321",
    "name": "Super Daily Grocery Store",
    "currency": "₹",
    "upiId": "superdaily@okhdfcbank",
    "gstEnabled": true
  }
}
```
* **Offline Suitability:** Polled on network reconnection to refresh shop profile and settings.

---

### 2.3 Verify Admin PIN (Delegated Authorization)
* **Method & URL:** `POST /api/auth/verify-admin-pin`
* **Authentication:** Bearer Token
* **Role:** Any Cashier
* **Purpose:** Cashiers entering the Shop Manager/Admin PIN receive a short-lived signed JWT (`adminAuthToken`) that allows performing privileged operations (e.g. Quick-Add Product from scan screen).
* **Request Body:**
```json
{
  "pin": "1234"
}
```
* **Success Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Admin authorization granted",
  "adminAuthToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```
* **Error Responses:**
  * `400 Bad Request`: `{"success": false, "message": "Admin PIN is required"}`
  * `401 Unauthorized`: `{"success": false, "message": "Incorrect Admin PIN. Access denied."}`
* **Token Lifetime:** 5 minutes (`expiresIn: '5m'`). Header to send in subsequent request: `x-admin-pin-auth: <adminAuthToken>`.
* **Offline Suitability:** Online verification preferred. For full offline operation, the shop's bcrypt PIN hash is cached locally in encrypted storage to permit offline Admin PIN verification on the device.

---

## 3. Product & Catalogue APIs

### 3.1 Fast Barcode Lookup / Product Search
* **Method & URL:** `GET /api/products/search?q={query}`
* **Authentication:** Bearer Token
* **Role:** Any
* **Query Parameters:**
  * `q` (required string): Barcode digits (e.g. `8901234567890`), product name fragment, or SKU.
* **Search Mechanics:**
  1. Performs exact match on `barcode = q`. If matched, prioritizes it as the very first element.
  2. Performs case-insensitive partial match on `name`, `barcode`, and `sku`.
  3. Returns up to 20 products.
* **Success Response (`200 OK`):**
```json
{
  "success": true,
  "products": [
    {
      "id": "prod_101",
      "shopId": "shop_clx0987654321",
      "categoryId": "cat_dairy",
      "name": "Nandini Toned Milk 500ml",
      "barcode": "8901234567890",
      "sku": "NAN-MILK-500",
      "purchasePrice": 22.0,
      "sellingPrice": 24.0,
      "stockQuantity": 85.0,
      "unit": "packet",
      "lowStockThreshold": 15.0,
      "hsnCode": "0401",
      "gstRate": 0.0,
      "isActive": true,
      "category": { "id": "cat_dairy", "name": "Dairy & Milk" }
    }
  ]
}
```
* **Offline Suitability:** **Critical Offline Path.** Mobile app caches the product catalogue in its local SQLite database with an inverted index on `barcode` and a lowercase trigram index on `name`. Local search must return results in `< 10ms`.

---

### 3.2 Full Catalogue Sync
* **Method & URL:** `GET /api/products?isActive=true`
* **Authentication:** Bearer Token
* **Role:** Any
* **Success Response (`200 OK`):**
```json
{
  "success": true,
  "count": 450,
  "products": [ ... ]
}
```
* **Offline Suitability:** Downloaded on initial login and refreshed in the background periodically or upon pull-to-refresh.

---

### 3.3 Quick-Add Product (Scanned Unknown Barcode)
* **Method & URL:** `POST /api/products`
* **Authentication:** Bearer Token + `x-admin-pin-auth` (if user role is `CASHIER`)
* **Role:** Admin OR Cashier with valid Admin PIN token
* **Request Body:**
```json
{
  "name": "Britannia Good Day 100g",
  "barcode": "8901030381023",
  "sku": "BRI-GD-100",
  "categoryId": null,
  "sellingPrice": 20.0,
  "purchasePrice": 16.5,
  "stockQuantity": 50,
  "unit": "packet",
  "lowStockThreshold": 10,
  "hsnCode": "1905",
  "gstRate": 18.0
}
```
* **Success Response (`201 Created`):**
```json
{
  "success": true,
  "message": "Product created successfully",
  "product": {
    "id": "prod_new_99",
    "name": "Britannia Good Day 100g",
    "barcode": "8901030381023",
    "sellingPrice": 20.0,
    "stockQuantity": 50.0
  }
}
```
* **Error Responses:**
  * `400 Bad Request`: Barcode already exists in database.
  * `403 Forbidden`: Cashier attempted creation without `x-admin-pin-auth` header.

---

### 3.4 Category List
* **Method & URL:** `GET /api/categories`
* **Authentication:** Bearer Token
* **Success Response (`200 OK`):**
```json
{
  "success": true,
  "categories": [
    { "id": "cat_1", "name": "Dairy & Milk", "description": "Milk, butter, paneer" },
    { "id": "cat_2", "name": "Snacks & Biscuits", "description": "Biscuits, chips" }
  ]
}
```

---

## 4. Sales & Checkout APIs

### 4.1 Real-Time Checkout (Online Mode)
* **Method & URL:** `POST /api/sales`
* **Authentication:** Bearer Token
* **Role:** Any (Cashier / Admin)
* **Request Body:**
```json
{
  "idempotencyKey": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "customerId": "cust_optional_id",
  "items": [
    {
      "productId": "prod_101",
      "quantity": 2,
      "unitPrice": 24.0,
      "productName": "Nandini Toned Milk 500ml",
      "unit": "packet"
    }
  ],
  "subtotal": 48.0,
  "discount": 0.0,
  "total": 48.0,
  "paymentMethod": "CASH",
  "cashReceived": 50.0,
  "notes": ""
}
```
* **Server Authoritative Validation:**
  * Server recalculates subtotal from database product prices.
  * Ensures `discount <= subtotal`.
  * Ensures `total == subtotal - discount`.
  * Ensures stock sufficiency (unless `shop.allowNegativeStock` is enabled).
  * Automatically calculates change: `changeGiven = cashReceived - total = 2.0`.
* **Idempotency Protection:**
  * If the same `idempotencyKey` is received within network retries, the server returns the existing sale with `200 OK` and `{ "isDuplicate": true }` instead of charging twice or decrementing inventory twice.
* **Success Response (`201 Created`):**
```json
{
  "success": true,
  "message": "Sale completed successfully",
  "sale": {
    "id": "sale_7890",
    "shopId": "shop_clx0987654321",
    "userId": "usr_cly1234567890",
    "customerId": null,
    "invoiceNumber": "INV-1045",
    "idempotencyKey": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "subtotal": 48.0,
    "discount": 0.0,
    "total": 48.0,
    "paymentMethod": "CASH",
    "cashReceived": 50.0,
    "changeGiven": 2.0,
    "status": "COMPLETED",
    "createdAt": "2026-09-07T16:15:00.000Z",
    "items": [
      {
        "id": "si_1",
        "productId": "prod_101",
        "productName": "Nandini Toned Milk 500ml",
        "quantity": 2.0,
        "unitPrice": 24.0,
        "totalPrice": 48.0
      }
    ],
    "payments": [
      {
        "id": "pay_1",
        "method": "CASH",
        "amount": 48.0,
        "cashReceived": 50.0,
        "changeGiven": 2.0
      }
    ],
    "user": { "id": "usr_cly1234567890", "name": "Ramesh Kumar" }
  }
}
```

---

### 4.2 Offline Sales Batch Synchronization
* **Method & URL:** `POST /api/sales/sync`
* **Authentication:** Bearer Token
* **Role:** Any (Cashier / Admin)
* **Purpose:** Mobile app queues sales created while offline and flushes them in a single batch when network connectivity is restored.
* **Request Body:**
```json
{
  "sales": [
    {
      "idempotencyKey": "uuid-offline-bill-001",
      "customerId": null,
      "items": [
        { "productId": "prod_101", "quantity": 1, "unitPrice": 24.0 }
      ],
      "subtotal": 24.0,
      "discount": 0.0,
      "total": 24.0,
      "paymentMethod": "CASH",
      "cashReceived": 30.0,
      "createdAt": "2026-09-07T14:10:00.000Z"
    },
    {
      "idempotencyKey": "uuid-offline-bill-002",
      "customerId": "cust_khata_1",
      "items": [
        { "productId": "prod_102", "quantity": 3, "unitPrice": 50.0 }
      ],
      "subtotal": 150.0,
      "discount": 10.0,
      "total": 140.0,
      "paymentMethod": "CREDIT",
      "createdAt": "2026-09-07T14:22:00.000Z"
    }
  ]
}
```
* **Success Response (`200 OK`):**
```json
{
  "success": true,
  "synced": [
    {
      "idempotencyKey": "uuid-offline-bill-001",
      "saleId": "sale_8001",
      "invoiceNumber": "INV-1046",
      "status": "synced"
    },
    {
      "idempotencyKey": "uuid-offline-bill-002",
      "saleId": "sale_8002",
      "invoiceNumber": "INV-1047",
      "status": "synced"
    }
  ],
  "failed": []
}
```
* **Offline Protocol Handling:**
  * For each successfully returned key in `synced`, the mobile SQLite queue marks or purges the pending record.
  * If a sale was already recorded on a previous interrupted sync, the server identifies it and returns status `'already_synced'`, allowing the client to safely dequeue it.

---

### 4.3 Sales History & Receipt Reprint
* **Method & URL:** `GET /api/sales?range=today&page=1&limit=20`
* **Authentication:** Bearer Token
* **Query Parameters:**
  * `range`: `'today' | 'yesterday' | 'thisWeek' | 'thisMonth'`
  * `search`: Invoice number (e.g. `INV-1045`) or customer name
  * `page`: Page number (default: 1)
  * `limit`: Page size (default: 30)
* **Success Response (`200 OK`):**
```json
{
  "success": true,
  "sales": [ ... ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 85,
    "totalPages": 5
  }
}
```

---

### 4.4 Sales Daily Summary
* **Method & URL:** `GET /api/sales/summary`
* **Authentication:** Bearer Token
* **Success Response (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "today": {
      "totalAmount": 14520.0,
      "billCount": 42,
      "cashAmount": 8200.0,
      "upiAmount": 4920.0,
      "cardAmount": 1000.0,
      "creditAmount": 400.0,
      "totalDiscount": 240.0
    }
  }
}
```

---

## 5. Customer & Store Credit (Khata) APIs

### 5.1 Search Customers
* **Method & URL:** `GET /api/customers?search={name_or_phone}&hasBalance=true`
* **Authentication:** Bearer Token
* **Success Response (`200 OK`):**
```json
{
  "success": true,
  "customers": [
    {
      "id": "cust_101",
      "shopId": "shop_clx0987654321",
      "name": "Suresh Gowda",
      "phone": "9845012345",
      "totalCredit": 450.0,
      "createdAt": "2026-08-01T10:00:00.000Z"
    }
  ],
  "summary": {
    "totalOutstandingCredit": 12850.0,
    "totalCustomers": 94,
    "customersWithBalance": 18
  }
}
```
* **Offline Suitability:** Customers are synced to the local SQLite database. Cashiers can perform offline Khata checkouts. Total balance increments locally and synchronizes upon reconnect.

---

### 5.2 Create New Customer
* **Method & URL:** `POST /api/customers`
* **Authentication:** Bearer Token
* **Request Body:**
```json
{
  "name": "Anil Kumar",
  "phone": "9900112233",
  "openingBalance": 0
}
```
* **Success Response (`201 Created`):**
```json
{
  "success": true,
  "message": "Customer created successfully",
  "customer": {
    "id": "cust_new_2",
    "name": "Anil Kumar",
    "phone": "9900112233",
    "totalCredit": 0.0
  }
}
```

---

### 5.3 Record Khata Payment (Debt Settlement)
* **Method & URL:** `POST /api/customers/:id/payments`
* **Authentication:** Bearer Token
* **Request Body:**
```json
{
  "amount": 200.0,
  "paymentMethod": "CASH",
  "notes": "Paid part of monthly milk dues"
}
```
* **Success Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Payment recorded successfully",
  "customer": {
    "id": "cust_101",
    "totalCredit": 250.0
  },
  "payment": {
    "id": "cpay_45",
    "amount": 200.0,
    "paymentMethod": "CASH"
  }
}
```

---

## 6. Daily Cash Closing APIs

### 6.1 Closing Summary
* **Method & URL:** `GET /api/closing/summary`
* **Authentication:** Bearer Token
* **Role:** Any (Cashier / Admin)
* **Success Response (`200 OK`):**
```json
{
  "success": true,
  "summary": {
    "date": "2026-09-07T00:00:00.000Z",
    "totalBills": 38,
    "grossSales": 12840.0,
    "discounts": 140.0,
    "netSales": 12700.0,
    "cashSales": 7500.0,
    "upiSales": 4200.0,
    "cardSales": 800.0,
    "creditSales": 200.0,
    "expectedCash": 7500.0,
    "isClosed": false,
    "closingRecord": null
  }
}
```

---

### 6.2 Close Register
* **Method & URL:** `POST /api/closing`
* **Authentication:** Bearer Token
* **Role:** Any (Cashier / Admin)
* **Request Body:**
```json
{
  "actualCash": 7450.0,
  "notes": "₹50 short due to discarded torn note"
}
```
* **Success Response (`201 Created`):**
```json
{
  "success": true,
  "message": "Day successfully closed and recorded",
  "closing": {
    "id": "close_99",
    "closingDate": "2026-09-07T00:00:00.000Z",
    "totalBills": 38,
    "grossSales": 12840.0,
    "netSales": 12700.0,
    "cashSales": 7500.0,
    "expectedCash": 7500.0,
    "actualCash": 7450.0,
    "cashDifference": -50.0,
    "notes": "₹50 short due to discarded torn note",
    "closedAt": "2026-09-07T21:30:00.000Z"
  }
}
```

---

### 6.3 Closing History
* **Method & URL:** `GET /api/closing/history?limit=15`
* **Authentication:** Bearer Token
* **Success Response (`200 OK`):**
```json
{
  "success": true,
  "closings": [ ... ]
}
```

---

## 7. Shop & Invoicing Configuration APIs

### 7.1 Read Shop Config
* **Method & URL:** `GET /api/shop`
* **Authentication:** Bearer Token
* **Success Response (`200 OK`):**
```json
{
  "success": true,
  "shop": {
    "id": "shop_clx0987654321",
    "name": "Super Daily Grocery Store",
    "phone": "9876543210",
    "address": "12 Market Road, Bengaluru",
    "currency": "₹",
    "invoicePrefix": "INV-",
    "receiptFooter": "Thank You! Visit Again 😊",
    "upiId": "superdaily@okhdfcbank",
    "gstEnabled": true,
    "gstType": "INCLUSIVE",
    "gstNumber": "29ABCDE1234F1Z5",
    "defaultCgstRate": 2.5,
    "defaultSgstRate": 2.5,
    "defaultIgstRate": 5.0,
    "defaultHsnCode": "0401",
    "allowNegativeStock": false
  }
}
```

---

## 8. Offline Caching Matrix

| Entity | Offline Storage Target | Sync Strategy | Invalidation / Refresh |
| :--- | :--- | :--- | :--- |
| **Auth Session & Token** | `Expo SecureStore` (Encrypted Keystore) | Stored at login | Cleared on explicit logout or 401 |
| **Shop Configuration** | Local SQLite (`shop_config` table) | Downloaded at login | Refreshed on app startup / pull-to-refresh |
| **Product Catalogue** | Local SQLite (`products` table) | Bulk downloaded at login | Delta refresh / timestamp checked on connect |
| **Barcode Index** | Local SQLite index `idx_products_barcode` | Maintained in SQLite | Automatic with product updates |
| **Categories** | Local SQLite (`categories` table) | Bulk downloaded at login | Refreshed on app startup |
| **Customers (Khata)** | Local SQLite (`customers` table) | Downloaded at login | Local balance updated instantly on sale |
| **Pending Sales Queue** | Local SQLite (`pending_sales` table) | Flushed via `POST /api/sales/sync` | Deleted upon confirmed sync receipt |

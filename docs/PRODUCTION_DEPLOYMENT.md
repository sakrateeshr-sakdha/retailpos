# RetailPOS - Production Deployment & Operations Guide

This guide provides exhaustive instructions for deploying, securing, maintaining, and scaling the RetailPOS grocery shop platform in production.

---

## 1. Architecture Overview

```
                          [ Cashier Desktop / Tablet / Mobile ]
                                         │
                                  HTTPS (Port 443)
                                         ▼
                               ┌───────────────────┐
                               │   Nginx Reverse   │
                               │  Proxy + SSL/TLS  │
                               └─────────┬─────────┘
                                         │
                        ┌────────────────┴────────────────┐
                        ▼                                 ▼
             /api/* (Reverse Proxy)            /* (Static Web Files)
                        ▼                                 ▼
             ┌─────────────────────┐            ┌───────────────────┐
             │ Node.js / Express   │            │ Built Vite SPA    │
             │ Backend (PM2 / :5000│            │ /var/www/retailpos│
             └──────────┬──────────┘            └───────────────────┘
                        │
                        ▼
             ┌─────────────────────┐
             │ PostgreSQL 16 DB    │
             │ (Port 5432)         │
             └─────────────────────┘
```

---

## 2. Environment Variables Reference

### Backend (`backend/.env`)

| Variable | Description | Example / Default |
| :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection pool URL | `postgresql://user:pass@localhost:5432/retailpos?schema=public` |
| `JWT_SECRET` | 64+ char random secret key | Generated via `openssl rand -base64 48` |
| `PORT` | Local listener port | `5000` |
| `NODE_ENV` | Runtime environment | `production` |
| `CORS_ORIGIN` | Allowed web origin (or comma-separated) | `https://pos.yourgrocerystore.com` |

### Frontend (`frontend/.env`)

| Variable | Description | Example / Default |
| :--- | :--- | :--- |
| `VITE_API_BASE_URL` | Base API URL (omit if Nginx handles `/api`) | Empty / `https://pos.yourgrocerystore.com/api` |

---

## 3. Database Migration Strategy

RetailPOS uses **Prisma ORM** with PostgreSQL. Follow strict production migration practices to ensure zero downtime and zero data loss.

### First-Time Production Setup:
```bash
cd backend
npx prisma migrate deploy
```

### Applying Future Schema Updates:
1. **Never** run `prisma db push --accept-data-loss` in production.
2. In your local/staging environment, create tracked SQL migrations:
   ```bash
   npx prisma migrate dev --name <description_of_change>
   ```
3. Commit the generated SQL folder under `backend/prisma/migrations/`.
4. In production deployment pipelines, run:
   ```bash
   npx prisma migrate deploy
   ```
   This automatically applies only unapplied migrations safely in order inside a database transaction.

---

## 4. Automated Backup Strategy

### A. Automated Daily PostgreSQL Dump (`cron`)
Create an automated nightly backup script to prevent data loss.

1. Create backup directory:
   ```bash
   sudo mkdir -p /var/backups/retailpos
   sudo chown -R postgres:postgres /var/backups/retailpos
   ```

2. Create `/usr/local/bin/backup-retailpos.sh`:
   ```bash
   #!/bin/bash
   set -e
   BACKUP_DIR="/var/backups/retailpos"
   DATE=$(date +"%Y%m%d_%H%M%S")
   FILENAME="$BACKUP_DIR/retailpos_$DATE.sql.gz"

   # Create compressed dump
   pg_dump -U postgres -d retailpos | gzip > "$FILENAME"

   # Keep last 30 days of backups; delete older
   find "$BACKUP_DIR" -type f -name "retailpos_*.sql.gz" -mtime +30 -delete

   echo "[$(date)] Backup completed: $FILENAME"
   ```

3. Make executable and add to crontab:
   ```bash
   chmod +x /usr/local/bin/backup-retailpos.sh
   # Run every night at 2:00 AM
   (crontab -l 2>/dev/null; echo "0 2 * * * /usr/local/bin/backup-retailpos.sh >> /var/log/retailpos-backup.log 2>&1") | crontab -
   ```

### B. Admin UI In-App Backup & Restore
- Store owners can navigate to **Settings > Backup & Disaster Recovery**.
- Click **"Export Backup"** to download an encrypted, SHA-256 verified JSON snapshot containing:
  - Shop Profile & settings
  - Products & Inventory counts
  - Customers, balances & khata ledger
  - Sales & sale items
  - Daily closing audit records
- Store this JSON file on an external USB thumb drive or Google Drive before major upgrades.
- Restore atomically by uploading the file; RetailPOS validates schema and cryptographic checksums before applying changes inside a single database transaction.

---

## 5. Process Management (PM2 Configuration)

Use **PM2** to manage the Node.js backend cluster, handle log rotation, and restart upon server reboot.

1. Install PM2:
   ```bash
   sudo npm install -g pm2
   ```

2. Create `ecosystem.config.cjs` in `/workspaces/retailpos` (or project root):
   ```javascript
   module.exports = {
     apps: [
       {
         name: 'retailpos-api',
         script: 'dist/index.js',
         cwd: '/var/www/retailpos/backend',
         instances: 'max',
         exec_mode: 'cluster',
         env: {
           NODE_ENV: 'production',
           PORT: 5000,
         },
         max_memory_restart: '500M',
         error_file: '/var/log/retailpos/api-err.log',
         out_file: '/var/log/retailpos/api-out.log',
         time: true,
       },
     ],
   };
   ```

3. Start and persist PM2:
   ```bash
   pm2 start ecosystem.config.cjs
   pm2 save
   pm2 startup
   ```

---

## 6. Reverse Proxy Setup (Nginx + SSL/TLS + HTTP/2)

Deploy Nginx to serve the compiled frontend SPA and reverse-proxy `/api` requests to the Express backend.

Create `/etc/nginx/sites-available/retailpos`:
```nginx
# Redirect HTTP to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name pos.yourgrocerystore.com;
    return 301 https://$host$request_uri;
}

# Production HTTPS Server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name pos.yourgrocerystore.com;

    # SSL Certificates (Let's Encrypt / Certbot)
    ssl_certificate /etc/letsencrypt/live/pos.yourgrocerystore.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/pos.yourgrocerystore.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;" always;

    # Gzip Compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript image/svg+xml;

    # Frontend Static SPA
    root /var/www/retailpos/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
        expires 1h;
        add_header Cache-Control "public, no-transform";
    }

    # API Reverse Proxy
    location /api/ {
        proxy_pass http://127.0.0.1:5000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

Enable site:
```bash
sudo ln -s /etc/nginx/sites-available/retailpos /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 7. CORS and Security Headers Configuration

- The backend Express app uses `cors` and validates the origin header.
- Permitted headers include:
  - `Content-Type`
  - `Authorization` (Bearer JWT token)
  - `x-admin-pin-auth` (Admin PIN authentication for secure product creation & register adjustments)
  - `x-idempotency-key` (Checkout double-click prevention)
- In production, ensure `CORS_ORIGIN` in `backend/.env` is set to your exact HTTPS production domain:
  `CORS_ORIGIN="https://pos.yourgrocerystore.com"`

---

## 8. PWA / Desktop Hardware Setup Guide

RetailPOS is designed to run seamlessly on both desktop workstations (Chrome/Edge/Firefox) and mobile tablets/smartphones.

### A. Barcode Scanners
1. **USB Handheld Scanners (Honeywell, Zebra, TVS, Datalogic):**
   - Connect scanner via USB port.
   - Configure scanner to send a trailing **Enter (`\r\n`)** key after barcode scan (this is factory default on 99% of scanners).
   - Cashiers can scan items directly from anywhere on the Billing screen; RetailPOS auto-detects and adds items with automatic quantity increments.
2. **Bluetooth Scanners:**
   - Pair scanner in HID keyboard mode with host computer or tablet.
3. **Camera Barcode Scanning:**
   - Available on mobile/tablet via the built-in HTML5 camera scanner button on the search bar.

### B. Thermal Receipt Printers (58mm & 80mm)
1. Install thermal printer driver (e.g. POS-58 or POS-80 USB driver / ESC/POS driver).
2. In OS Printer Settings:
   - Set paper size to `58mm * Continuous` or `80mm * Continuous`.
   - Set margins to **None / 0mm**.
3. In Chrome/Edge Print Dialog:
   - Margins: **None**.
   - Headers and Footers: **Unchecked**.
   - Scale: **Default (100%)**.
4. Test print: Completed bills open the Thermal Receipt dialog. Toggle between **58mm** and **80mm** width directly in the dialog.

---

## 9. Step-by-Step First-Time Deployment Checklist

- [ ] **Step 1: Install System Prerequisites**
  ```bash
  sudo apt update && sudo apt install -y curl git nginx postgresql postgresql-contrib
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
  sudo apt install -y nodejs
  ```

- [ ] **Step 2: Setup PostgreSQL Database**
  ```bash
  sudo -u postgres psql -c "CREATE USER retailpos_user WITH PASSWORD 'StrongPassword123';"
  sudo -u postgres psql -c "CREATE DATABASE retailpos OWNER retailpos_user;"
  ```

- [ ] **Step 3: Clone Codebase & Install Dependencies**
  ```bash
  git clone https://github.com/your-org/retailpos.git /var/www/retailpos
  cd /var/www/retailpos/backend && npm ci
  cd /var/www/retailpos/frontend && npm ci
  ```

- [ ] **Step 4: Configure Backend Environment**
  ```bash
  cp backend/.env.example backend/.env
  # Update DATABASE_URL and JWT_SECRET in backend/.env
  ```

- [ ] **Step 5: Run Database Migrations**
  ```bash
  cd /var/www/retailpos/backend
  npx prisma migrate deploy
  ```

- [ ] **Step 6: Build Frontend & Backend**
  ```bash
  cd /var/www/retailpos/backend && npm run build
  cd /var/www/retailpos/frontend && npm run build
  ```

- [ ] **Step 7: Start Backend with PM2**
  ```bash
  pm2 start /var/www/retailpos/backend/dist/index.js --name "retailpos-api"
  pm2 save && pm2 startup
  ```

- [ ] **Step 8: Configure Nginx & SSL Certificate**
  ```bash
  sudo certbot --nginx -d pos.yourgrocerystore.com
  sudo systemctl restart nginx
  ```

- [ ] **Step 9: Setup Nightly Backup Cron**
  Configure `/usr/local/bin/backup-retailpos.sh` as documented in Section 4.

- [ ] **Step 10: Shop Onboarding & First Login**
  - Open `https://pos.yourgrocerystore.com`
  - Complete the initial Shop Owner Onboarding wizard (Shop name, Admin credentials, Admin PIN).
  - Configure UPI ID and GST settings in **Settings**.
  - Perform a test scan and print a test thermal receipt.

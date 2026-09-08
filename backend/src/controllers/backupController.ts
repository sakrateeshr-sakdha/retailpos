import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { prisma } from '../config/prisma.js';

// GET /api/backup/status
export const getBackupStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shopId = req.user!.shopId;

    const [shop, productCount, customerCount, saleCount, recentBackups] = await Promise.all([
      prisma.shop.findUnique({
        where: { id: shopId },
        select: { id: true, name: true, lastBackupAt: true },
      }),
      prisma.product.count({ where: { shopId } }),
      prisma.customer.count({ where: { shopId } }),
      prisma.sale.count({ where: { shopId } }),
      prisma.backupRecord.findMany({
        where: { shopId },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    res.json({
      success: true,
      status: {
        lastBackupAt: shop?.lastBackupAt || null,
        counts: {
          products: productCount,
          customers: customerCount,
          sales: saleCount,
        },
        recentBackups,
      },
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/backup/export
export const exportBackup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shopId = req.user!.shopId;

    const [
      shop,
      categories,
      products,
      customers,
      customerPayments,
      sales,
      dailyClosings,
      invoiceSequence,
    ] = await Promise.all([
      prisma.shop.findUnique({ where: { id: shopId } }),
      prisma.category.findMany({ where: { shopId } }),
      prisma.product.findMany({ where: { shopId } }),
      prisma.customer.findMany({ where: { shopId } }),
      prisma.customerPayment.findMany({
        where: { customer: { shopId } },
      }),
      prisma.sale.findMany({
        where: { shopId },
        include: { items: true, payments: true },
      }),
      prisma.dailyClosing.findMany({ where: { shopId } }),
      prisma.shopInvoiceSequence.findUnique({ where: { shopId } }),
    ]);

    if (!shop) {
      res.status(404).json({ success: false, message: 'Shop not found' });
      return;
    }

    const payloadData = {
      shop: {
        name: shop.name,
        address: shop.address,
        phone: shop.phone,
        gstNumber: shop.gstNumber,
        gstEnabled: shop.gstEnabled,
        gstType: shop.gstType,
        defaultCgstRate: Number(shop.defaultCgstRate),
        defaultSgstRate: Number(shop.defaultSgstRate),
        defaultIgstRate: Number(shop.defaultIgstRate),
        defaultHsnCode: shop.defaultHsnCode,
        invoicePrefix: shop.invoicePrefix,
        currency: shop.currency,
        upiId: shop.upiId,
        receiptFooter: shop.receiptFooter,
        allowNegativeStock: shop.allowNegativeStock,
      },
      categories,
      products,
      customers,
      customerPayments,
      sales,
      dailyClosings,
      invoiceSequence,
    };

    const dataString = JSON.stringify(payloadData);
    const checksum = crypto.createHash('sha256').update(dataString).digest('hex');

    const backupObject = {
      format: 'RETAILPOS_BACKUP_V1',
      version: 1,
      exportedAt: new Date().toISOString(),
      shopId,
      shopName: shop.name,
      checksum,
      counts: {
        categories: categories.length,
        products: products.length,
        customers: customers.length,
        sales: sales.length,
        dailyClosings: dailyClosings.length,
      },
      data: payloadData,
    };

    const backupJson = JSON.stringify(backupObject, null, 2);
    const fileSize = Buffer.byteLength(backupJson, 'utf8');
    const totalRecords =
      categories.length +
      products.length +
      customers.length +
      sales.length +
      dailyClosings.length;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `backup_${shop.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${timestamp}.json`;

    // Record backup in database
    await prisma.$transaction([
      prisma.backupRecord.create({
        data: {
          shopId,
          fileName,
          fileSize,
          recordCount: totalRecords,
          status: 'SUCCESS',
        },
      }),
      prisma.shop.update({
        where: { id: shopId },
        data: { lastBackupAt: new Date() },
      }),
    ]);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(backupJson);
  } catch (error) {
    next(error);
  }
};

// POST /api/backup/restore
export const restoreBackup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shopId = req.user!.shopId;
    const backup = req.body;

    if (!backup || backup.format !== 'RETAILPOS_BACKUP_V1' || !backup.data) {
      res.status(400).json({
        success: false,
        message: 'Invalid backup format. Must be a valid RetailPOS V1 backup file.',
      });
      return;
    }

    const { data, checksum } = backup;
    const computedChecksum = crypto
      .createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex');

    if (checksum && checksum !== computedChecksum) {
      res.status(400).json({
        success: false,
        message: 'Backup integrity check failed: Checksum mismatch. File may be corrupted.',
      });
      return;
    }

    const {
      categories = [],
      products = [],
      customers = [],
      customerPayments = [],
      sales = [],
      dailyClosings = [],
      invoiceSequence,
    } = data;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Categories
      for (const cat of categories) {
        await tx.category.upsert({
          where: { id: cat.id },
          update: { name: cat.name, description: cat.description },
          create: {
            id: cat.id,
            shopId,
            name: cat.name,
            description: cat.description,
          },
        });
      }

      // 2. Products
      for (const p of products) {
        await tx.product.upsert({
          where: { id: p.id },
          update: {
            name: p.name,
            barcode: p.barcode || null,
            sku: p.sku || null,
            categoryId: p.categoryId || null,
            purchasePrice: p.purchasePrice,
            sellingPrice: p.sellingPrice,
            stockQuantity: p.stockQuantity,
            unit: p.unit || 'pcs',
            lowStockThreshold: p.lowStockThreshold || 5,
            hsnCode: p.hsnCode || null,
            gstRate: p.gstRate || null,
            isActive: p.isActive !== undefined ? p.isActive : true,
          },
          create: {
            id: p.id,
            shopId,
            categoryId: p.categoryId || null,
            name: p.name,
            barcode: p.barcode || null,
            sku: p.sku || null,
            purchasePrice: p.purchasePrice,
            sellingPrice: p.sellingPrice,
            stockQuantity: p.stockQuantity,
            unit: p.unit || 'pcs',
            lowStockThreshold: p.lowStockThreshold || 5,
            hsnCode: p.hsnCode || null,
            gstRate: p.gstRate || null,
            isActive: p.isActive !== undefined ? p.isActive : true,
          },
        });
      }

      // 3. Customers
      for (const c of customers) {
        await tx.customer.upsert({
          where: { id: c.id },
          update: {
            name: c.name,
            phone: c.phone || null,
            email: c.email || null,
            address: c.address || null,
            totalCredit: c.totalCredit,
          },
          create: {
            id: c.id,
            shopId,
            name: c.name,
            phone: c.phone || null,
            email: c.email || null,
            address: c.address || null,
            totalCredit: c.totalCredit,
          },
        });
      }

      // 4. Customer Payments
      for (const cp of customerPayments) {
        await tx.customerPayment.upsert({
          where: { id: cp.id },
          update: {
            amount: cp.amount,
            paymentMethod: cp.paymentMethod,
            notes: cp.notes || null,
          },
          create: {
            id: cp.id,
            customerId: cp.customerId,
            amount: cp.amount,
            paymentMethod: cp.paymentMethod,
            notes: cp.notes || null,
            createdAt: cp.createdAt ? new Date(cp.createdAt) : undefined,
          },
        });
      }

      // 5. Sales & Items
      for (const s of sales) {
        await tx.sale.upsert({
          where: { id: s.id },
          update: {
            status: s.status,
            subtotal: s.subtotal,
            discount: s.discount,
            total: s.total,
            paymentMethod: s.paymentMethod,
          },
          create: {
            id: s.id,
            shopId,
            userId: req.user!.id,
            customerId: s.customerId || null,
            invoiceNumber: s.invoiceNumber,
            idempotencyKey: s.idempotencyKey || null,
            subtotal: s.subtotal,
            discount: s.discount,
            total: s.total,
            paymentMethod: s.paymentMethod,
            status: s.status || 'COMPLETED',
            notes: s.notes || null,
            createdAt: s.createdAt ? new Date(s.createdAt) : undefined,
          },
        });

        if (Array.isArray(s.items)) {
          for (const item of s.items) {
            await tx.saleItem.upsert({
              where: { id: item.id },
              update: {},
              create: {
                id: item.id,
                saleId: s.id,
                productId: item.productId || null,
                productName: item.productName,
                quantity: item.quantity,
                unit: item.unit || 'pcs',
                unitPrice: item.unitPrice,
                purchasePrice: item.purchasePrice || 0,
                totalPrice: item.totalPrice,
              },
            });
          }
        }

        if (Array.isArray(s.payments)) {
          for (const pay of s.payments) {
            await tx.payment.upsert({
              where: { id: pay.id },
              update: {},
              create: {
                id: pay.id,
                saleId: s.id,
                method: pay.method,
                amount: pay.amount,
                cashReceived: pay.cashReceived || null,
                changeGiven: pay.changeGiven || null,
                referenceNumber: pay.referenceNumber || null,
              },
            });
          }
        }
      }

      // 6. Daily Closings
      for (const dc of dailyClosings) {
        await tx.dailyClosing.upsert({
          where: { id: dc.id },
          update: {},
          create: {
            id: dc.id,
            shopId,
            userId: req.user!.id,
            closingDate: dc.closingDate ? new Date(dc.closingDate) : new Date(),
            totalBills: dc.totalBills,
            grossSales: dc.grossSales,
            discounts: dc.discounts,
            netSales: dc.netSales,
            cashSales: dc.cashSales,
            upiSales: dc.upiSales,
            cardSales: dc.cardSales,
            creditSales: dc.creditSales,
            expectedCash: dc.expectedCash,
            actualCash: dc.actualCash,
            cashDifference: dc.cashDifference,
            notes: dc.notes || null,
            closedAt: dc.closedAt ? new Date(dc.closedAt) : new Date(),
          },
        });
      }

      // 7. Update Sequence if provided
      if (invoiceSequence?.nextInvoiceNumber) {
        await tx.shopInvoiceSequence.upsert({
          where: { shopId },
          update: { nextInvoiceNumber: invoiceSequence.nextInvoiceNumber },
          create: { shopId, nextInvoiceNumber: invoiceSequence.nextInvoiceNumber },
        });
      }

      return {
        categories: categories.length,
        products: products.length,
        customers: customers.length,
        sales: sales.length,
      };
    });

    res.json({
      success: true,
      message: 'Restore completed successfully',
      restored: result,
    });
  } catch (error) {
    next(error);
  }
};

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { MovementType, PaymentMethod, Prisma, SaleStatus } from '@prisma/client';
import { prisma } from '../config/prisma.js';

const saleItemSchema = z.object({
  productId: z.string().min(1, 'Product ID is required'),
  productName: z.string().optional(),
  quantity: z.coerce.number().positive('Quantity must be greater than 0'),
  unit: z.string().optional().default('pcs'),
  unitPrice: z.coerce.number().min(0, 'Unit price must be >= 0'),
  purchasePrice: z.coerce.number().min(0).optional().default(0),
  totalPrice: z.coerce.number().min(0).optional(),
});

const paymentSchema = z.object({
  method: z.nativeEnum(PaymentMethod),
  amount: z.coerce.number().min(0),
  cashReceived: z.coerce.number().min(0).nullable().optional(),
  changeGiven: z.coerce.number().min(0).nullable().optional(),
  referenceNumber: z.string().nullable().optional(),
});

const createSaleSchema = z.object({
  idempotencyKey: z.string().optional(),
  customerId: z.string().nullable().optional(),
  items: z.array(saleItemSchema).min(1, 'Cart cannot be empty. Please add products.'),
  subtotal: z.coerce.number().min(0),
  discount: z.coerce.number().min(0).default(0),
  total: z.coerce.number().min(0),
  paymentMethod: z.nativeEnum(PaymentMethod).default(PaymentMethod.CASH),
  payments: z.array(paymentSchema).optional(),
  cashReceived: z.coerce.number().nullable().optional(),
  changeGiven: z.coerce.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  createdAt: z.string().datetime().optional(), // For offline sales syncing with client timestamp
});

// Helper to generate next invoice number for a shop
async function getNextInvoiceNumber(tx: Prisma.TransactionClient, shopId: string, prefix = 'INV-'): Promise<string> {
  const count = await tx.sale.count({ where: { shopId } });
  const nextNum = 1000 + count + 1;
  return `${prefix}${nextNum}`;
}

export const createSale = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shopId = req.user!.shopId;
    const userId = req.user!.id;

    const parsed = createSaleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: parsed.error.errors[0]?.message || 'Invalid sale details',
      });
      return;
    }

    const data = parsed.data;

    // 1. Check idempotency key if provided
    if (data.idempotencyKey) {
      const existingSale = await prisma.sale.findUnique({
        where: { idempotencyKey: data.idempotencyKey },
        include: {
          items: true,
          payments: true,
          customer: true,
          user: { select: { id: true, name: true, username: true } },
        },
      });

      if (existingSale) {
        res.json({
          success: true,
          message: 'Sale already recorded (idempotent)',
          sale: existingSale,
          isDuplicate: true,
        });
        return;
      }
    }

    // 2. Fetch Shop settings
    const shop = await prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) {
      res.status(404).json({ success: false, message: 'Shop not found' });
      return;
    }

    // 3. Process Sale in Transaction
    const result = await prisma.$transaction(async (tx) => {
      // Validate all products and stock
      const productIds = data.items.map((i) => i.productId);
      const dbProducts = await tx.product.findMany({
        where: { id: { in: productIds }, shopId },
      });

      const productMap = new Map(dbProducts.map((p) => [p.id, p]));

      // Check stock availability
      for (const item of data.items) {
        const prod = productMap.get(item.productId);
        if (!prod) {
          throw new Error(`Product not found or has been removed: ${item.productName || item.productId}`);
        }

        const currentStock = Number(prod.stockQuantity);
        if (!shop.allowNegativeStock && currentStock < item.quantity) {
          throw new Error(
            `Insufficient stock for "${prod.name}". Available: ${currentStock} ${prod.unit}, Requested: ${item.quantity} ${prod.unit}`
          );
        }
      }

      // Generate invoice number
      const invoiceNumber = await getNextInvoiceNumber(tx, shopId, shop.invoicePrefix || 'INV-');

      // Create Sale
      const sale = await tx.sale.create({
        data: {
          shopId,
          userId,
          customerId: data.customerId || null,
          invoiceNumber,
          idempotencyKey: data.idempotencyKey || null,
          subtotal: new Prisma.Decimal(data.subtotal),
          discount: new Prisma.Decimal(data.discount),
          total: new Prisma.Decimal(data.total),
          paymentMethod: data.paymentMethod,
          status: SaleStatus.COMPLETED,
          notes: data.notes || null,
          ...(data.createdAt && { createdAt: new Date(data.createdAt) }),
        },
      });

      // Create Sale Items and update stock
      for (const item of data.items) {
        const prod = productMap.get(item.productId)!;
        const currentStock = Number(prod.stockQuantity);
        const newStock = currentStock - item.quantity;

        // Create item
        const calculatedTotal = item.totalPrice !== undefined ? item.totalPrice : (item.quantity * item.unitPrice);
        await tx.saleItem.create({
          data: {
            saleId: sale.id,
            productId: prod.id,
            productName: prod.name,
            quantity: new Prisma.Decimal(item.quantity),
            unit: item.unit || prod.unit,
            unitPrice: new Prisma.Decimal(item.unitPrice),
            purchasePrice: prod.purchasePrice,
            totalPrice: new Prisma.Decimal(calculatedTotal),
          },
        });

        // Update product stock
        await tx.product.update({
          where: { id: prod.id },
          data: {
            stockQuantity: new Prisma.Decimal(newStock),
          },
        });

        // Record stock movement
        await tx.stockMovement.create({
          data: {
            shopId,
            productId: prod.id,
            type: MovementType.SALE,
            quantity: new Prisma.Decimal(item.quantity),
            previousStock: new Prisma.Decimal(currentStock),
            newStock: new Prisma.Decimal(newStock),
            reason: `Sale ${invoiceNumber}`,
            referenceId: sale.id,
          },
        });
      }

      // Create Payment record
      if (data.payments && data.payments.length > 0) {
        for (const p of data.payments) {
          await tx.payment.create({
            data: {
              saleId: sale.id,
              method: p.method,
              amount: new Prisma.Decimal(p.amount),
              cashReceived: p.cashReceived ? new Prisma.Decimal(p.cashReceived) : null,
              changeGiven: p.changeGiven ? new Prisma.Decimal(p.changeGiven) : null,
              referenceNumber: p.referenceNumber || null,
            },
          });
        }
      } else {
        await tx.payment.create({
          data: {
            saleId: sale.id,
            method: data.paymentMethod,
            amount: new Prisma.Decimal(data.total),
            cashReceived: data.cashReceived ? new Prisma.Decimal(data.cashReceived) : null,
            changeGiven: data.changeGiven ? new Prisma.Decimal(data.changeGiven) : null,
          },
        });
      }

      // If customer and credit payment, update customer balance
      if (data.customerId && data.paymentMethod === PaymentMethod.CREDIT) {
        await tx.customer.update({
          where: { id: data.customerId },
          data: {
            totalCredit: {
              increment: new Prisma.Decimal(data.total),
            },
          },
        });
      }

      // Return fully populated sale
      return tx.sale.findUnique({
        where: { id: sale.id },
        include: {
          items: true,
          payments: true,
          customer: true,
          user: { select: { id: true, name: true, username: true } },
        },
      });
    });

    res.status(201).json({
      success: true,
      message: 'Sale completed successfully',
      sale: result,
    });
  } catch (error: any) {
    if (error.message?.includes('Insufficient stock') || error.message?.includes('Product not found')) {
      res.status(400).json({ success: false, message: error.message });
      return;
    }
    next(error);
  }
};

export const syncSales = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shopId = req.user!.shopId;
    const userId = req.user!.id;
    const { sales } = req.body;

    if (!Array.isArray(sales) || sales.length === 0) {
      res.json({ success: true, synced: [], failed: [] });
      return;
    }

    const synced: any[] = [];
    const failed: any[] = [];

    const shop = await prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) {
      res.status(404).json({ success: false, message: 'Shop not found' });
      return;
    }

    for (const rawSale of sales) {
      const parsed = createSaleSchema.safeParse(rawSale);
      if (!parsed.success) {
        failed.push({
          idempotencyKey: rawSale.idempotencyKey,
          reason: parsed.error.errors[0]?.message || 'Validation failed',
        });
        continue;
      }

      const data = parsed.data;

      try {
        // Check if already processed
        if (data.idempotencyKey) {
          const existing = await prisma.sale.findUnique({
            where: { idempotencyKey: data.idempotencyKey },
            include: { items: true, payments: true },
          });
          if (existing) {
            synced.push({
              idempotencyKey: data.idempotencyKey,
              saleId: existing.id,
              invoiceNumber: existing.invoiceNumber,
              status: 'already_synced',
            });
            continue;
          }
        }

        // Process sale
        const completed = await prisma.$transaction(async (tx) => {
          const productIds = data.items.map((i) => i.productId);
          const dbProducts = await tx.product.findMany({
            where: { id: { in: productIds }, shopId },
          });
          const productMap = new Map(dbProducts.map((p) => [p.id, p]));

          const invoiceNumber = await getNextInvoiceNumber(tx, shopId, shop.invoicePrefix || 'INV-');

          const sale = await tx.sale.create({
            data: {
              shopId,
              userId,
              customerId: data.customerId || null,
              invoiceNumber,
              idempotencyKey: data.idempotencyKey || null,
              subtotal: new Prisma.Decimal(data.subtotal),
              discount: new Prisma.Decimal(data.discount),
              total: new Prisma.Decimal(data.total),
              paymentMethod: data.paymentMethod,
              status: SaleStatus.COMPLETED,
              notes: data.notes || null,
              createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
            },
          });

          for (const item of data.items) {
            const prod = productMap.get(item.productId);
            const currentStock = prod ? Number(prod.stockQuantity) : 0;
            const newStock = currentStock - item.quantity;

            const calculatedTotal = item.totalPrice !== undefined ? item.totalPrice : (item.quantity * item.unitPrice);
            await tx.saleItem.create({
              data: {
                saleId: sale.id,
                productId: prod?.id || null,
                productName: prod?.name || item.productName || 'Product',
                quantity: new Prisma.Decimal(item.quantity),
                unit: item.unit || prod?.unit || 'pcs',
                unitPrice: new Prisma.Decimal(item.unitPrice),
                purchasePrice: prod ? prod.purchasePrice : new Prisma.Decimal(0),
                totalPrice: new Prisma.Decimal(calculatedTotal),
              },
            });

            if (prod) {
              await tx.product.update({
                where: { id: prod.id },
                data: { stockQuantity: new Prisma.Decimal(newStock) },
              });

              await tx.stockMovement.create({
                data: {
                  shopId,
                  productId: prod.id,
                  type: MovementType.SALE,
                  quantity: new Prisma.Decimal(item.quantity),
                  previousStock: new Prisma.Decimal(currentStock),
                  newStock: new Prisma.Decimal(newStock),
                  reason: `Offline Sync Sale ${invoiceNumber}`,
                  referenceId: sale.id,
                },
              });
            }
          }

          await tx.payment.create({
            data: {
              saleId: sale.id,
              method: data.paymentMethod,
              amount: new Prisma.Decimal(data.total),
              cashReceived: data.cashReceived ? new Prisma.Decimal(data.cashReceived) : null,
              changeGiven: data.changeGiven ? new Prisma.Decimal(data.changeGiven) : null,
            },
          });

          if (data.customerId && data.paymentMethod === PaymentMethod.CREDIT) {
            await tx.customer.update({
              where: { id: data.customerId },
              data: { totalCredit: { increment: new Prisma.Decimal(data.total) } },
            });
          }

          return sale;
        });

        synced.push({
          idempotencyKey: data.idempotencyKey,
          saleId: completed.id,
          invoiceNumber: completed.invoiceNumber,
          status: 'synced',
        });
      } catch (err: any) {
        failed.push({
          idempotencyKey: data.idempotencyKey,
          reason: err.message || 'Sync error',
        });
      }
    }

    res.json({ success: true, synced, failed });
  } catch (error) {
    next(error);
  }
};

export const getSales = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shopId = req.user!.shopId;
    const { range, search, paymentMethod, page = '1', limit = '30' } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const take = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 30));
    const skip = (pageNum - 1) * take;

    const where: Prisma.SaleWhereInput = { shopId };

    // Date range filter
    const now = new Date();
    if (range === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      where.createdAt = { gte: start, lte: end };
    } else if (range === 'yesterday') {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const start = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0);
      const end = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59, 999);
      where.createdAt = { gte: start, lte: end };
    } else if (range === 'thisWeek') {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday start
      const start = new Date(now.setDate(diff));
      start.setHours(0, 0, 0, 0);
      where.createdAt = { gte: start };
    } else if (range === 'thisMonth') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
      where.createdAt = { gte: start };
    }

    if (paymentMethod && typeof paymentMethod === 'string' && paymentMethod !== 'ALL') {
      where.paymentMethod = paymentMethod as PaymentMethod;
    }

    if (search && typeof search === 'string') {
      const q = search.trim();
      where.OR = [
        { invoiceNumber: { contains: q, mode: 'insensitive' } },
        { customer: { name: { contains: q, mode: 'insensitive' } } },
        { customer: { phone: { contains: q } } },
      ];
    }

    const [totalSalesCount, sales] = await Promise.all([
      prisma.sale.count({ where }),
      prisma.sale.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          items: true,
          payments: true,
          customer: { select: { id: true, name: true, phone: true } },
          user: { select: { id: true, name: true, username: true } },
        },
      }),
    ]);

    res.json({
      success: true,
      sales,
      pagination: {
        page: pageNum,
        limit: take,
        total: totalSalesCount,
        totalPages: Math.ceil(totalSalesCount / take),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getSaleById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shopId = req.user!.shopId;
    const id = req.params.id as string;

    const sale = await prisma.sale.findFirst({
      where: {
        shopId,
        OR: [{ id }, { invoiceNumber: id }],
      },
      include: {
        items: true,
        payments: true,
        customer: true,
        user: { select: { id: true, name: true, username: true } },
        shop: true,
      },
    });

    if (!sale) {
      res.status(404).json({ success: false, message: 'Sale not found' });
      return;
    }

    res.json({ success: true, sale });
  } catch (error) {
    next(error);
  }
};

export const getSalesSummary = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shopId = req.user!.shopId;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const todaySales = await prisma.sale.findMany({
      where: {
        shopId,
        status: SaleStatus.COMPLETED,
        createdAt: { gte: startOfToday, lte: endOfToday },
      },
      include: {
        payments: true,
      },
    });

    let totalAmount = 0;
    let cashAmount = 0;
    let upiAmount = 0;
    let cardAmount = 0;

    for (const sale of todaySales) {
      totalAmount += Number(sale.total);
      for (const p of sale.payments) {
        const amt = Number(p.amount);
        if (p.method === PaymentMethod.CASH) cashAmount += amt;
        else if (p.method === PaymentMethod.UPI) upiAmount += amt;
        else if (p.method === PaymentMethod.CARD) cardAmount += amt;
      }
    }

    res.json({
      success: true,
      data: {
        today: {
          totalAmount,
          billCount: todaySales.length,
          cashAmount,
          upiAmount,
          cardAmount,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};


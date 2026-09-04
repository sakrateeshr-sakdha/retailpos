import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { MovementType, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';

const stockInSchema = z.object({
  productId: z.string().min(1, 'Product ID is required'),
  quantity: z.coerce.number().positive('Quantity must be greater than 0'),
  reason: z.string().optional().default('Stock Inward / Purchase'),
});

const stockAdjustmentSchema = z.object({
  productId: z.string().min(1, 'Product ID is required'),
  quantity: z.coerce.number().positive('Quantity must be greater than 0'),
  type: z.enum(['ADJUSTMENT', 'RETURN', 'PURCHASE']),
  isDeduction: z.boolean().default(false), // true if decreasing stock (e.g. damage, expired)
  reason: z.string().min(1, 'Reason is required for stock adjustments'),
});

export const addStock = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shopId = req.user!.shopId;
    const parsed = stockInSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ success: false, message: parsed.error.errors[0]?.message });
      return;
    }

    const { productId, quantity, reason } = parsed.data;

    const product = await prisma.product.findFirst({
      where: { id: productId, shopId },
    });

    if (!product) {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }

    const currentStock = Number(product.stockQuantity);
    const newStock = currentStock + quantity;

    const result = await prisma.$transaction(async (tx) => {
      const updatedProduct = await tx.product.update({
        where: { id: productId },
        data: { stockQuantity: new Prisma.Decimal(newStock) },
      });

      const movement = await tx.stockMovement.create({
        data: {
          shopId,
          productId,
          type: MovementType.PURCHASE,
          quantity: new Prisma.Decimal(quantity),
          previousStock: new Prisma.Decimal(currentStock),
          newStock: new Prisma.Decimal(newStock),
          reason,
        },
      });

      return { updatedProduct, movement };
    });

    res.status(200).json({
      success: true,
      message: `Successfully added ${quantity} ${product.unit} to stock`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const adjustStock = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shopId = req.user!.shopId;
    const parsed = stockAdjustmentSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ success: false, message: parsed.error.errors[0]?.message });
      return;
    }

    const { productId, quantity, type, isDeduction, reason } = parsed.data;

    const product = await prisma.product.findFirst({
      where: { id: productId, shopId },
    });

    if (!product) {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }

    const currentStock = Number(product.stockQuantity);
    const delta = isDeduction ? -quantity : quantity;
    const newStock = currentStock + delta;

    if (newStock < 0) {
      const shop = await prisma.shop.findUnique({ where: { id: shopId } });
      if (!shop?.allowNegativeStock) {
        res.status(400).json({
          success: false,
          message: `Cannot reduce stock below 0. Current stock: ${currentStock}`,
        });
        return;
      }
    }

    const movementType = type as MovementType;

    const result = await prisma.$transaction(async (tx) => {
      const updatedProduct = await tx.product.update({
        where: { id: productId },
        data: { stockQuantity: new Prisma.Decimal(newStock) },
      });

      const movement = await tx.stockMovement.create({
        data: {
          shopId,
          productId,
          type: movementType,
          quantity: new Prisma.Decimal(quantity),
          previousStock: new Prisma.Decimal(currentStock),
          newStock: new Prisma.Decimal(newStock),
          reason,
        },
      });

      return { updatedProduct, movement };
    });

    res.status(200).json({
      success: true,
      message: `Stock adjusted successfully. New stock: ${newStock} ${product.unit}`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getMovements = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shopId = req.user!.shopId;
    const { productId, type, page = '1', limit = '30' } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const take = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 30));
    const skip = (pageNum - 1) * take;

    const whereClause: Prisma.StockMovementWhereInput = { shopId };

    if (productId && typeof productId === 'string') {
      whereClause.productId = productId;
    }

    if (type && typeof type === 'string' && Object.values(MovementType).includes(type as MovementType)) {
      whereClause.type = type as MovementType;
    }

    const [total, movements] = await Promise.all([
      prisma.stockMovement.count({ where: whereClause }),
      prisma.stockMovement.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          product: {
            select: { id: true, name: true, unit: true, barcode: true },
          },
        },
      }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        movements,
        pagination: {
          total,
          page: pageNum,
          limit: take,
          totalPages: Math.ceil(total / take),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getLowStockAlerts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shopId = req.user!.shopId;

    // Fetch products where stockQuantity <= lowStockThreshold and isActive = true
    const products = await prisma.product.findMany({
      where: {
        shopId,
        isActive: true,
      },
      include: {
        category: { select: { id: true, name: true } },
      },
      orderBy: { stockQuantity: 'asc' },
    });

    const lowStockProducts = products.filter(
      (p) => Number(p.stockQuantity) <= Number(p.lowStockThreshold)
    );

    res.status(200).json({
      success: true,
      count: lowStockProducts.length,
      data: lowStockProducts,
    });
  } catch (error) {
    next(error);
  }
};

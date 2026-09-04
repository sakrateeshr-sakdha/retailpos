import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { MovementType, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';

const productSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  barcode: z.string().nullable().optional(),
  sku: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  purchasePrice: z.coerce.number().min(0, 'Purchase price must be >= 0').default(0),
  sellingPrice: z.coerce.number().min(0, 'Selling price must be >= 0'),
  stockQuantity: z.coerce.number().min(0, 'Stock quantity must be >= 0').default(0),
  unit: z.enum(['pcs', 'kg', 'g', 'litre', 'ml', 'packet', 'box', 'bottle']).default('pcs'),
  lowStockThreshold: z.coerce.number().min(0).default(5),
  isActive: z.boolean().optional().default(true),
});

export const getProducts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shopId = req.user!.shopId;
    const { categoryId, search, lowStock, isActive } = req.query;

    const where: Prisma.ProductWhereInput = {
      shopId,
      ...(isActive !== undefined ? { isActive: isActive === 'true' } : { isActive: true }),
    };

    if (categoryId && typeof categoryId === 'string' && categoryId !== 'all') {
      where.categoryId = categoryId;
    }

    if (search && typeof search === 'string') {
      const q = search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { barcode: { contains: q, mode: 'insensitive' } },
        { sku: { contains: q, mode: 'insensitive' } },
      ];
    }

    const products = await prisma.product.findMany({
      where,
      include: {
        category: {
          select: { id: true, name: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    let filtered = products;
    if (lowStock === 'true') {
      filtered = products.filter(
        (p) => Number(p.stockQuantity) <= Number(p.lowStockThreshold)
      );
    }

    res.json({ success: true, count: filtered.length, products: filtered });
  } catch (error) {
    next(error);
  }
};

export const getProductById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shopId = req.user!.shopId;
    const id = req.params.id as string;

    const product = await prisma.product.findFirst({
      where: { id, shopId },
      include: { category: true },
    });

    if (!product) {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }

    res.json({ success: true, product });
  } catch (error) {
    next(error);
  }
};

export const searchProducts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shopId = req.user!.shopId;
    const query = (req.query.q as string)?.trim() || '';

    if (!query) {
      const products = await prisma.product.findMany({
        where: { shopId, isActive: true },
        take: 30,
        orderBy: { name: 'asc' },
        include: { category: { select: { id: true, name: true } } },
      });
      res.json({ success: true, products });
      return;
    }

    // Exact barcode match priority
    const barcodeMatch = await prisma.product.findFirst({
      where: { shopId, barcode: query, isActive: true },
      include: { category: { select: { id: true, name: true } } },
    });

    const products = await prisma.product.findMany({
      where: {
        shopId,
        isActive: true,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { barcode: { contains: query, mode: 'insensitive' } },
          { sku: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 20,
      orderBy: { name: 'asc' },
      include: { category: { select: { id: true, name: true } } },
    });

    if (barcodeMatch && !products.some((p) => p.id === barcodeMatch.id)) {
      products.unshift(barcodeMatch);
    }

    res.json({ success: true, products });
  } catch (error) {
    next(error);
  }
};

export const createProduct = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shopId = req.user!.shopId;
    const parsed = productSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: parsed.error.errors[0]?.message || 'Invalid product details',
      });
      return;
    }

    const data = parsed.data;

    // Check duplicate barcode if provided
    if (data.barcode) {
      const existingBarcode = await prisma.product.findFirst({
        where: { shopId, barcode: data.barcode.trim() },
      });
      if (existingBarcode) {
        res.status(400).json({
          success: false,
          message: `Product with barcode '${data.barcode}' already exists: ${existingBarcode.name}`,
        });
        return;
      }
    }

    const product = await prisma.$transaction(async (tx) => {
      const newProd = await tx.product.create({
        data: {
          shopId,
          categoryId: data.categoryId || null,
          name: data.name.trim(),
          barcode: data.barcode?.trim() || null,
          sku: data.sku?.trim() || null,
          purchasePrice: new Prisma.Decimal(data.purchasePrice),
          sellingPrice: new Prisma.Decimal(data.sellingPrice),
          stockQuantity: new Prisma.Decimal(data.stockQuantity),
          unit: data.unit,
          lowStockThreshold: new Prisma.Decimal(data.lowStockThreshold),
          isActive: data.isActive,
        },
        include: { category: true },
      });

      if (data.stockQuantity > 0) {
        await tx.stockMovement.create({
          data: {
            shopId,
            productId: newProd.id,
            type: MovementType.PURCHASE,
            quantity: new Prisma.Decimal(data.stockQuantity),
            previousStock: new Prisma.Decimal(0),
            newStock: new Prisma.Decimal(data.stockQuantity),
            reason: 'Initial stock intake on product creation',
          },
        });
      }

      return newProd;
    });

    res.status(201).json({ success: true, message: 'Product created successfully', product });
  } catch (error) {
    next(error);
  }
};

export const updateProduct = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shopId = req.user!.shopId;
    const id = req.params.id as string;
    const parsed = productSchema.partial().safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: parsed.error.errors[0]?.message || 'Invalid product update details',
      });
      return;
    }

    const currentProduct = await prisma.product.findFirst({
      where: { id, shopId },
    });

    if (!currentProduct) {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }

    const data = parsed.data;

    // Check duplicate barcode
    if (data.barcode && data.barcode !== currentProduct.barcode) {
      const existingBarcode = await prisma.product.findFirst({
        where: { shopId, barcode: data.barcode.trim(), NOT: { id } },
      });
      if (existingBarcode) {
        res.status(400).json({
          success: false,
          message: `Another product already uses barcode '${data.barcode}'`,
        });
        return;
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updateData: Prisma.ProductUpdateInput = {
        ...(data.name && { name: data.name.trim() }),
        ...(data.barcode !== undefined && { barcode: data.barcode?.trim() || null }),
        ...(data.sku !== undefined && { sku: data.sku?.trim() || null }),
        ...(data.categoryId !== undefined && {
          category: data.categoryId ? { connect: { id: data.categoryId } } : { disconnect: true },
        }),
        ...(data.purchasePrice !== undefined && { purchasePrice: new Prisma.Decimal(data.purchasePrice) }),
        ...(data.sellingPrice !== undefined && { sellingPrice: new Prisma.Decimal(data.sellingPrice) }),
        ...(data.unit !== undefined && { unit: data.unit }),
        ...(data.lowStockThreshold !== undefined && { lowStockThreshold: new Prisma.Decimal(data.lowStockThreshold) }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      };

      if (data.stockQuantity !== undefined && Number(data.stockQuantity) !== Number(currentProduct.stockQuantity)) {
        const newQty = new Prisma.Decimal(data.stockQuantity);
        const diff = Number(newQty) - Number(currentProduct.stockQuantity);
        updateData.stockQuantity = newQty;

        await tx.stockMovement.create({
          data: {
            shopId,
            productId: id,
            type: diff >= 0 ? MovementType.PURCHASE : MovementType.ADJUSTMENT,
            quantity: new Prisma.Decimal(Math.abs(diff)),
            previousStock: currentProduct.stockQuantity,
            newStock: newQty,
            reason: 'Manual stock edit from product form',
          },
        });
      }

      return tx.product.update({
        where: { id },
        data: updateData,
        include: { category: true },
      });
    });

    res.json({ success: true, message: 'Product updated successfully', product: updated });
  } catch (error) {
    next(error);
  }
};

export const deleteProduct = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shopId = req.user!.shopId;
    const id = req.params.id as string;

    const product = await prisma.product.findFirst({
      where: { id, shopId },
      include: { _count: { select: { saleItems: true } } },
    });

    if (!product) {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }

    if (product._count.saleItems > 0) {
      // Soft-deactivate if product has existing sales
      await prisma.product.update({
        where: { id },
        data: { isActive: false },
      });
      res.json({ success: true, message: 'Product deactivated (preserved for past sales history)' });
      return;
    }

    // Otherwise safe to hard delete
    await prisma.stockMovement.deleteMany({ where: { productId: id } });
    await prisma.product.delete({ where: { id } });

    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    next(error);
  }
};

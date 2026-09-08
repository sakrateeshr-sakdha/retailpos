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
  hsnCode: z.string().nullable().optional(),
  gstRate: z.coerce.number().min(0).max(100).nullable().optional(),
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
          hsnCode: data.hsnCode?.trim() || null,
          gstRate: data.gstRate !== undefined && data.gstRate !== null ? new Prisma.Decimal(data.gstRate) : null,
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
        ...(data.hsnCode !== undefined && { hsnCode: data.hsnCode?.trim() || null }),
        ...(data.gstRate !== undefined && { gstRate: data.gstRate !== null ? new Prisma.Decimal(data.gstRate) : null }),
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

const importItemSchema = z.object({
  productName: z.string().min(1, 'Product name is required'),
  barcode: z.string().nullable().optional().or(z.literal('')),
  sku: z.string().nullable().optional().or(z.literal('')),
  category: z.string().nullable().optional().or(z.literal('')),
  purchasePrice: z.coerce.number().min(0, 'Purchase price must be >= 0').optional().default(0),
  sellingPrice: z.coerce.number().gt(0, 'Selling price must be > 0'),
  stock: z.coerce.number().min(0, 'Stock must be >= 0').optional().default(0),
  unit: z.string().optional().default('pcs'),
  lowStockThreshold: z.coerce.number().min(0).optional().default(5),
  hsnCode: z.string().nullable().optional().or(z.literal('')),
  gstRate: z.coerce.number().min(0).max(100).nullable().optional(),
});

const importPayloadSchema = z.object({
  products: z.array(z.any()).min(1, 'At least one product is required for import'),
  updateExisting: z.boolean().optional().default(false),
  dryRun: z.boolean().optional().default(false),
});

export const importProducts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shopId = req.user!.shopId;
    const parsedPayload = importPayloadSchema.safeParse(req.body);

    if (!parsedPayload.success) {
      res.status(400).json({
        success: false,
        message: parsedPayload.error.errors[0]?.message || 'Invalid import payload',
      });
      return;
    }

    const { products: rawRows, updateExisting, dryRun } = parsedPayload.data;

    // Validate each row and check for duplicates within import payload
    const errors: { row: number; field: string; message: string; data?: any }[] = [];
    const validRows: (z.infer<typeof importItemSchema> & { rowIndex: number })[] = [];
    const seenBarcodes = new Map<string, number>(); // barcode -> rowIndex

    rawRows.forEach((raw, idx) => {
      const rowIndex = idx + 1; // 1-indexed for human readability
      const parsedRow = importItemSchema.safeParse(raw);

      if (!parsedRow.success) {
        parsedRow.error.errors.forEach((err) => {
          errors.push({
            row: rowIndex,
            field: err.path.join('.') || 'general',
            message: `Row ${rowIndex}: ${err.message}`,
            data: raw,
          });
        });
        return;
      }

      const row = parsedRow.data;
      const cleanBarcode = row.barcode ? row.barcode.trim() : null;

      if (cleanBarcode) {
        if (seenBarcodes.has(cleanBarcode)) {
          const prevRow = seenBarcodes.get(cleanBarcode)!;
          errors.push({
            row: rowIndex,
            field: 'barcode',
            message: `Row ${rowIndex}: Duplicate barcode "${cleanBarcode}" (already present in row ${prevRow})`,
            data: raw,
          });
        } else {
          seenBarcodes.set(cleanBarcode, rowIndex);
        }
      }

      validRows.push({ ...row, barcode: cleanBarcode, rowIndex });
    });

    // Check duplicates against existing database products if not updateExisting
    const barcodesToLookup = validRows
      .map((r) => r.barcode)
      .filter((b): b is string => Boolean(b));

    if (barcodesToLookup.length > 0 && !updateExisting) {
      const existingInDb = await prisma.product.findMany({
        where: { shopId, barcode: { in: barcodesToLookup } },
        select: { barcode: true, name: true },
      });
      const dbBarcodeMap = new Map<string, string>(
        existingInDb.map((p) => [p.barcode!, p.name])
      );

      for (const row of validRows) {
        if (row.barcode && dbBarcodeMap.has(row.barcode)) {
          errors.push({
            row: row.rowIndex,
            field: 'barcode',
            message: `Row ${row.rowIndex}: Duplicate barcode "${row.barcode}" already exists in database ("${dbBarcodeMap.get(row.barcode)}")`,
            data: row,
          });
        }
      }
    }

    // If dry run requested or if there are errors, return preview with errors
    if (dryRun || errors.length > 0) {
      res.status(errors.length > 0 ? 400 : 200).json({
        success: errors.length === 0,
        dryRun: Boolean(dryRun),
        summary: {
          total: rawRows.length,
          valid: errors.length === 0 ? validRows.length : 0,
          errorsCount: errors.length,
        },
        errors,
        preview: validRows.slice(0, 10),
      });
      return;
    }

    // Execute atomic transaction for import
    const result = await prisma.$transaction(async (tx) => {
      // 1. Resolve unique categories
      const categoryNames = Array.from(
        new Set(
          validRows
            .map((r) => r.category?.trim())
            .filter((c): c is string => Boolean(c && c.length > 0))
        )
      );

      const existingCategories = await tx.category.findMany({
        where: { shopId, name: { in: categoryNames } },
      });
      const categoryMap = new Map<string, string>(
        existingCategories.map((c) => [c.name.toLowerCase(), c.id])
      );

      for (const catName of categoryNames) {
        const lower = catName.toLowerCase();
        if (!categoryMap.has(lower)) {
          const createdCat = await tx.category.create({
            data: { shopId, name: catName },
          });
          categoryMap.set(lower, createdCat.id);
        }
      }

      // 2. Fetch existing products by barcode in this shop
      const barcodesToLookup = validRows
        .map((r) => r.barcode)
        .filter((b): b is string => Boolean(b));

      const existingProducts = await tx.product.findMany({
        where: { shopId, barcode: { in: barcodesToLookup } },
      });
      const existingProductMap = new Map<string, (typeof existingProducts)[0]>(
        existingProducts.map((p) => [p.barcode!, p])
      );

      let imported = 0;
      let updated = 0;
      let skipped = 0;

      for (const item of validRows) {
        const categoryId = item.category ? categoryMap.get(item.category.trim().toLowerCase()) || null : null;
        const existing = item.barcode ? existingProductMap.get(item.barcode) : null;

        if (existing) {
          if (updateExisting) {
            await tx.product.update({
              where: { id: existing.id },
              data: {
                name: item.productName.trim(),
                sku: item.sku?.trim() || existing.sku,
                categoryId: categoryId || existing.categoryId,
                purchasePrice: new Prisma.Decimal(item.purchasePrice || 0),
                sellingPrice: new Prisma.Decimal(item.sellingPrice),
                stockQuantity: new Prisma.Decimal(item.stock || 0),
                unit: item.unit || existing.unit,
                lowStockThreshold: new Prisma.Decimal(item.lowStockThreshold || 5),
                hsnCode: item.hsnCode?.trim() || existing.hsnCode,
                gstRate: item.gstRate !== undefined && item.gstRate !== null ? new Prisma.Decimal(item.gstRate) : existing.gstRate,
                isActive: true,
              },
            });
            updated++;
          } else {
            skipped++;
          }
        } else {
          // New product
          const newProd = await tx.product.create({
            data: {
              shopId,
              name: item.productName.trim(),
              barcode: item.barcode || null,
              sku: item.sku?.trim() || null,
              categoryId,
              purchasePrice: new Prisma.Decimal(item.purchasePrice || 0),
              sellingPrice: new Prisma.Decimal(item.sellingPrice),
              stockQuantity: new Prisma.Decimal(item.stock || 0),
              unit: item.unit || 'pcs',
              lowStockThreshold: new Prisma.Decimal(item.lowStockThreshold || 5),
              hsnCode: item.hsnCode?.trim() || null,
              gstRate: item.gstRate !== undefined && item.gstRate !== null ? new Prisma.Decimal(item.gstRate) : null,
              isActive: true,
            },
          });

          if (item.stock && item.stock > 0) {
            await tx.stockMovement.create({
              data: {
                shopId,
                productId: newProd.id,
                type: MovementType.PURCHASE,
                quantity: new Prisma.Decimal(item.stock),
                previousStock: new Prisma.Decimal(0),
                newStock: new Prisma.Decimal(item.stock),
                reason: 'Initial stock from bulk import',
              },
            });
          }

          imported++;
        }
      }

      return { imported, updated, skipped, total: validRows.length };
    });

    res.status(200).json({
      success: true,
      message: `Import completed: ${result.imported} imported, ${result.updated} updated, ${result.skipped} skipped.`,
      summary: {
        total: result.total,
        imported: result.imported,
        updated: result.updated,
        skipped: result.skipped,
        errorsCount: 0,
      },
    });
  } catch (error) {
    next(error);
  }
};


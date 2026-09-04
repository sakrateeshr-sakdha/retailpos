import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';

const categorySchema = z.object({
  name: z.string().min(1, 'Category name is required'),
  description: z.string().nullable().optional(),
});

export const getCategories = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shopId = req.user!.shopId;
    const categories = await prisma.category.findMany({
      where: { shopId },
      include: {
        _count: {
          select: { products: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    res.json({ success: true, categories });
  } catch (error) {
    next(error);
  }
};

export const createCategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shopId = req.user!.shopId;
    const parsed = categorySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: parsed.error.errors[0]?.message });
      return;
    }

    const { name, description } = parsed.data;
    const existing = await prisma.category.findFirst({
      where: { shopId, name: { equals: name.trim(), mode: 'insensitive' } },
    });

    if (existing) {
      res.status(400).json({ success: false, message: 'A category with this name already exists' });
      return;
    }

    const category = await prisma.category.create({
      data: {
        shopId,
        name: name.trim(),
        description: description?.trim() || null,
      },
    });

    res.status(201).json({ success: true, message: 'Category created', category });
  } catch (error) {
    next(error);
  }
};

export const updateCategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shopId = req.user!.shopId;
    const id = req.params.id as string;
    const parsed = categorySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: parsed.error.errors[0]?.message });
      return;
    }

    const category = await prisma.category.update({
      where: { id, shopId },
      data: {
        name: parsed.data.name.trim(),
        description: parsed.data.description?.trim() || null,
      },
    });

    res.json({ success: true, message: 'Category updated', category });
  } catch (error) {
    next(error);
  }
};

export const deleteCategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shopId = req.user!.shopId;
    const id = req.params.id as string;

    // Check if products exist in category
    const productCount = await prisma.product.count({
      where: { shopId, categoryId: id },
    });

    if (productCount > 0) {
      res.status(400).json({
        success: false,
        message: `Cannot delete category. It contains ${productCount} products. Move or delete them first.`,
      });
      return;
    }

    await prisma.category.delete({
      where: { id, shopId },
    });

    res.json({ success: true, message: 'Category deleted' });
  } catch (error) {
    next(error);
  }
};

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';

const updateShopSchema = z.object({
  name: z.string().min(1).optional(),
  address: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  gstNumber: z.string().nullable().optional(),
  invoicePrefix: z.string().min(1).optional(),
  currency: z.string().min(1).optional(),
  upiId: z.string().nullable().optional(),
  receiptFooter: z.string().nullable().optional(),
  allowNegativeStock: z.boolean().optional(),
});

export const getShop = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shopId = req.user?.shopId;
    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
    });

    if (!shop) {
      res.status(404).json({ success: false, message: 'Shop not found' });
      return;
    }

    res.json({ success: true, shop });
  } catch (error) {
    next(error);
  }
};

export const updateShop = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shopId = req.user?.shopId;
    const parsed = updateShopSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: parsed.error.errors[0]?.message || 'Invalid data' });
      return;
    }

    const updated = await prisma.shop.update({
      where: { id: shopId },
      data: parsed.data,
    });

    res.json({ success: true, message: 'Shop settings updated successfully', shop: updated });
  } catch (error) {
    next(error);
  }
};

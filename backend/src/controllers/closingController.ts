import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PaymentMethod, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';

const closeDaySchema = z.object({
  actualCash: z.coerce.number().min(0, 'Actual cash must be >= 0'),
  notes: z.string().max(500).optional().nullable(),
  closingDate: z.string().datetime().optional(),
});

// GET /api/closing/summary
export const getClosingSummary = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shopId = req.user!.shopId;
    const dateParam = req.query.date as string;

    const targetDate = dateParam ? new Date(dateParam) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Fetch all completed sales for today
    const sales = await prisma.sale.findMany({
      where: {
        shopId,
        status: 'COMPLETED',
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      include: {
        payments: true,
      },
    });

    let grossSales = 0;
    let discounts = 0;
    let netSales = 0;
    let cashSales = 0;
    let upiSales = 0;
    let cardSales = 0;
    let creditSales = 0;

    for (const sale of sales) {
      grossSales += Number(sale.subtotal);
      discounts += Number(sale.discount);
      netSales += Number(sale.total);

      if (sale.paymentMethod === PaymentMethod.CREDIT) {
        creditSales += Number(sale.total);
      }

      if (Array.isArray(sale.payments) && sale.payments.length > 0) {
        for (const payment of sale.payments) {
          const amt = Number(payment.amount);
          if (payment.method === PaymentMethod.CASH) {
            cashSales += amt;
          } else if (payment.method === PaymentMethod.UPI) {
            upiSales += amt;
          } else if (payment.method === PaymentMethod.CARD) {
            cardSales += amt;
          }
        }
      } else {
        // Fallback to top-level paymentMethod
        const amt = Number(sale.total);
        if (sale.paymentMethod === PaymentMethod.CASH) {
          cashSales += amt;
        } else if (sale.paymentMethod === PaymentMethod.UPI) {
          upiSales += amt;
        } else if (sale.paymentMethod === PaymentMethod.CARD) {
          cardSales += amt;
        }
      }
    }

    const expectedCash = cashSales;

    // Check if day is already closed
    const existingClosing = await prisma.dailyClosing.findFirst({
      where: {
        shopId,
        closingDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      include: {
        user: { select: { id: true, name: true, username: true } },
      },
      orderBy: { closedAt: 'desc' },
    });

    res.json({
      success: true,
      summary: {
        date: startOfDay.toISOString(),
        totalBills: sales.length,
        grossSales: Math.round(grossSales * 100) / 100,
        discounts: Math.round(discounts * 100) / 100,
        netSales: Math.round(netSales * 100) / 100,
        cashSales: Math.round(cashSales * 100) / 100,
        upiSales: Math.round(upiSales * 100) / 100,
        cardSales: Math.round(cardSales * 100) / 100,
        creditSales: Math.round(creditSales * 100) / 100,
        expectedCash: Math.round(expectedCash * 100) / 100,
        isClosed: Boolean(existingClosing),
        closingRecord: existingClosing || null,
      },
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/closing
export const closeDay = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shopId = req.user!.shopId;
    const userId = req.user!.id;

    const parsed = closeDaySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: parsed.error.errors[0]?.message || 'Invalid closing data',
      });
      return;
    }

    const { actualCash, notes, closingDate } = parsed.data;

    const targetDate = closingDate ? new Date(closingDate) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Compute metrics for the closing period
    const sales = await prisma.sale.findMany({
      where: {
        shopId,
        status: 'COMPLETED',
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      include: { payments: true },
    });

    let grossSales = 0;
    let discounts = 0;
    let netSales = 0;
    let cashSales = 0;
    let upiSales = 0;
    let cardSales = 0;
    let creditSales = 0;

    for (const sale of sales) {
      grossSales += Number(sale.subtotal);
      discounts += Number(sale.discount);
      netSales += Number(sale.total);

      if (sale.paymentMethod === PaymentMethod.CREDIT) {
        creditSales += Number(sale.total);
      }

      if (Array.isArray(sale.payments) && sale.payments.length > 0) {
        for (const payment of sale.payments) {
          const amt = Number(payment.amount);
          if (payment.method === PaymentMethod.CASH) {
            cashSales += amt;
          } else if (payment.method === PaymentMethod.UPI) {
            upiSales += amt;
          } else if (payment.method === PaymentMethod.CARD) {
            cardSales += amt;
          }
        }
      } else {
        const amt = Number(sale.total);
        if (sale.paymentMethod === PaymentMethod.CASH) {
          cashSales += amt;
        } else if (sale.paymentMethod === PaymentMethod.UPI) {
          upiSales += amt;
        } else if (sale.paymentMethod === PaymentMethod.CARD) {
          cardSales += amt;
        }
      }
    }

    const expectedCash = cashSales;
    const cashDifference = actualCash - expectedCash;

    const closingRecord = await prisma.dailyClosing.create({
      data: {
        shopId,
        userId,
        closingDate: startOfDay,
        totalBills: sales.length,
        grossSales: new Prisma.Decimal(grossSales),
        discounts: new Prisma.Decimal(discounts),
        netSales: new Prisma.Decimal(netSales),
        cashSales: new Prisma.Decimal(cashSales),
        upiSales: new Prisma.Decimal(upiSales),
        cardSales: new Prisma.Decimal(cardSales),
        creditSales: new Prisma.Decimal(creditSales),
        expectedCash: new Prisma.Decimal(expectedCash),
        actualCash: new Prisma.Decimal(actualCash),
        cashDifference: new Prisma.Decimal(cashDifference),
        notes: notes?.trim() || null,
      },
      include: {
        user: { select: { id: true, name: true, username: true } },
      },
    });

    res.status(201).json({
      success: true,
      message: 'Day successfully closed and recorded',
      closing: closingRecord,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/closing/history
export const getClosingHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shopId = req.user!.shopId;
    const limit = Math.min(parseInt(req.query.limit as string) || 30, 100);

    const closings = await prisma.dailyClosing.findMany({
      where: { shopId },
      orderBy: { closingDate: 'desc' },
      take: limit,
      include: {
        user: { select: { id: true, name: true, username: true } },
      },
    });

    res.json({
      success: true,
      closings,
    });
  } catch (error) {
    next(error);
  }
};

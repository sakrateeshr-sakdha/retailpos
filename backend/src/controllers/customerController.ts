import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PaymentMethod, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';

const createCustomerSchema = z.object({
  name: z.string().min(1, 'Customer name is required').max(100),
  phone: z.string().max(20).optional().nullable().or(z.literal('')),
  email: z.string().email('Invalid email').max(100).optional().nullable().or(z.literal('')),
  address: z.string().max(255).optional().nullable().or(z.literal('')),
  openingBalance: z.coerce.number().min(0).optional().default(0),
});

const updateCustomerSchema = z.object({
  name: z.string().min(1, 'Customer name is required').max(100).optional(),
  phone: z.string().max(20).optional().nullable().or(z.literal('')),
  email: z.string().email('Invalid email').max(100).optional().nullable().or(z.literal('')),
  address: z.string().max(255).optional().nullable().or(z.literal('')),
});

const recordPaymentSchema = z.object({
  amount: z.coerce.number().positive('Payment amount must be greater than 0'),
  paymentMethod: z.nativeEnum(PaymentMethod).default(PaymentMethod.CASH),
  notes: z.string().max(255).optional().nullable().or(z.literal('')),
});

// GET /api/customers - List customers with search & filter
export const getCustomers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shopId = req.user!.shopId;
    const search = (req.query.search as string)?.trim();
    const hasBalance = req.query.hasBalance === 'true';

    const whereClause: Prisma.CustomerWhereInput = {
      shopId,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search } },
            ],
          }
        : {}),
      ...(hasBalance
        ? {
            totalCredit: { gt: 0 },
          }
        : {}),
    };

    const customers = await prisma.customer.findMany({
      where: whereClause,
      include: {
        _count: {
          select: {
            sales: true,
            payments: true,
          },
        },
      },
      orderBy: [
        { totalCredit: 'desc' },
        { updatedAt: 'desc' },
      ],
    });

    // Calculate aggregated statistics
    const stats = await prisma.customer.aggregate({
      where: { shopId },
      _sum: { totalCredit: true },
      _count: { id: true },
    });

    const activeCreditCount = await prisma.customer.count({
      where: { shopId, totalCredit: { gt: 0 } },
    });

    res.json({
      success: true,
      customers,
      summary: {
        totalOutstandingCredit: Number(stats._sum.totalCredit || 0),
        totalCustomers: stats._count.id,
        customersWithBalance: activeCreditCount,
      },
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/customers/:id - Customer details with transaction ledger
export const getCustomerById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shopId = req.user!.shopId;
    const id = req.params.id as string;

    const customer = await prisma.customer.findFirst({
      where: { id, shopId },
      include: {
        sales: {
          take: 30,
          orderBy: { createdAt: 'desc' },
          include: {
            items: true,
          },
        },
        payments: {
          take: 30,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!customer) {
      res.status(404).json({ success: false, message: 'Customer not found' });
      return;
    }

    res.json({ success: true, customer });
  } catch (error) {
    next(error);
  }
};

// POST /api/customers - Create new customer
export const createCustomer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shopId = req.user!.shopId;
    const parsed = createCustomerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: parsed.error.errors[0]?.message || 'Invalid customer data',
      });
      return;
    }

    const { name, phone, email, address, openingBalance } = parsed.data;

    const customer = await prisma.customer.create({
      data: {
        shopId,
        name: name.trim(),
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        address: address?.trim() || null,
        totalCredit: new Prisma.Decimal(openingBalance || 0),
      },
    });

    res.status(201).json({
      success: true,
      message: 'Customer created successfully',
      customer,
    });
  } catch (error) {
    next(error);
  }
};

// PUT /api/customers/:id - Update customer profile
export const updateCustomer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shopId = req.user!.shopId;
    const id = req.params.id as string;

    const parsed = updateCustomerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: parsed.error.errors[0]?.message || 'Invalid input data',
      });
      return;
    }

    const existing = await prisma.customer.findFirst({
      where: { id, shopId },
    });

    if (!existing) {
      res.status(404).json({ success: false, message: 'Customer not found' });
      return;
    }

    const updated = await prisma.customer.update({
      where: { id },
      data: {
        ...(parsed.data.name && { name: parsed.data.name.trim() }),
        phone: parsed.data.phone !== undefined ? (parsed.data.phone?.trim() || null) : existing.phone,
        email: parsed.data.email !== undefined ? (parsed.data.email?.trim() || null) : existing.email,
        address: parsed.data.address !== undefined ? (parsed.data.address?.trim() || null) : existing.address,
      },
    });

    res.json({
      success: true,
      message: 'Customer updated successfully',
      customer: updated,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/customers/:id/payments - Record customer balance payment
export const recordCustomerPayment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shopId = req.user!.shopId;
    const id = req.params.id as string;

    const parsed = recordPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: parsed.error.errors[0]?.message || 'Invalid payment data',
      });
      return;
    }

    const { amount, paymentMethod, notes } = parsed.data;

    const customer = await prisma.customer.findFirst({
      where: { id, shopId },
    });

    if (!customer) {
      res.status(404).json({ success: false, message: 'Customer not found' });
      return;
    }

    // Process payment and update outstanding balance atomically
    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.customerPayment.create({
        data: {
          customerId: id,
          amount: new Prisma.Decimal(amount),
          paymentMethod,
          notes: notes?.trim() || null,
        },
      });

      const updatedCustomer = await tx.customer.update({
        where: { id },
        data: {
          totalCredit: {
            decrement: new Prisma.Decimal(amount),
          },
        },
      });

      return { payment, customer: updatedCustomer };
    });

    res.status(201).json({
      success: true,
      message: `Payment of ${amount} recorded successfully`,
      payment: result.payment,
      customer: result.customer,
    });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/customers/:id - Delete customer
export const deleteCustomer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shopId = req.user!.shopId;
    const id = req.params.id as string;

    const customer = await prisma.customer.findFirst({
      where: { id, shopId },
      include: {
        _count: {
          select: { sales: true, payments: true },
        },
      },
    });

    if (!customer) {
      res.status(404).json({ success: false, message: 'Customer not found' });
      return;
    }

    if (Number(customer.totalCredit) !== 0) {
      res.status(400).json({
        success: false,
        message: 'Cannot delete customer with non-zero balance. Settle outstanding balance first.',
      });
      return;
    }

    await prisma.customer.delete({
      where: { id },
    });

    res.json({
      success: true,
      message: 'Customer deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

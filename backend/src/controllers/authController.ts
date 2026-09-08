import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';

const JWT_SECRET = process.env.JWT_SECRET || 'retailpos-super-secure-jwt-secret-key-grocery-2026';

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

const onboardSchema = z.object({
  ownerName: z.string().min(1, 'Owner name is required').max(100),
  username: z.string().min(3, 'Username must be at least 3 characters').max(50),
  password: z.string().min(4, 'Password must be at least 4 characters'),
  shopName: z.string().min(1, 'Shop name is required').max(100),
  phone: z.string().max(20).optional().or(z.literal('')),
  address: z.string().max(255).optional().or(z.literal('')),
  gstNumber: z.string().max(50).optional().or(z.literal('')),
  upiId: z.string().max(100).optional().or(z.literal('')),
  currency: z.string().max(10).optional().default('₹'),
  invoicePrefix: z.string().max(10).optional().default('INV-'),
  receiptFooter: z.string().max(255).optional().default('Thank You! Visit Again 😊'),
  seedStarterCatalog: z.boolean().optional().default(true),
});

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        message: parseResult.error.errors[0]?.message || 'Invalid input data',
      });
      return;
    }

    const { username, password } = parseResult.data;

    const user = await prisma.user.findUnique({
      where: { username: username.toLowerCase().trim() },
      include: { shop: true },
    });

    if (!user || !user.active) {
      res.status(401).json({ success: false, message: 'Invalid username or password' });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({ success: false, message: 'Invalid username or password' });
      return;
    }

    const tokenPayload = {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      shopId: user.shopId,
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        shopId: user.shopId,
      },
      shop: user.shop,
    });
  } catch (error) {
    next(error);
  }
};

export const getMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { shop: true },
    });

    if (!user || !user.active) {
      res.status(401).json({ success: false, message: 'User account not found or disabled' });
      return;
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        shopId: user.shopId,
      },
      shop: user.shop,
    });
  } catch (error) {
    next(error);
  }
};

const cashierSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  username: z.string().min(3, 'Username must be at least 3 characters'),
  password: z.string().min(4, 'Password must be at least 4 characters'),
});

export const createCashier = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shopId = req.user!.shopId;
    const parsed = cashierSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: parsed.error.errors[0]?.message });
      return;
    }

    const { name, username, password } = parsed.data;
    const normalizedUsername = username.toLowerCase().trim();

    const existing = await prisma.user.findUnique({
      where: { username: normalizedUsername },
    });

    if (existing) {
      res.status(400).json({ success: false, message: 'Username is already taken' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const cashier = await prisma.user.create({
      data: {
        shopId,
        name: name.trim(),
        username: normalizedUsername,
        passwordHash,
        role: 'CASHIER',
        active: true,
      },
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
        active: true,
        createdAt: true,
      },
    });

    res.status(201).json({ success: true, message: 'Cashier account created', user: cashier });
  } catch (error) {
    next(error);
  }
};

export const onboardMerchant = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parseResult = onboardSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        message: parseResult.error.errors[0]?.message || 'Invalid input data',
      });
      return;
    }

    const {
      ownerName,
      username,
      password,
      shopName,
      phone,
      address,
      gstNumber,
      upiId,
      currency,
      invoicePrefix,
      receiptFooter,
      seedStarterCatalog,
    } = parseResult.data;

    const normalizedUsername = username.toLowerCase().trim();

    // Check if username is already taken
    const existingUser = await prisma.user.findUnique({
      where: { username: normalizedUsername },
    });

    if (existingUser) {
      res.status(400).json({
        success: false,
        message: 'Username is already taken. Please choose another username.',
      });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Create Shop, Admin User, and optional Starter Catalog in an atomic transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create Shop
      const shop = await tx.shop.create({
        data: {
          name: shopName.trim(),
          phone: phone?.trim() || null,
          address: address?.trim() || null,
          gstNumber: gstNumber?.trim() || null,
          upiId: upiId?.trim() || null,
          currency: currency || '₹',
          invoicePrefix: invoicePrefix || 'INV-',
          receiptFooter: receiptFooter || 'Thank You! Visit Again 😊',
        },
      });

      // 1.1 Initialize Shop Invoice Sequence
      await tx.shopInvoiceSequence.create({
        data: {
          shopId: shop.id,
          nextInvoiceNumber: 1001,
        },
      });

      // 2. Create Owner User
      const user = await tx.user.create({
        data: {
          shopId: shop.id,
          name: ownerName.trim(),
          username: normalizedUsername,
          passwordHash,
          role: 'ADMIN',
          active: true,
        },
      });

      // 3. Optionally seed Starter Catalog
      if (seedStarterCatalog) {
        const starterCategories = [
          { name: 'Dairy & Eggs', description: 'Milk, butter, paneer, eggs' },
          { name: 'Staples & Grains', description: 'Rice, wheat flour, pulses, spices, sugar' },
          { name: 'Beverages', description: 'Tea, coffee, juices, soft drinks' },
          { name: 'Snacks & Bakery', description: 'Biscuits, bread, rusks, chips' },
          { name: 'Fruits & Vegetables', description: 'Fresh fruits and seasonal vegetables' },
          { name: 'Personal & Home Care', description: 'Soaps, detergents, cleaners' },
        ];

        const createdCategories: Record<string, string> = {};
        for (const cat of starterCategories) {
          const c = await tx.category.create({
            data: {
              shopId: shop.id,
              name: cat.name,
              description: cat.description,
            },
          });
          createdCategories[cat.name] = c.id;
        }

        const starterProducts = [
          { name: 'Milk 1L', barcode: '890100000001', sku: 'DRY-MLK-1L', cat: 'Dairy & Eggs', purchasePrice: 28, sellingPrice: 32, qty: 25, unit: 'litre' },
          { name: 'Sugar 1kg', barcode: '890100000002', sku: 'STP-SGR-1K', cat: 'Staples & Grains', purchasePrice: 40, sellingPrice: 46, qty: 30, unit: 'kg' },
          { name: 'Rice 1kg', barcode: '890100000003', sku: 'STP-RCE-1K', cat: 'Staples & Grains', purchasePrice: 50, sellingPrice: 58, qty: 40, unit: 'kg' },
          { name: 'Wheat Flour 1kg', barcode: '890100000004', sku: 'STP-WHT-1K', cat: 'Staples & Grains', purchasePrice: 42, sellingPrice: 48, qty: 25, unit: 'kg' },
          { name: 'Tea Powder 250g', barcode: '890100000005', sku: 'BEV-TEA-250', cat: 'Beverages', purchasePrice: 90, sellingPrice: 115, qty: 15, unit: 'packet' },
          { name: 'Eggs (Pack of 6)', barcode: '890100000006', sku: 'DRY-EGG-6P', cat: 'Dairy & Eggs', purchasePrice: 36, sellingPrice: 42, qty: 20, unit: 'packet' },
          { name: 'Bread 400g', barcode: '890100000007', sku: 'SNK-BRD-400', cat: 'Snacks & Bakery', purchasePrice: 32, sellingPrice: 40, qty: 15, unit: 'packet' },
          { name: 'Potato 1kg', barcode: '890100000008', sku: 'VEG-POT-1K', cat: 'Fruits & Vegetables', purchasePrice: 25, sellingPrice: 35, qty: 30, unit: 'kg' },
          { name: 'Onion 1kg', barcode: '890100000009', sku: 'VEG-ONI-1K', cat: 'Fruits & Vegetables', purchasePrice: 30, sellingPrice: 40, qty: 30, unit: 'kg' },
        ];

        for (const p of starterProducts) {
          const categoryId = createdCategories[p.cat] || null;
          const product = await tx.product.create({
            data: {
              shopId: shop.id,
              categoryId,
              name: p.name,
              barcode: p.barcode,
              sku: p.sku,
              purchasePrice: p.purchasePrice,
              sellingPrice: p.sellingPrice,
              stockQuantity: p.qty,
              unit: p.unit,
              lowStockThreshold: 5,
            },
          });

          await tx.stockMovement.create({
            data: {
              shopId: shop.id,
              productId: product.id,
              type: 'PURCHASE',
              quantity: p.qty,
              previousStock: 0,
              newStock: p.qty,
              reason: 'Starter stock setup during store onboarding',
            },
          });
        }
      }

      return { shop, user };
    });

    const tokenPayload = {
      id: result.user.id,
      username: result.user.username,
      name: result.user.name,
      role: result.user.role,
      shopId: result.user.shopId,
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      success: true,
      message: 'Store onboarded successfully! Welcome to Retail POS.',
      token,
      user: {
        id: result.user.id,
        username: result.user.username,
        name: result.user.name,
        role: result.user.role,
        shopId: result.user.shopId,
      },
      shop: result.shop,
    });
  } catch (error) {
    next(error);
  }
};

export const getCashiers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shopId = req.user!.shopId;
    const users = await prisma.user.findMany({
      where: { shopId },
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
        active: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ success: true, users });
  } catch (error) {
    next(error);
  }
};

export const verifyAdminPin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shopId = req.user!.shopId;
    const { pin } = req.body;

    if (!pin || typeof pin !== 'string') {
      res.status(400).json({ success: false, message: 'Admin PIN is required' });
      return;
    }

    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
      select: { id: true, adminPin: true },
    });

    if (!shop) {
      res.status(404).json({ success: false, message: 'Shop not found' });
      return;
    }

    const expectedPin = shop.adminPin || '1234';
    if (pin.trim() !== expectedPin.trim()) {
      res.status(401).json({ success: false, message: 'Incorrect Admin PIN. Access denied.' });
      return;
    }

    // Generate short-lived delegated token (valid for 5 minutes)
    const adminAuthToken = jwt.sign(
      {
        type: 'ADMIN_DELEGATED',
        shopId,
        userId: req.user!.id,
        createdAt: Date.now(),
      },
      JWT_SECRET,
      { expiresIn: '5m' }
    );

    res.json({
      success: true,
      message: 'Admin authorization granted',
      adminAuthToken,
    });
  } catch (error) {
    next(error);
  }
};





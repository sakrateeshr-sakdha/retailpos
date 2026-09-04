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


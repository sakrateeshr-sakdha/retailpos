import { PrismaClient, Role, MovementType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Retail POS database...');

  // 1. Create or upsert Shop
  const shop = await prisma.shop.upsert({
    where: { id: 'default-shop-001' },
    update: {},
    create: {
      id: 'default-shop-001',
      name: 'My Grocery Shop',
      address: 'Main Road, Kerala',
      phone: '+91 9876543210',
      gstNumber: '32AAAAA0000A1Z5',
      invoicePrefix: 'INV-',
      currency: '₹',
      receiptFooter: 'Thank You! Visit Again 😊',
      allowNegativeStock: false,
    },
  });

  // 2. Create Users (Admin and Cashier)
  const passwordAdmin = await bcrypt.hash('admin123', 10);
  const passwordCashier = await bcrypt.hash('cashier123', 10);

  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      shopId: shop.id,
      username: 'admin',
      name: 'Shop Owner (Admin)',
      passwordHash: passwordAdmin,
      role: Role.ADMIN,
    },
  });

  const cashier = await prisma.user.upsert({
    where: { username: 'cashier' },
    update: {},
    create: {
      shopId: shop.id,
      username: 'cashier',
      name: 'Cashier Staff',
      passwordHash: passwordCashier,
      role: Role.CASHIER,
    },
  });

  console.log('Users created:', admin.username, cashier.username);

  // 3. Create Categories
  const categoriesData = [
    { name: 'Dairy & Eggs', description: 'Fresh milk, butter, curd, eggs' },
    { name: 'Staples & Grains', description: 'Rice, wheat flour, pulses, sugar, salt' },
    { name: 'Beverages', description: 'Tea powder, coffee, juices' },
    { name: 'Bakery & Snacks', description: 'Bread, biscuits, rusks, chips' },
    { name: 'Oils & Masalas', description: 'Cooking oil, spices, ghee' },
    { name: 'Personal Care & Cleaning', description: 'Soaps, shampoos, detergents, toothpaste' },
  ];

  const categories: Record<string, string> = {};
  for (const cat of categoriesData) {
    const created = await prisma.category.upsert({
      where: {
        shopId_name: {
          shopId: shop.id,
          name: cat.name,
        },
      },
      update: {},
      create: {
        shopId: shop.id,
        name: cat.name,
        description: cat.description,
      },
    });
    categories[cat.name] = created.id;
  }

  // 4. Create Products
  const productsData = [
    {
      name: 'Milk 1L',
      barcode: '890123400001',
      sku: 'DRY-MLK-1L',
      category: 'Dairy & Eggs',
      purchasePrice: 28,
      sellingPrice: 32,
      stockQuantity: 25,
      unit: 'litre',
      lowStockThreshold: 5,
    },
    {
      name: 'Milk 500ml',
      barcode: '890123400002',
      sku: 'DRY-MLK-500',
      category: 'Dairy & Eggs',
      purchasePrice: 15,
      sellingPrice: 18,
      stockQuantity: 30,
      unit: 'ml',
      lowStockThreshold: 8,
    },
    {
      name: 'Sugar 1kg',
      barcode: '890123400003',
      sku: 'STP-SGR-1K',
      category: 'Staples & Grains',
      purchasePrice: 42,
      sellingPrice: 48,
      stockQuantity: 40,
      unit: 'kg',
      lowStockThreshold: 10,
    },
    {
      name: 'Rice 5kg',
      barcode: '890123400004',
      sku: 'STP-RCE-5K',
      category: 'Staples & Grains',
      purchasePrice: 250,
      sellingPrice: 280,
      stockQuantity: 20,
      unit: 'kg',
      lowStockThreshold: 4,
    },
    {
      name: 'Rice 1kg',
      barcode: '890123400005',
      sku: 'STP-RCE-1K',
      category: 'Staples & Grains',
      purchasePrice: 52,
      sellingPrice: 60,
      stockQuantity: 50,
      unit: 'kg',
      lowStockThreshold: 10,
    },
    {
      name: 'Wheat Flour 1kg',
      barcode: '890123400006',
      sku: 'STP-WHT-1K',
      category: 'Staples & Grains',
      purchasePrice: 40,
      sellingPrice: 48,
      stockQuantity: 35,
      unit: 'kg',
      lowStockThreshold: 8,
    },
    {
      name: 'Tea Powder 250g',
      barcode: '890123400007',
      sku: 'BEV-TEA-250',
      category: 'Beverages',
      purchasePrice: 95,
      sellingPrice: 120,
      stockQuantity: 15,
      unit: 'packet',
      lowStockThreshold: 4,
    },
    {
      name: 'Coffee 200g',
      barcode: '890123400008',
      sku: 'BEV-COF-200',
      category: 'Beverages',
      purchasePrice: 140,
      sellingPrice: 175,
      stockQuantity: 12,
      unit: 'bottle',
      lowStockThreshold: 3,
    },
    {
      name: 'Biscuits (Marie 200g)',
      barcode: '890123400009',
      sku: 'SNK-BIS-200',
      category: 'Bakery & Snacks',
      purchasePrice: 25,
      sellingPrice: 30,
      stockQuantity: 45,
      unit: 'packet',
      lowStockThreshold: 10,
    },
    {
      name: 'Bread (White 400g)',
      barcode: '890123400010',
      sku: 'BAK-BRD-400',
      category: 'Bakery & Snacks',
      purchasePrice: 32,
      sellingPrice: 40,
      stockQuantity: 18,
      unit: 'packet',
      lowStockThreshold: 5,
    },
    {
      name: 'Eggs (Pack of 6)',
      barcode: '890123400011',
      sku: 'DRY-EGG-6P',
      category: 'Dairy & Eggs',
      purchasePrice: 36,
      sellingPrice: 42,
      stockQuantity: 22,
      unit: 'box',
      lowStockThreshold: 6,
    },
    {
      name: 'Cooking Oil 1L (Sunflower)',
      barcode: '890123400012',
      sku: 'OIL-SNF-1L',
      category: 'Oils & Masalas',
      purchasePrice: 125,
      sellingPrice: 145,
      stockQuantity: 28,
      unit: 'bottle',
      lowStockThreshold: 6,
    },
    {
      name: 'Salt 1kg',
      barcode: '890123400013',
      sku: 'STP-SLT-1K',
      category: 'Staples & Grains',
      purchasePrice: 18,
      sellingPrice: 24,
      stockQuantity: 60,
      unit: 'packet',
      lowStockThreshold: 15,
    },
    {
      name: 'Toothpaste (150g)',
      barcode: '890123400014',
      sku: 'PC-TP-150',
      category: 'Personal Care & Cleaning',
      purchasePrice: 75,
      sellingPrice: 95,
      stockQuantity: 24,
      unit: 'pcs',
      lowStockThreshold: 5,
    },
    {
      name: 'Bath Soap (100g)',
      barcode: '890123400015',
      sku: 'PC-SOP-100',
      category: 'Personal Care & Cleaning',
      purchasePrice: 30,
      sellingPrice: 38,
      stockQuantity: 3, // Low stock on purpose for testing alerts!
      unit: 'pcs',
      lowStockThreshold: 5,
    },
    {
      name: 'Shampoo (180ml)',
      barcode: '890123400016',
      sku: 'PC-SMP-180',
      category: 'Personal Care & Cleaning',
      purchasePrice: 110,
      sellingPrice: 140,
      stockQuantity: 0, // Out of stock on purpose for testing!
      unit: 'bottle',
      lowStockThreshold: 3,
    },
    {
      name: 'Lip Balm (4.5g)',
      barcode: '890123400017',
      sku: 'PC-LIP-4.5G',
      category: 'Personal Care & Cleaning',
      purchasePrice: 25,
      sellingPrice: 35,
      stockQuantity: 40,
      unit: 'pcs',
      lowStockThreshold: 10,
    },
    {
      name: 'Vicks VapoRub (25g)',
      barcode: '890103000025',
      sku: 'PC-VK-25G',
      category: 'Personal Care & Cleaning',
      purchasePrice: 48,
      sellingPrice: 60,
      stockQuantity: 30,
      unit: 'pcs',
      lowStockThreshold: 5,
    },
  ];

  for (const p of productsData) {
    const existing = await prisma.product.findFirst({
      where: { shopId: shop.id, name: p.name },
    });

    if (!existing) {
      const prod = await prisma.product.create({
        data: {
          shopId: shop.id,
          categoryId: categories[p.category],
          name: p.name,
          barcode: p.barcode,
          sku: p.sku,
          purchasePrice: p.purchasePrice,
          sellingPrice: p.sellingPrice,
          stockQuantity: p.stockQuantity,
          unit: p.unit,
          lowStockThreshold: p.lowStockThreshold,
        },
      });

      // Add initial stock movement
      if (p.stockQuantity > 0) {
        await prisma.stockMovement.create({
          data: {
            shopId: shop.id,
            productId: prod.id,
            type: MovementType.PURCHASE,
            quantity: p.stockQuantity,
            previousStock: 0,
            newStock: p.stockQuantity,
            reason: 'Initial stock intake',
          },
        });
      }
    }
  }

  // 5. Create Sample Customers
  const customersData = [
    { name: 'Ramesh Kumar', phone: '9845112233', totalCredit: 1250 },
    { name: 'Suresh Babu', phone: '9845223344', totalCredit: 450 },
    { name: 'Priya Nair', phone: '9845334455', totalCredit: 0 },
  ];

  for (const cust of customersData) {
    const existing = await prisma.customer.findFirst({
      where: { shopId: shop.id, phone: cust.phone },
    });
    if (!existing) {
      await prisma.customer.create({
        data: {
          shopId: shop.id,
          name: cust.name,
          phone: cust.phone,
          totalCredit: cust.totalCredit,
        },
      });
    }
  }

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

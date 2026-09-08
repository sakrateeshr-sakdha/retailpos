import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import { Product, CartItem } from '../types/index';
import { useAuth } from '../auth/AuthContext';

interface CartContextType {
  items: CartItem[];
  subtotal: number;
  discount: number;
  total: number;
  itemCount: number;
  addToCart: (product: Product, quantity?: number) => { success: boolean; message?: string };
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, newQty: number) => { success: boolean; message?: string };
  setDiscount: (discount: number) => void;
  clearCart: () => void;
  scanBarcode: (barcode: string, lookupFn: (b: string) => Promise<Product | null>) => Promise<{ success: boolean; product?: Product; message?: string }>;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { shop } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [discount, setDiscountAmount] = useState<number>(0);

  // 400ms duplicate scan debounce protection
  const lastScanRef = useRef<{ barcode: string; time: number }>({ barcode: '', time: 0 });

  const allowNegative = Boolean(shop?.allowNegativeStock);

  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const total = Math.max(0, Math.round((subtotal - discount) * 100) / 100);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  const addToCart = useCallback(
    (product: Product, quantity = 1): { success: boolean; message?: string } => {
      let result: { success: boolean; message?: string } = { success: true };

      setItems((prev) => {
        const existingIdx = prev.findIndex((i) => i.product.id === product.id);

        if (existingIdx >= 0) {
          const current = prev[existingIdx];
          const newQty = current.quantity + quantity;

          if (!allowNegative && newQty > product.stockQuantity) {
            result = {
              success: false,
              message: `Cannot add more. Available stock: ${product.stockQuantity} ${product.unit}`,
            };
            return prev;
          }

          const updated = [...prev];
          updated[existingIdx] = {
            ...current,
            quantity: newQty,
            lineTotal: Math.round(newQty * current.unitPrice * 100) / 100,
          };
          return updated;
        }

        // Add new line item
        if (!allowNegative && quantity > product.stockQuantity) {
          result = {
            success: false,
            message: `Only ${product.stockQuantity} ${product.unit} available in stock`,
          };
          return prev;
        }

        const newItem: CartItem = {
          product,
          quantity,
          unitPrice: product.sellingPrice,
          lineTotal: Math.round(quantity * product.sellingPrice * 100) / 100,
        };
        return [...prev, newItem];
      });

      return result;
    },
    [allowNegative]
  );

  const updateQuantity = useCallback(
    (productId: string, newQty: number): { success: boolean; message?: string } => {
      let result: { success: boolean; message?: string } = { success: true };

      if (newQty <= 0) {
        removeFromCart(productId);
        return { success: true };
      }

      setItems((prev) => {
        const idx = prev.findIndex((i) => i.product.id === productId);
        if (idx === -1) return prev;

        const current = prev[idx];
        if (!allowNegative && newQty > current.product.stockQuantity) {
          result = {
            success: false,
            message: `Cannot exceed stock limit (${current.product.stockQuantity} ${current.product.unit})`,
          };
          return prev;
        }

        const updated = [...prev];
        updated[idx] = {
          ...current,
          quantity: newQty,
          lineTotal: Math.round(newQty * current.unitPrice * 100) / 100,
        };
        return updated;
      });

      return result;
    },
    [allowNegative]
  );

  const removeFromCart = useCallback((productId: string) => {
    setItems((prev) => prev.filter((i) => i.product.id !== productId));
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    setDiscountAmount(0);
  }, []);

  const setDiscount = useCallback(
    (amount: number) => {
      const valid = Math.max(0, Math.min(amount, subtotal));
      setDiscountAmount(valid);
    },
    [subtotal]
  );

  // Barcode Scanning with 400ms duplicate-scan debounce and haptics
  const scanBarcode = useCallback(
    async (
      barcode: string,
      lookupFn: (b: string) => Promise<Product | null>
    ): Promise<{ success: boolean; product?: Product; message?: string }> => {
      const cleanBarcode = barcode.trim();
      if (!cleanBarcode) return { success: false, message: 'Invalid barcode' };

      const now = Date.now();
      if (
        lastScanRef.current.barcode === cleanBarcode &&
        now - lastScanRef.current.time < 400
      ) {
        // Debounce / throttle repeated burst read
        return { success: false, message: 'Scanning debounced' };
      }

      lastScanRef.current = { barcode: cleanBarcode, time: now };

      const product = await lookupFn(cleanBarcode);
      if (!product) {
        try {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        } catch {}
        return { success: false, message: `Barcode not found: ${cleanBarcode}` };
      }

      // Add or increment
      const addRes = addToCart(product, 1);
      if (addRes.success) {
        try {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        } catch {}
        return { success: true, product };
      } else {
        try {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } catch {}
        return { success: false, product, message: addRes.message };
      }
    },
    [addToCart]
  );

  return (
    <CartContext.Provider
      value={{
        items,
        subtotal,
        discount,
        total,
        itemCount,
        addToCart,
        removeFromCart,
        updateQuantity,
        setDiscount,
        clearCart,
        scanBarcode,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = (): CartContextType => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};

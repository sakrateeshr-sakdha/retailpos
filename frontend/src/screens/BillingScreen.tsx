import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Camera,
  Plus,
  Minus,
  Trash2,
  ChevronUp,
  ChevronDown,
  X,
  Sparkles,
  QrCode,
  Banknote,
  Percent,
  CheckCircle,
  AlertTriangle,
  PackagePlus,
  Check,
} from 'lucide-react';
import { Product, Category, Sale } from '../types/index';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { cacheProducts, searchLocalProducts, db } from '../services/db';
import { BarcodeScannerModal } from '../components/BarcodeScannerModal';
import { CheckoutModal } from '../components/CheckoutModal';
import { ReceiptModal } from '../components/ReceiptModal';

export const BillingScreen: React.FC = () => {
  const { shop, isOnline } = useAuth();
  const {
    items,
    itemCount,
    subtotal,
    discount,
    total,
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
    setDiscount,
  } = useCart();

  // Search & Products state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);

  // UI state
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isCartDrawerOpen, setIsCartDrawerOpen] = useState(false);
  const [showDiscountInput, setShowDiscountInput] = useState(false);
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);

  // Toast & Quick Add on scan
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'warning' | 'error';
    barcode?: string;
  } | null>(null);
  const [quickAddBarcode, setQuickAddBarcode] = useState<string | null>(null);
  const [quickAddName, setQuickAddName] = useState('');
  const [quickAddPrice, setQuickAddPrice] = useState('');
  const [quickAddSaving, setQuickAddSaving] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const currency = shop?.currency || '₹';

  const playSuccessBeep = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const ctx = new AudioContextClass();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, ctx.currentTime);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.12);
      }
    } catch {}
  };

  const playWarningBeep = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const ctx = new AudioContextClass();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, ctx.currentTime);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
      }
    } catch {}
  };

  const showToast = (
    message: string,
    type: 'success' | 'warning' | 'error',
    barcode?: string
  ) => {
    setToast({ message, type, barcode });
    if (type === 'success') {
      setTimeout(() => {
        setToast((current) => (current?.message === message ? null : current));
      }, 3500);
    }
  };

  // Load categories and initial products
  const loadInitialData = async () => {
    try {
      setLoading(true);
      if (isOnline) {
        const [catsRes, prodsRes] = await Promise.all([
          api.getCategories(),
          api.getProducts(),
        ]);
        setCategories(catsRes.categories);
        setCatalogProducts(prodsRes.products);
        await cacheProducts(prodsRes.products);
      } else {
        const cached = await db.products.toArray();
        setCatalogProducts(cached);
      }
    } catch (e) {
      console.warn('Network error loading initial catalog, using local DB:', e);
      const cached = await db.products.toArray();
      setCatalogProducts(cached);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, [isOnline]);

  // Handle live search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      const q = searchQuery.trim();
      try {
        if (isOnline) {
          const res = await api.searchProducts(q);
          setSearchResults(res.products);
        } else {
          const results = await searchLocalProducts(q);
          setSearchResults(results);
        }
      } catch (err) {
        const results = await searchLocalProducts(q);
        setSearchResults(results);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [searchQuery, isOnline]);

  // Central barcode scan & add handler
  const handleBarcodeScanned = async (rawCode: string) => {
    const cleanCode = rawCode.trim();
    if (!cleanCode) return;

    try {
      const lower = cleanCode.toLowerCase();

      // 1. Check local loaded catalog
      let matched: Product | undefined = catalogProducts.find(
        (p) =>
          (p.barcode && p.barcode.trim().toLowerCase() === lower) ||
          (p.sku && p.sku.trim().toLowerCase() === lower)
      );

      // 2. Query backend search if not found in memory
      if (!matched && isOnline) {
        const res = await api.searchProducts(cleanCode);
        matched =
          res.products.find(
            (p) =>
              (p.barcode && p.barcode.trim().toLowerCase() === lower) ||
              (p.sku && p.sku.trim().toLowerCase() === lower)
          ) || (res.products.length === 1 ? res.products[0] : undefined);
      }

      // 3. Query local IndexedDB if still not found
      if (!matched) {
        const offlineResults = await searchLocalProducts(cleanCode);
        matched =
          offlineResults.find(
            (p) =>
              (p.barcode && p.barcode.trim().toLowerCase() === lower) ||
              (p.sku && p.sku.trim().toLowerCase() === lower)
          ) || (offlineResults.length === 1 ? offlineResults[0] : undefined);
      }

      if (matched) {
        addItem(matched, 1);
        setSearchQuery('');
        playSuccessBeep();
        showToast(
          `✓ Added "${matched.name}" (${currency}${Number(matched.sellingPrice).toFixed(0)}) to cart!`,
          'success'
        );
      } else {
        playWarningBeep();
        showToast(
          `Barcode "${cleanCode}" not found in inventory.`,
          'warning',
          cleanCode
        );
        setSearchQuery(cleanCode);
      }
    } catch (err: any) {
      showToast(`Error scanning: ${err.message || 'Failed'}`, 'error');
    }
  };

  // Hardware barcode scanner listener (e.g. USB or Bluetooth barcode scanner guns)
  useEffect(() => {
    let buffer = '';
    let lastTime = Date.now();

    const handleHardwareScan = (e: KeyboardEvent) => {
      // Ignore if user is actively typing inside an input or textarea
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }

      const now = Date.now();
      // Scanners send keys rapidly (< 80ms)
      if (now - lastTime > 120) {
        buffer = '';
      }
      lastTime = now;

      if (e.key === 'Enter') {
        if (buffer.length >= 3) {
          handleBarcodeScanned(buffer);
          buffer = '';
        }
      } else if (e.key.length === 1) {
        buffer += e.key;
      }
    };

    window.addEventListener('keydown', handleHardwareScan);
    return () => window.removeEventListener('keydown', handleHardwareScan);
  }, [catalogProducts, isOnline]);

  const handleSelectProduct = (product: Product) => {
    addItem(product, 1);
    setSearchQuery('');
    playSuccessBeep();
    showToast(`✓ Added "${product.name}" to cart!`, 'success');
    searchInputRef.current?.focus();
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (searchResults.length > 0) {
        handleSelectProduct(searchResults[0]);
      } else if (searchQuery.trim()) {
        handleBarcodeScanned(searchQuery);
      }
    }
  };

  const handleQuickAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickAddName.trim() || !quickAddPrice || !quickAddBarcode) return;

    setQuickAddSaving(true);
    try {
      const payload = {
        name: quickAddName.trim(),
        barcode: quickAddBarcode.trim(),
        sellingPrice: Number(quickAddPrice),
        stockQuantity: 50,
        unit: 'pcs',
      };
      const res = await api.createProduct(payload);
      addItem(res.product, 1);
      playSuccessBeep();
      showToast(`✓ Created & added "${res.product.name}" to cart!`, 'success');
      setQuickAddBarcode(null);
      setQuickAddName('');
      setQuickAddPrice('');
      setToast(null);
      await loadInitialData();
    } catch (err: any) {
      alert(err.message || 'Failed to save product');
    } finally {
      setQuickAddSaving(false);
    }
  };

  const filteredCatalog = catalogProducts.filter((p) => {
    if (selectedCategory === 'all') return true;
    return p.categoryId === selectedCategory;
  });

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 pb-36 max-w-lg mx-auto select-none">
      {/* Toast Notification Banner */}
      {toast && (
        <div
          className={`sticky top-0 z-30 px-3 py-2 flex items-center justify-between shadow-md transition animate-in slide-in-from-top duration-150 ${
            toast.type === 'success'
              ? 'bg-green-600 text-white'
              : toast.type === 'warning'
              ? 'bg-amber-600 text-white'
              : 'bg-red-600 text-white'
          }`}
        >
          <div className="flex items-center space-x-2 text-xs font-semibold flex-1 pr-2">
            {toast.type === 'success' ? (
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            )}
            <span className="truncate">{toast.message}</span>
          </div>

          <div className="flex items-center space-x-1.5 flex-shrink-0">
            {toast.barcode && (
              <button
                type="button"
                onClick={() => {
                  setQuickAddBarcode(toast.barcode || '');
                  setQuickAddName('');
                  setQuickAddPrice('');
                }}
                className="bg-white text-gray-900 text-[11px] font-bold px-2 py-0.5 rounded shadow-xs active:scale-95 transition flex items-center gap-1"
              >
                <PackagePlus className="w-3 h-3 text-green-700" />
                <span>+ Add Product</span>
              </button>
            )}
            <button
              onClick={() => setToast(null)}
              className="p-1 rounded-full text-white/80 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Search & Scanner Bar */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 p-3 shadow-xs">
        <div className="flex items-center gap-2">
          {/* Instant Search Input */}
          <div className="relative flex-1">
            <Search className="w-5 h-5 absolute left-3 top-2.5 text-gray-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search name or scan barcode..."
              className="w-full bg-gray-100 border border-gray-200 rounded-xl pl-10 pr-9 py-2.5 text-sm font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition"
              autoComplete="off"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  searchInputRef.current?.focus();
                }}
                className="absolute right-2.5 top-2.5 p-0.5 text-gray-400 hover:text-gray-600 rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Camera Scan Button */}
          <button
            onClick={() => setIsScannerOpen(true)}
            className="flex items-center justify-center p-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl shadow-sm active:scale-95 transition"
            title="Scan Barcode with Camera"
          >
            <Camera className="w-5 h-5" />
          </button>
        </div>

        {/* Live Search Instant Results Dropdown */}
        {searchQuery.trim() !== '' && (
          <div className="absolute left-3 right-3 top-[62px] z-30 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden max-h-80 overflow-y-auto">
            {searchResults.length === 0 ? (
              <div className="p-4 text-center text-xs text-gray-500 space-y-2">
                <div>No products found matching "{searchQuery}"</div>
                <button
                  type="button"
                  onClick={() => {
                    setQuickAddBarcode(searchQuery.trim());
                    setQuickAddName(searchQuery.trim());
                    setQuickAddPrice('');
                  }}
                  className="inline-flex items-center gap-1.5 bg-green-50 text-green-700 border border-green-300 font-bold px-3 py-1.5 rounded-lg text-xs hover:bg-green-100 transition"
                >
                  <PackagePlus className="w-3.5 h-3.5" />
                  <span>+ Create Product for "{searchQuery}"</span>
                </button>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {searchResults.map((product) => {
                  const stock = Number(product.stockQuantity);
                  const isLow = stock <= Number(product.lowStockThreshold);
                  const isOut = stock <= 0;

                  return (
                    <button
                      key={product.id}
                      onClick={() => handleSelectProduct(product)}
                      className="w-full p-3 flex items-center justify-between text-left hover:bg-green-50 active:bg-green-100 transition"
                    >
                      <div className="pr-2">
                        <div className="font-bold text-sm text-gray-900 leading-tight">
                          {product.name}
                        </div>
                        <div className="flex items-center space-x-2 text-[11px] text-gray-500 mt-0.5">
                          <span
                            className={`font-semibold ${
                              isOut ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-gray-500'
                            }`}
                          >
                            Stock: {stock} {product.unit}
                          </span>
                          {product.barcode && (
                            <span className="font-mono text-gray-400">#{product.barcode}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="font-black text-base text-green-700">
                          {currency}{Number(product.sellingPrice).toFixed(2)}
                        </div>
                        <span className="text-[10px] text-green-600 font-semibold bg-green-100 px-1.5 py-0.5 rounded">
                          + Tap to Add
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Category Chips Horizontal Scroll */}
      <div className="px-3 py-2 flex gap-1.5 overflow-x-auto no-scrollbar bg-gray-50 border-b border-gray-200/70">
        <button
          onClick={() => setSelectedCategory('all')}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition active:scale-95 ${
            selectedCategory === 'all'
              ? 'bg-green-700 text-white shadow-xs'
              : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
          }`}
        >
          All Items
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition active:scale-95 ${
              selectedCategory === cat.id
                ? 'bg-green-700 text-white shadow-xs'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Quick Catalog Grid for One-Tap Adding */}
      <div className="p-3">
        <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center justify-between">
          <span>Tap to Add to Cart</span>
          <span className="text-[11px] font-normal lowercase text-gray-400">
            {filteredCatalog.length} products
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {filteredCatalog.map((prod) => {
            const inCart = items.find((i) => i.product.id === prod.id);
            const stock = Number(prod.stockQuantity);
            const isLow = stock <= Number(prod.lowStockThreshold);

            return (
              <button
                key={prod.id}
                onClick={() => addItem(prod, 1)}
                className={`p-3 rounded-2xl border text-left flex flex-col justify-between h-28 relative shadow-xs transition active:scale-96 ${
                  inCart
                    ? 'bg-green-50 border-green-400 ring-2 ring-green-500/20'
                    : 'bg-white border-gray-200 hover:border-gray-300'
                }`}
              >
                <div>
                  <div className="font-bold text-sm text-gray-900 leading-snug line-clamp-2">
                    {prod.name}
                  </div>
                  <div
                    className={`text-[11px] mt-0.5 ${
                      stock <= 0 ? 'text-red-600 font-bold' : isLow ? 'text-amber-600' : 'text-gray-500'
                    }`}
                  >
                    Stock: {stock} {prod.unit}
                  </div>
                </div>

                <div className="flex items-center justify-between mt-2 pt-1 border-t border-gray-100">
                  <div className="font-extrabold text-base text-gray-900">
                    {currency}{Number(prod.sellingPrice).toFixed(0)}
                  </div>
                  {inCart ? (
                    <div className="bg-green-600 text-white text-xs font-black rounded-full w-6 h-6 flex items-center justify-center shadow-xs">
                      {inCart.quantity}
                    </div>
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center font-bold text-sm">
                      +
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Slide-Up Expanded Cart Drawer Modal / Bottom Sheet */}
      {isCartDrawerOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs flex flex-col justify-end max-w-lg mx-auto">
          <div className="bg-white rounded-t-3xl max-h-[80vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-200">
            {/* Drawer Header */}
            <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50 rounded-t-3xl">
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-base text-gray-900">
                  Current Bill ({itemCount} items)
                </span>
              </div>
              <div className="flex items-center space-x-3">
                {items.length > 0 && (
                  <button
                    onClick={clearCart}
                    className="text-xs text-red-600 hover:text-red-700 font-semibold flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear</span>
                  </button>
                )}
                <button
                  onClick={() => setIsCartDrawerOpen(false)}
                  className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-200"
                >
                  <ChevronDown className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Cart Items List */}
            <div className="p-4 overflow-y-auto flex-1 divide-y divide-gray-100">
              {items.length === 0 ? (
                <div className="py-12 text-center text-gray-400 text-sm">
                  Your cart is empty. Tap products or scan barcode to add.
                </div>
              ) : (
                items.map((item) => (
                  <div key={item.product.id} className="py-3 flex items-center justify-between">
                    <div className="flex-1 pr-2">
                      <div className="font-bold text-sm text-gray-900 leading-tight">
                        {item.product.name}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {currency}{item.unitPrice} × {item.quantity} ={' '}
                        <span className="font-semibold text-gray-900">
                          {currency}{item.totalPrice.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {/* Quantity Stepper (Large touch targets) */}
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => updateQuantity(item.product.id, -1)}
                        className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 flex items-center justify-center font-bold active:scale-95"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-7 text-center font-extrabold text-sm text-gray-900">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.product.id, 1)}
                        className="w-8 h-8 rounded-lg bg-green-600 hover:bg-green-700 text-white flex items-center justify-center font-bold active:scale-95"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => removeItem(item.product.id)}
                        className="p-1 text-gray-400 hover:text-red-500 ml-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Bill Summary & Quick Discount */}
            {items.length > 0 && (
              <div className="p-4 bg-gray-50 border-t border-gray-200 space-y-2">
                <div className="flex justify-between text-xs text-gray-600">
                  <span>Subtotal</span>
                  <span>{currency}{subtotal.toFixed(2)}</span>
                </div>

                {/* Discount toggle */}
                <div className="flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => setShowDiscountInput(!showDiscountInput)}
                    className="text-green-700 font-semibold flex items-center gap-1"
                  >
                    <Percent className="w-3.5 h-3.5" />
                    <span>{discount > 0 ? `Discount: -${currency}${discount}` : '+ Add Discount'}</span>
                  </button>
                  {showDiscountInput && (
                    <div className="flex items-center gap-1">
                      <span className="text-gray-500">{currency}</span>
                      <input
                        type="number"
                        value={discount || ''}
                        onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))}
                        placeholder="0"
                        className="w-16 bg-white border border-gray-300 rounded px-2 py-0.5 text-xs text-right font-bold"
                      />
                    </div>
                  )}
                </div>

                <div className="flex justify-between text-base font-extrabold text-gray-900 pt-1 border-t border-gray-200">
                  <span>Net Total:</span>
                  <span>{currency}{total.toFixed(2)}</span>
                </div>

                <button
                  onClick={() => {
                    setIsCartDrawerOpen(false);
                    setIsCheckoutOpen(true);
                  }}
                  className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-bold text-sm shadow-md active:scale-98 transition flex items-center justify-center gap-2"
                >
                  <span>Proceed to Payment</span>
                  <span>•</span>
                  <span>{currency}{total.toFixed(2)}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating Bottom Sticky Checkout Bar */}
      {items.length > 0 && (
        <div className="fixed bottom-16 left-0 right-0 z-20 max-w-lg mx-auto p-2 bg-gradient-to-t from-gray-900/90 to-gray-900/80 backdrop-blur-md rounded-t-2xl shadow-2xl border-t border-gray-700">
          <div className="flex items-center justify-between px-2 py-1">
            {/* Left: Cart Info & Tap to Expand */}
            <button
              onClick={() => setIsCartDrawerOpen(true)}
              className="text-left flex items-center space-x-2 text-white"
            >
              <div>
                <div className="text-[11px] text-gray-300 flex items-center gap-1">
                  <span>Cart ({itemCount})</span>
                  <ChevronUp className="w-3 h-3 text-green-400" />
                </div>
                <div className="text-lg font-black text-white leading-none">
                  {currency}{total.toFixed(2)}
                </div>
              </div>
            </button>

            {/* Right: Instant Payment Buttons (UPI & CASH) */}
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setIsCheckoutOpen(true)}
                className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white px-3.5 py-2.5 rounded-xl font-bold text-xs flex items-center space-x-1.5 shadow-md transition"
              >
                <QrCode className="w-4 h-4" />
                <span>UPI</span>
              </button>

              <button
                onClick={() => setIsCheckoutOpen(true)}
                className="bg-green-600 hover:bg-green-700 active:scale-95 text-white px-3.5 py-2.5 rounded-xl font-bold text-xs flex items-center space-x-1.5 shadow-md transition"
              >
                <Banknote className="w-4 h-4" />
                <span>CASH</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Add Product Modal when Barcode is Not in System */}
      {quickAddBarcode && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-sm sm:rounded-2xl rounded-t-2xl p-4 shadow-2xl space-y-3 animate-in slide-in-from-bottom duration-200">
            <div className="flex justify-between items-center pb-2 border-b border-gray-100">
              <div className="flex items-center space-x-2">
                <PackagePlus className="w-5 h-5 text-green-600" />
                <h3 className="font-bold text-sm text-gray-900">Add New Product</h3>
              </div>
              <button
                onClick={() => setQuickAddBarcode(null)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded-lg font-mono">
              Barcode: <span className="font-bold text-gray-900">{quickAddBarcode}</span>
            </div>

            <form onSubmit={handleQuickAddProduct} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-gray-700 block mb-1">Product Name *</label>
                <input
                  type="text"
                  value={quickAddName}
                  onChange={(e) => setQuickAddName(e.target.value)}
                  placeholder="e.g. Bread 400g, Soap..."
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-green-500"
                  autoFocus
                  required
                />
              </div>

              <div>
                <label className="font-semibold text-gray-700 block mb-1">Selling Price ({currency}) *</label>
                <input
                  type="number"
                  step="0.01"
                  value={quickAddPrice}
                  onChange={(e) => setQuickAddPrice(e.target.value)}
                  placeholder="e.g. 45"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold text-green-700 focus:outline-none focus:border-green-500"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={quickAddSaving}
                className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-3 rounded-xl font-bold text-sm shadow-md active:scale-98 transition flex items-center justify-center space-x-1.5"
              >
                <Check className="w-4 h-4" />
                <span>{quickAddSaving ? 'Saving...' : 'Save & Add to Cart'}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modals */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={handleBarcodeScanned}
      />

      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        onSaleComplete={(sale) => setCompletedSale(sale)}
      />

      <ReceiptModal
        isOpen={!!completedSale}
        sale={completedSale}
        onClose={() => setCompletedSale(null)}
        onNewBill={() => {
          setCompletedSale(null);
          loadInitialData();
        }}
      />
    </div>
  );
};

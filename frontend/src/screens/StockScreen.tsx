import React, { useState, useEffect } from 'react';
import {
  ClipboardList,
  AlertTriangle,
  PlusCircle,
  MinusCircle,
  History,
  Check,
  Search,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react';
import { Product, StockMovement } from '../types/index';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

export const StockScreen: React.FC = () => {
  const { shop, isOnline } = useAuth();
  const [activeTab, setActiveTab] = useState<'alerts' | 'inward' | 'adjust' | 'history'>('alerts');
  const [products, setProducts] = useState<Product[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(false);

  // Form states
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [adjustmentType, setAdjustmentType] = useState<'ADJUSTMENT' | 'RETURN'>('ADJUSTMENT');
  const [isDeduction, setIsDeduction] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const currency = shop?.currency || '₹';

  const loadData = async () => {
    try {
      setLoading(true);
      const [prodsRes, alertsRes, movRes] = await Promise.all([
        api.getProducts(),
        api.getLowStockAlerts(),
        api.getStockMovements(),
      ]);
      setProducts(prodsRes.products);
      setLowStockProducts(alertsRes.data);
      setMovements(movRes.data.movements);
      if (prodsRes.products.length > 0 && !selectedProductId) {
        setSelectedProductId(prodsRes.products[0].id);
      }
    } catch (err) {
      console.error('Error loading stock data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [isOnline]);

  const handleStockIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || !quantity) return;
    setSubmitting(true);
    setSuccessMsg(null);
    try {
      await api.addStock({
        productId: selectedProductId,
        quantity: Number(quantity),
        reason: reason.trim() || 'Restock / Purchase',
      });
      setSuccessMsg('Stock added successfully!');
      setQuantity('');
      setReason('');
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Stock-in failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStockAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || !quantity || !reason.trim()) {
      alert('Product, quantity, and reason are required');
      return;
    }
    setSubmitting(true);
    setSuccessMsg(null);
    try {
      await api.adjustStock({
        productId: selectedProductId,
        quantity: Number(quantity),
        type: adjustmentType,
        isDeduction,
        reason: reason.trim(),
      });
      setSuccessMsg('Stock adjustment recorded!');
      setQuantity('');
      setReason('');
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Adjustment failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickRestock = async (productId: string, addQty: number) => {
    try {
      await api.addStock({
        productId,
        quantity: addQty,
        reason: 'Quick Restock',
      });
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Restock failed');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24 max-w-lg mx-auto">
      {/* Top Tabs */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 p-2 shadow-xs">
        <div className="grid grid-cols-4 gap-1">
          <button
            onClick={() => setActiveTab('alerts')}
            className={`py-2 text-xs font-semibold rounded-xl transition flex flex-col items-center justify-center relative ${
              activeTab === 'alerts'
                ? 'bg-green-700 text-white shadow-xs'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <span>Low Stock</span>
            {lowStockProducts.length > 0 && (
              <span className="text-[10px] bg-red-500 text-white font-bold px-1.5 rounded-full mt-0.5">
                {lowStockProducts.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('inward')}
            className={`py-2 text-xs font-semibold rounded-xl transition flex flex-col items-center justify-center ${
              activeTab === 'inward'
                ? 'bg-green-700 text-white shadow-xs'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <span>+ Stock In</span>
          </button>

          <button
            onClick={() => setActiveTab('adjust')}
            className={`py-2 text-xs font-semibold rounded-xl transition flex flex-col items-center justify-center ${
              activeTab === 'adjust'
                ? 'bg-green-700 text-white shadow-xs'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <span>± Adjust</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`py-2 text-xs font-semibold rounded-xl transition flex flex-col items-center justify-center ${
              activeTab === 'history'
                ? 'bg-green-700 text-white shadow-xs'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <span>Logs</span>
          </button>
        </div>
      </div>

      <div className="p-3">
        {/* Tab 1: Low Stock Alerts */}
        {activeTab === 'alerts' && (
          <div className="space-y-3">
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wider flex justify-between items-center">
              <span>Low Stock Alerts ({lowStockProducts.length})</span>
              <span className="text-[11px] text-gray-400">Restock needed</span>
            </div>

            {lowStockProducts.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center space-y-2">
                <Check className="w-10 h-10 text-green-500 mx-auto" />
                <div className="font-bold text-sm text-gray-900">All Stock Levels Healthy</div>
                <div className="text-xs text-gray-500">
                  No items currently below their low stock threshold.
                </div>
              </div>
            ) : (
              lowStockProducts.map((p) => {
                const stock = Number(p.stockQuantity);
                return (
                  <div
                    key={p.id}
                    className="bg-white border-l-4 border-l-amber-500 border border-gray-200 rounded-2xl p-3.5 shadow-xs space-y-2"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-bold text-sm text-gray-900">{p.name}</div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          Threshold: {Number(p.lowStockThreshold)} {p.unit}
                        </div>
                      </div>
                      <div className="text-right">
                        <span
                          className={`text-sm font-black px-2 py-0.5 rounded-lg ${
                            stock <= 0
                              ? 'bg-red-100 text-red-700'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          Stock: {stock} {p.unit}
                        </span>
                      </div>
                    </div>

                    {/* Quick Restock Action Buttons */}
                    <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                      <span className="text-[11px] text-gray-400">Quick Restock:</span>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => handleQuickRestock(p.id, 10)}
                          className="bg-green-50 hover:bg-green-100 border border-green-300 text-green-700 text-xs px-2.5 py-1 rounded-lg font-bold active:scale-95 transition"
                        >
                          +10 {p.unit}
                        </button>
                        <button
                          onClick={() => handleQuickRestock(p.id, 25)}
                          className="bg-green-600 hover:bg-green-700 text-white text-xs px-2.5 py-1 rounded-lg font-bold active:scale-95 transition"
                        >
                          +25 {p.unit}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Tab 2: Stock In (Purchases / Restock) */}
        {activeTab === 'inward' && (
          <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs space-y-4">
            <div>
              <h3 className="font-bold text-base text-gray-900">Add Stock (Inward)</h3>
              <p className="text-xs text-gray-500">Record incoming stock purchased from vendors</p>
            </div>

            {successMsg && (
              <div className="bg-green-50 border border-green-200 text-green-800 p-2.5 rounded-xl text-xs font-semibold">
                {successMsg}
              </div>
            )}

            <form onSubmit={handleStockIn} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-gray-700 block mb-1">Select Product *</label>
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-green-500"
                  required
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Current: {Number(p.stockQuantity)} {p.unit})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-gray-700 block mb-1">Quantity to Add *</label>
                <input
                  type="number"
                  step="0.01"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="e.g. 50"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold text-gray-900 focus:outline-none focus:border-green-500"
                  required
                />
              </div>

              <div>
                <label className="font-semibold text-gray-700 block mb-1">Reason / Notes</label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Vendor delivery, Weekly restock..."
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-green-500"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-bold text-sm shadow-md active:scale-98 transition flex items-center justify-center space-x-2"
              >
                <PlusCircle className="w-5 h-5" />
                <span>{submitting ? 'Adding Stock...' : 'Confirm Stock Inward'}</span>
              </button>
            </form>
          </div>
        )}

        {/* Tab 3: Stock Adjustment */}
        {activeTab === 'adjust' && (
          <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs space-y-4">
            <div>
              <h3 className="font-bold text-base text-gray-900">Stock Adjustment</h3>
              <p className="text-xs text-gray-500">Record damage, expired goods, or count corrections</p>
            </div>

            {successMsg && (
              <div className="bg-green-50 border border-green-200 text-green-800 p-2.5 rounded-xl text-xs font-semibold">
                {successMsg}
              </div>
            )}

            <form onSubmit={handleStockAdjustment} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-gray-700 block mb-1">Select Product *</label>
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-green-500"
                  required
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Current: {Number(p.stockQuantity)} {p.unit})
                    </option>
                  ))}
                </select>
              </div>

              {/* Adjustment Mode */}
              <div>
                <label className="font-semibold text-gray-700 block mb-1">Action Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setIsDeduction(true)}
                    className={`p-2.5 rounded-xl font-bold text-xs border transition ${
                      isDeduction
                        ? 'bg-red-50 border-red-500 text-red-700'
                        : 'bg-gray-50 border-gray-200 text-gray-600'
                    }`}
                  >
                    Deduct Stock (-)
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsDeduction(false)}
                    className={`p-2.5 rounded-xl font-bold text-xs border transition ${
                      !isDeduction
                        ? 'bg-green-50 border-green-500 text-green-700'
                        : 'bg-gray-50 border-gray-200 text-gray-600'
                    }`}
                  >
                    Add Stock (+)
                  </button>
                </div>
              </div>

              <div>
                <label className="font-semibold text-gray-700 block mb-1">Quantity *</label>
                <input
                  type="number"
                  step="0.01"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="Quantity to adjust"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold text-gray-900 focus:outline-none focus:border-green-500"
                  required
                />
              </div>

              <div>
                <label className="font-semibold text-gray-700 block mb-1">Reason *</label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Expired, Spilled/Damaged packet, Physical audit discrepancy"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-green-500"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-gray-900 hover:bg-black text-white py-3 rounded-xl font-bold text-sm shadow-md active:scale-98 transition"
              >
                {submitting ? 'Applying...' : 'Apply Adjustment'}
              </button>
            </form>
          </div>
        )}

        {/* Tab 4: Stock Movement Logs */}
        {activeTab === 'history' && (
          <div className="space-y-2">
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
              Stock Movement History
            </div>

            {movements.length === 0 ? (
              <div className="py-12 text-center text-xs text-gray-500">
                No stock movement logs found.
              </div>
            ) : (
              movements.map((m) => {
                const isAdd = m.type === 'PURCHASE' || m.type === 'RETURN';
                return (
                  <div
                    key={m.id}
                    className="bg-white border border-gray-200 rounded-2xl p-3 shadow-xs flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center space-x-2.5">
                      <div
                        className={`p-2 rounded-xl ${
                          isAdd ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {isAdd ? (
                          <ArrowDownLeft className="w-4 h-4" />
                        ) : (
                          <ArrowUpRight className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <div className="font-bold text-gray-900">
                          {m.product?.name || 'Product'}
                        </div>
                        <div className="text-[11px] text-gray-500 mt-0.5">
                          {m.reason || m.type} • {new Date(m.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div
                        className={`font-black text-sm ${
                          isAdd ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        {isAdd ? '+' : '-'}{Number(m.quantity)} {m.product?.unit || ''}
                      </div>
                      <div className="text-[10px] text-gray-400">
                        {Number(m.previousStock)} → {Number(m.newStock)}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
};

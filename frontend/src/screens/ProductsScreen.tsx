import React, { useState, useEffect } from 'react';
import { Plus, Search, Edit3, Trash2, X, AlertTriangle, Check, PackagePlus } from 'lucide-react';
import { Product, Category } from '../types/index';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { cacheProducts } from '../services/db';

export const ProductsScreen: React.FC = () => {
  const { shop, isOnline, user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [loading, setLoading] = useState(false);

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    categoryId: '',
    barcode: '',
    sku: '',
    purchasePrice: '',
    sellingPrice: '',
    stockQuantity: '',
    unit: 'pcs',
    lowStockThreshold: '5',
  });
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const currency = shop?.currency || '₹';
  const isAdmin = user?.role === 'ADMIN';

  const loadData = async () => {
    try {
      setLoading(true);
      const [pRes, cRes] = await Promise.all([
        api.getProducts(),
        api.getCategories(),
      ]);
      setProducts(pRes.products);
      setCategories(cRes.categories);
      await cacheProducts(pRes.products);
    } catch (err) {
      console.error('Failed to load products:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [isOnline]);

  const openAddModal = () => {
    setEditingProduct(null);
    setFormData({
      name: '',
      categoryId: categories[0]?.id || '',
      barcode: '',
      sku: '',
      purchasePrice: '',
      sellingPrice: '',
      stockQuantity: '',
      unit: 'pcs',
      lowStockThreshold: '5',
    });
    setErrorMsg(null);
    setIsAddModalOpen(true);
  };

  const openEditModal = (p: Product) => {
    setEditingProduct(p);
    setFormData({
      name: p.name,
      categoryId: p.categoryId || '',
      barcode: p.barcode || '',
      sku: p.sku || '',
      purchasePrice: p.purchasePrice.toString(),
      sellingPrice: p.sellingPrice.toString(),
      stockQuantity: p.stockQuantity.toString(),
      unit: p.unit || 'pcs',
      lowStockThreshold: p.lowStockThreshold.toString(),
    });
    setErrorMsg(null);
    setIsAddModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.sellingPrice) {
      setErrorMsg('Product name and selling price are required');
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    const payload = {
      name: formData.name.trim(),
      categoryId: formData.categoryId || null,
      barcode: formData.barcode.trim() || null,
      sku: formData.sku.trim() || null,
      purchasePrice: Number(formData.purchasePrice) || 0,
      sellingPrice: Number(formData.sellingPrice),
      stockQuantity: Number(formData.stockQuantity) || 0,
      unit: formData.unit,
      lowStockThreshold: Number(formData.lowStockThreshold) || 5,
    };

    try {
      if (editingProduct) {
        await api.updateProduct(editingProduct.id, payload);
      } else {
        await api.createProduct(payload);
      }
      setIsAddModalOpen(false);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save product');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm('Are you sure you want to delete or deactivate this product?')) return;
    try {
      await api.deleteProduct(id);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Delete failed');
    }
  };

  const filteredProducts = products.filter((p) => {
    const matchesCat = selectedCategory === 'all' || p.categoryId === selectedCategory;
    const q = search.toLowerCase().trim();
    const matchesSearch =
      !q ||
      p.name.toLowerCase().includes(q) ||
      (p.barcode && p.barcode.toLowerCase().includes(q)) ||
      (p.sku && p.sku.toLowerCase().includes(q));
    return matchesCat && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-gray-50 pb-24 max-w-lg mx-auto">
      {/* Search & Actions Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 p-3 shadow-xs space-y-2.5">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-5 h-5 absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products..."
              className="w-full bg-gray-100 border border-gray-200 rounded-xl pl-10 pr-4 py-2 text-sm text-gray-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-green-500 transition"
            />
          </div>

          {isAdmin && (
            <button
              onClick={openAddModal}
              className="bg-green-600 hover:bg-green-700 text-white p-2.5 rounded-xl shadow-sm flex items-center justify-center active:scale-95 transition"
              title="Add New Product"
            >
              <Plus className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Categories Bar */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pt-0.5">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition ${
              selectedCategory === 'all'
                ? 'bg-green-700 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All ({products.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition ${
                selectedCategory === cat.id
                  ? 'bg-green-700 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Products List */}
      <div className="p-3 space-y-2">
        {loading ? (
          <div className="py-12 text-center text-xs text-gray-500 animate-pulse">
            Loading products...
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="py-12 text-center text-xs text-gray-500">
            No products match your criteria.
          </div>
        ) : (
          filteredProducts.map((p) => {
            const stock = Number(p.stockQuantity);
            const isLow = stock <= Number(p.lowStockThreshold);

            return (
              <div
                key={p.id}
                className="bg-white border border-gray-200 rounded-2xl p-3 shadow-xs flex items-center justify-between"
              >
                <div className="pr-2 flex-1">
                  <div className="font-bold text-sm text-gray-900 leading-tight">
                    {p.name}
                  </div>
                  <div className="flex items-center space-x-2 text-[11px] text-gray-500 mt-1">
                    <span className="font-mono text-gray-400">
                      {p.barcode ? `#${p.barcode.slice(-6)}` : p.sku || 'No Barcode'}
                    </span>
                    <span>•</span>
                    <span
                      className={`font-semibold ${
                        stock <= 0 ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-gray-600'
                      }`}
                    >
                      Stock: {stock} {p.unit}
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <div className="text-right">
                    <div className="font-black text-base text-gray-900">
                      {currency}{Number(p.sellingPrice).toFixed(0)}
                    </div>
                    {Number(p.purchasePrice) > 0 && (
                      <div className="text-[10px] text-gray-400">
                        Cost: {currency}{Number(p.purchasePrice).toFixed(0)}
                      </div>
                    )}
                  </div>

                  {isAdmin && (
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => openEditModal(p)}
                        className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteProduct(p.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add / Edit Product Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-sm sm:rounded-2xl rounded-t-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-200">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-bold text-base text-gray-900">
                {editingProduct ? 'Edit Product' : 'Add New Product'}
              </h2>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 rounded-full text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="p-4 overflow-y-auto space-y-3 flex-1 text-xs">
              {errorMsg && (
                <div className="bg-red-50 border border-red-200 text-red-700 p-2.5 rounded-xl font-medium">
                  {errorMsg}
                </div>
              )}

              <div>
                <label className="font-semibold text-gray-700 block mb-1">Product Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Milk 1L, Basmati Rice 5kg"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-green-500"
                  required
                />
              </div>

              <div>
                <label className="font-semibold text-gray-700 block mb-1">Category</label>
                <select
                  value={formData.categoryId}
                  onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-green-500"
                >
                  <option value="">-- Select Category --</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-gray-700 block mb-1">Selling Price ({currency}) *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.sellingPrice}
                    onChange={(e) => setFormData({ ...formData, sellingPrice: e.target.value })}
                    placeholder="32.00"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold text-green-700 focus:outline-none focus:border-green-500"
                    required
                  />
                </div>
                <div>
                  <label className="font-semibold text-gray-700 block mb-1">Purchase Price ({currency})</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.purchasePrice}
                    onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })}
                    placeholder="28.00"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-green-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-gray-700 block mb-1">Initial Stock</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.stockQuantity}
                    onChange={(e) => setFormData({ ...formData, stockQuantity: e.target.value })}
                    placeholder="10"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-green-500"
                  />
                </div>
                <div>
                  <label className="font-semibold text-gray-700 block mb-1">Unit</label>
                  <select
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-green-500"
                  >
                    <option value="pcs">Pieces (pcs)</option>
                    <option value="kg">Kilogram (kg)</option>
                    <option value="g">Gram (g)</option>
                    <option value="litre">Litre (L)</option>
                    <option value="ml">Millilitre (ml)</option>
                    <option value="packet">Packet</option>
                    <option value="box">Box</option>
                    <option value="bottle">Bottle</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-gray-700 block mb-1">Barcode</label>
                  <input
                    type="text"
                    value={formData.barcode}
                    onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                    placeholder="890123456789"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono text-gray-900 focus:outline-none focus:border-green-500"
                  />
                </div>
                <div>
                  <label className="font-semibold text-gray-700 block mb-1">Low Stock Alert</label>
                  <input
                    type="number"
                    value={formData.lowStockThreshold}
                    onChange={(e) => setFormData({ ...formData, lowStockThreshold: e.target.value })}
                    placeholder="5"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-green-500"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-bold text-sm shadow-md active:scale-98 transition flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>{saving ? 'Saving...' : editingProduct ? 'Update Product' : 'Add Product'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

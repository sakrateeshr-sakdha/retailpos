import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  Receipt,
  QrCode,
  Banknote,
  Search,
  Calendar,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { Sale, SalesSummary } from '../types/index';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ReceiptModal } from '../components/ReceiptModal';

export const SalesScreen: React.FC = () => {
  const { shop, isOnline } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [range, setRange] = useState<'today' | 'yesterday' | 'thisWeek' | 'thisMonth'>('today');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  const currency = shop?.currency || '₹';

  const loadSalesData = async () => {
    try {
      setLoading(true);
      const [salesRes, summaryRes] = await Promise.all([
        api.getSales({ range, search }),
        api.getSalesSummary(),
      ]);
      setSales(salesRes.sales);
      setSummary(summaryRes.data);
    } catch (err) {
      console.error('Failed to load sales data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSalesData();
  }, [range, isOnline]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadSalesData();
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24 max-w-lg mx-auto">
      {/* Top Today Summary Cards */}
      <div className="p-3 bg-green-700 text-white space-y-2.5 shadow-sm">
        <div className="flex items-center justify-between text-xs text-green-100">
          <span className="font-semibold uppercase tracking-wider">Today's Sales Summary</span>
          <button
            onClick={loadSalesData}
            className="p-1 rounded-full hover:bg-green-800 transition"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Big Amount Card */}
        <div className="bg-white/10 rounded-2xl p-3.5 backdrop-blur-xs border border-white/15">
          <div className="text-xs text-green-200">Total Sales</div>
          <div className="text-3xl font-black tracking-tight mt-0.5">
            {currency}{(summary?.today?.totalAmount || 0).toFixed(2)}
          </div>
          <div className="text-xs text-green-200 mt-1">
            {summary?.today?.billCount || 0} bills completed today
          </div>
        </div>

        {/* Breakdown Chips (Cash vs UPI vs Card) */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-white/10 rounded-xl p-2.5 border border-white/10 flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-green-800 text-green-300">
              <Banknote className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] text-green-200">Cash Sales</div>
              <div className="font-bold text-sm">
                {currency}{(summary?.today?.cashAmount || 0).toFixed(0)}
              </div>
            </div>
          </div>

          <div className="bg-white/10 rounded-xl p-2.5 border border-white/10 flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-blue-800 text-blue-300">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] text-green-200">UPI Sales</div>
              <div className="font-bold text-sm">
                {currency}{(summary?.today?.upiAmount || 0).toFixed(0)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Date Range Selector */}
      <div className="p-3 bg-white border-b border-gray-200 space-y-2">
        <div className="flex gap-1.5">
          {(['today', 'yesterday', 'thisWeek', 'thisMonth'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition capitalize ${
                range === r
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {r === 'thisWeek' ? 'Week' : r === 'thisMonth' ? 'Month' : r}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <form onSubmit={handleSearchSubmit} className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search bill number or customer..."
            className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-3 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-green-500"
          />
        </form>
      </div>

      {/* Sales History List */}
      <div className="p-3 space-y-2">
        <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 flex justify-between">
          <span>Invoices ({sales.length})</span>
          <span>Tap to View Receipt</span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-gray-500 animate-pulse">
            Loading sales history...
          </div>
        ) : sales.length === 0 ? (
          <div className="py-12 text-center text-xs text-gray-500">
            No sales records found for this period.
          </div>
        ) : (
          sales.map((sale) => {
            const time = new Date(sale.createdAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            });
            const isUpi = sale.paymentMethod === 'UPI';
            const isCash = sale.paymentMethod === 'CASH';

            return (
              <button
                key={sale.id}
                onClick={() => setSelectedSale(sale)}
                className="w-full bg-white border border-gray-200 rounded-2xl p-3 shadow-xs flex items-center justify-between text-left hover:border-gray-300 active:scale-98 transition"
              >
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-extrabold text-sm text-gray-900">
                      {sale.invoiceNumber}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        isUpi
                          ? 'bg-blue-100 text-blue-800'
                          : isCash
                          ? 'bg-green-100 text-green-800'
                          : 'bg-purple-100 text-purple-800'
                      }`}
                    >
                      {sale.paymentMethod}
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-500 mt-1">
                    {time} • {sale.items.length} items
                    {sale.user?.name && ` • ${sale.user.name}`}
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <div className="text-right">
                    <div className="font-black text-base text-gray-900">
                      {currency}{Number(sale.total).toFixed(2)}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Receipt Modal for Viewed Sale */}
      <ReceiptModal
        isOpen={!!selectedSale}
        sale={selectedSale}
        onClose={() => setSelectedSale(null)}
        onNewBill={() => setSelectedSale(null)}
      />
    </div>
  );
};

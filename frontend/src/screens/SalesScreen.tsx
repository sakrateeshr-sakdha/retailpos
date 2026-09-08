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
  Lock,
} from 'lucide-react';
import { Sale, SalesSummary } from '../types/index';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ReceiptModal } from '../components/ReceiptModal';
import { NavTab } from '../components/BottomNav';

interface SalesScreenProps {
  onNavigate?: (tab: NavTab) => void;
}

export const SalesScreen: React.FC<SalesScreenProps> = ({ onNavigate }) => {
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
    <div className="min-h-screen pb-24 w-full space-y-4">
      {/* Top Today Summary Cards */}
      <div className="p-4 sm:p-5 bg-green-700 text-white space-y-3 shadow-xs rounded-2xl">
        <div className="flex items-center justify-between text-xs text-green-100">
          <span className="font-semibold uppercase tracking-wider">Today's Sales Summary</span>
          <div className="flex items-center gap-2">
            {onNavigate && (
              <button
                onClick={() => onNavigate('closing')}
                className="bg-white/20 hover:bg-white/30 text-white font-bold px-2.5 py-1 rounded-lg text-xs transition flex items-center gap-1 active:scale-95"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Daily Register Closing</span>
              </button>
            )}
            <button
              onClick={loadSalesData}
              className="p-1 rounded-full hover:bg-green-800 transition"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Amount & Breakdown Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Big Amount Card */}
          <div className="bg-white/10 rounded-2xl p-4 backdrop-blur-xs border border-white/15">
            <div className="text-xs text-green-200 font-medium">Total Sales</div>
            <div className="text-3xl font-black tracking-tight mt-0.5">
              {currency}{(summary?.today?.totalAmount || 0).toFixed(2)}
            </div>
            <div className="text-xs text-green-200 mt-1">
              {summary?.today?.billCount || 0} bills completed today
            </div>
          </div>

          {/* Breakdown Chips (Cash vs UPI) */}
          <div className="sm:col-span-2 grid grid-cols-2 gap-2.5">
            <div className="bg-white/10 rounded-xl p-3 border border-white/10 flex items-center space-x-3">
              <div className="p-2 rounded-lg bg-green-800 text-green-300 flex-shrink-0">
                <Banknote className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[11px] text-green-200">Cash Sales</div>
                <div className="font-bold text-base">
                  {currency}{(summary?.today?.cashAmount || 0).toFixed(0)}
                </div>
              </div>
            </div>

            <div className="bg-white/10 rounded-xl p-3 border border-white/10 flex items-center space-x-3">
              <div className="p-2 rounded-lg bg-blue-800 text-blue-300 flex-shrink-0">
                <QrCode className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[11px] text-green-200">UPI Sales</div>
                <div className="font-bold text-base">
                  {currency}{(summary?.today?.upiAmount || 0).toFixed(0)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Date Range Selector & Search */}
      <div className="p-3 sm:p-4 bg-white rounded-2xl border border-gray-200 shadow-xs space-y-3">
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {(['today', 'yesterday', 'thisWeek', 'thisMonth'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`flex-1 min-w-[80px] py-2 text-xs font-semibold rounded-xl transition capitalize ${
                range === r
                  ? 'bg-green-700 text-white shadow-xs'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {r === 'thisWeek' ? 'This Week' : r === 'thisMonth' ? 'This Month' : r}
            </button>
          ))}
        </div>

        <form onSubmit={handleSearchSubmit} className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search bill number or customer..."
            className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-green-500 transition"
          />
        </form>
      </div>

      {/* Sales History List Grid */}
      <div className="space-y-2">
        <div className="text-xs font-bold text-gray-500 uppercase tracking-wider px-1 flex justify-between">
          <span>Invoices ({sales.length})</span>
          <span className="text-[11px] text-gray-400">Tap to View Receipt</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">

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

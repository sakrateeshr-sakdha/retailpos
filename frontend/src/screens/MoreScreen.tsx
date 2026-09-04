import React, { useState, useEffect } from 'react';
import {
  Store,
  Users,
  Wifi,
  WifiOff,
  RefreshCw,
  LogOut,
  Shield,
  Phone,
  Receipt,
  Check,
  Plus,
  X,
  QrCode,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { db } from '../services/db';

export const MoreScreen: React.FC = () => {
  const { user, shop, isOnline, pendingSalesCount, logout, refreshShop, syncNow } = useAuth();

  // Settings form
  const [shopName, setShopName] = useState(shop?.name || '');
  const [address, setAddress] = useState(shop?.address || '');
  const [phone, setPhone] = useState(shop?.phone || '');
  const [gstNumber, setGstNumber] = useState(shop?.gstNumber || '');
  const [upiId, setUpiId] = useState(shop?.upiId || '');
  const [receiptFooter, setReceiptFooter] = useState(shop?.receiptFooter || '');
  const [isSavingShop, setIsSavingShop] = useState(false);
  const [shopSavedMsg, setShopSavedMsg] = useState(false);

  // Cashiers
  const [cashiers, setCashiers] = useState<any[]>([]);
  const [isAddCashierOpen, setIsAddCashierOpen] = useState(false);
  const [cashierName, setCashierName] = useState('');
  const [cashierUsername, setCashierUsername] = useState('');
  const [cashierPassword, setCashierPassword] = useState('');
  const [syncing, setSyncing] = useState(false);

  const isAdmin = user?.role === 'ADMIN';

  useEffect(() => {
    if (shop) {
      setShopName(shop.name);
      setAddress(shop.address || '');
      setPhone(shop.phone || '');
      setGstNumber(shop.gstNumber || '');
      setUpiId(shop.upiId || '');
      setReceiptFooter(shop.receiptFooter || '');
    }
  }, [shop]);

  const loadCashiers = async () => {
    if (isAdmin && isOnline) {
      try {
        const res = await api.getCashiers();
        setCashiers(res.users);
      } catch (err) {
        console.error('Error fetching cashiers:', err);
      }
    }
  };

  useEffect(() => {
    loadCashiers();
  }, [isAdmin, isOnline]);

  const handleSaveShop = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingShop(true);
    try {
      await api.updateShop({
        name: shopName,
        address,
        phone,
        gstNumber,
        upiId,
        receiptFooter,
      });
      await refreshShop();
      setShopSavedMsg(true);
      setTimeout(() => setShopSavedMsg(false), 3000);
    } catch (err: any) {
      alert(err.message || 'Failed to update shop details');
    } finally {
      setIsSavingShop(false);
    }
  };

  const handleAddCashier = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createCashier({
        name: cashierName,
        username: cashierUsername,
        password: cashierPassword,
      });
      setIsAddCashierOpen(false);
      setCashierName('');
      setCashierUsername('');
      setCashierPassword('');
      await loadCashiers();
      alert('Cashier added successfully!');
    } catch (err: any) {
      alert(err.message || 'Failed to add cashier');
    }
  };

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      const res = await syncNow();
      if (res.count > 0) {
        alert(`Successfully synced ${res.count} sales to the server!`);
      } else {
        alert('All sales are up to date.');
      }
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-28 max-w-lg mx-auto p-4 space-y-4 text-xs">
      {/* User Header Profile */}
      <div className="bg-white border border-gray-200 rounded-3xl p-4 shadow-xs flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 rounded-2xl bg-green-100 text-green-700 flex items-center justify-center font-bold text-lg">
            {user?.name?.[0] || 'U'}
          </div>
          <div>
            <div className="font-extrabold text-base text-gray-900">{user?.name}</div>
            <div className="text-gray-500 flex items-center gap-1.5 mt-0.5">
              <Shield className="w-3.5 h-3.5 text-green-600" />
              <span className="font-semibold text-green-700">{user?.role}</span>
              <span>•</span>
              <span>@{user?.username}</span>
            </div>
          </div>
        </div>

        <button
          onClick={logout}
          className="p-2.5 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 active:scale-95 transition"
          title="Sign Out"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>

      {/* Offline Status & Sync Card */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {isOnline ? (
              <Wifi className="w-5 h-5 text-green-600" />
            ) : (
              <WifiOff className="w-5 h-5 text-red-500" />
            )}
            <div>
              <div className="font-bold text-sm text-gray-900">
                Network: {isOnline ? 'Online (Connected)' : 'Offline'}
              </div>
              <div className="text-[11px] text-gray-500">
                {pendingSalesCount > 0
                  ? `${pendingSalesCount} bills pending sync`
                  : 'All local offline bills synced'}
              </div>
            </div>
          </div>

          <button
            onClick={handleManualSync}
            disabled={syncing || !isOnline}
            className="flex items-center space-x-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-3 py-2 rounded-xl font-bold shadow-xs active:scale-95 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {/* Cashier Management (Admin Only) */}
      {isAdmin && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Users className="w-5 h-5 text-green-600" />
              <div>
                <div className="font-bold text-sm text-gray-900">Staff / Cashiers</div>
                <div className="text-[11px] text-gray-500">Accounts authorized to use POS</div>
              </div>
            </div>

            <button
              onClick={() => setIsAddCashierOpen(true)}
              className="p-2 bg-green-50 text-green-700 hover:bg-green-100 rounded-xl font-semibold flex items-center gap-1 active:scale-95 transition"
            >
              <Plus className="w-4 h-4" />
              <span>Add</span>
            </button>
          </div>

          <div className="divide-y divide-gray-100">
            {cashiers.map((c) => (
              <div key={c.id} className="py-2 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-gray-900">{c.name}</div>
                  <div className="text-[11px] text-gray-400">@{c.username}</div>
                </div>
                <span className="text-[10px] font-bold uppercase bg-gray-100 px-2 py-0.5 rounded text-gray-600">
                  {c.role}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Read-Only Shop Profile & Merchant UPI for Cashiers */}
      {!isAdmin && shop && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs space-y-3">
          <div className="flex items-center space-x-2">
            <Store className="w-5 h-5 text-green-600" />
            <div>
              <div className="font-bold text-sm text-gray-900">Shop Profile & Merchant UPI</div>
              <div className="text-[11px] text-gray-500">Configured by Shop Administrator</div>
            </div>
          </div>

          <div className="space-y-2 pt-1 divide-y divide-gray-100 text-xs">
            <div className="flex justify-between items-center py-1.5">
              <span className="text-gray-500">Shop Name</span>
              <span className="font-semibold text-gray-900">{shop.name}</span>
            </div>
            <div className="flex justify-between items-center py-1.5">
              <span className="text-gray-500 flex items-center gap-1">
                <QrCode className="w-3.5 h-3.5 text-blue-600" />
                <span>Merchant UPI ID</span>
              </span>
              <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                {shop.upiId || 'Not configured'}
              </span>
            </div>
            {shop.phone && (
              <div className="flex justify-between items-center py-1.5">
                <span className="text-gray-500">Phone</span>
                <span className="font-medium text-gray-800">{shop.phone}</span>
              </div>
            )}
            {shop.gstNumber && (
              <div className="flex justify-between items-center py-1.5">
                <span className="text-gray-500">GSTIN</span>
                <span className="font-mono text-gray-800">{shop.gstNumber}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Shop Profile & Settings */}
      {isAdmin && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs space-y-3">
          <div className="flex items-center space-x-2">
            <Store className="w-5 h-5 text-green-600" />
            <div>
              <div className="font-bold text-sm text-gray-900">Shop Profile & Bill Settings</div>
              <div className="text-[11px] text-gray-500">Appears on receipts and header</div>
            </div>
          </div>

          {shopSavedMsg && (
            <div className="bg-green-50 border border-green-200 text-green-800 p-2.5 rounded-xl font-semibold flex items-center gap-1.5">
              <Check className="w-4 h-4" />
              <span>Shop settings updated successfully!</span>
            </div>
          )}

          <form onSubmit={handleSaveShop} className="space-y-3">
            <div>
              <label className="font-semibold text-gray-700 block mb-1">Shop Name</label>
              <input
                type="text"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900"
                required
              />
            </div>

            <div>
              <label className="font-semibold text-gray-700 block mb-1">Shop Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="font-semibold text-gray-700 block mb-1">Phone</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900"
                />
              </div>
              <div>
                <label className="font-semibold text-gray-700 block mb-1">GST Number</label>
                <input
                  type="text"
                  value={gstNumber}
                  onChange={(e) => setGstNumber(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 uppercase"
                />
              </div>
            </div>

            <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-3 space-y-1.5">
              <label className="font-bold text-gray-800 text-xs flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <QrCode className="w-3.5 h-3.5 text-blue-600" />
                  <span>Merchant UPI ID</span>
                </span>
                <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-semibold">
                  Dynamic QR Checkout
                </span>
              </label>
              <input
                type="text"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder="e.g. yourshop@okhdfcbank, 9876543210@paytm"
                className="w-full bg-white border border-blue-300 rounded-xl px-3 py-2 text-sm text-gray-900 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <div className="text-[11px] text-gray-600 flex items-center justify-between pt-0.5">
                <span>Active in System:</span>
                <span className="font-mono font-bold text-blue-900">{shop?.upiId || upiId || 'Not configured'}</span>
              </div>
              <p className="text-[10px] text-gray-500">
                This Merchant UPI ID is configured here and automatically embedded into dynamic QR codes at checkout without being displayed on the customer checkout screen.
              </p>
            </div>

            <div>
              <label className="font-semibold text-gray-700 block mb-1">Receipt Footer Note</label>
              <input
                type="text"
                value={receiptFooter}
                onChange={(e) => setReceiptFooter(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900"
              />
            </div>

            <button
              type="submit"
              disabled={isSavingShop}
              className="w-full bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-xl font-bold text-sm shadow-md active:scale-98 transition flex items-center justify-center space-x-1.5"
            >
              <Check className="w-4 h-4" />
              <span>{isSavingShop ? 'Saving...' : 'Save Shop Settings'}</span>
            </button>
          </form>
        </div>
      )}

      {/* Add Cashier Modal */}
      {isAddCashierOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-sm sm:rounded-2xl rounded-t-2xl p-4 shadow-2xl space-y-3 animate-in slide-in-from-bottom duration-200">
            <div className="flex justify-between items-center pb-2 border-b border-gray-100">
              <h3 className="font-bold text-sm text-gray-900">Create Cashier Account</h3>
              <button
                onClick={() => setIsAddCashierOpen(false)}
                className="p-1 rounded-full text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddCashier} className="space-y-3">
              <div>
                <label className="font-semibold text-gray-700 block mb-1">Cashier Full Name</label>
                <input
                  type="text"
                  value={cashierName}
                  onChange={(e) => setCashierName(e.target.value)}
                  placeholder="e.g. Ramesh Kumar"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900"
                  required
                />
              </div>

              <div>
                <label className="font-semibold text-gray-700 block mb-1">Login Username</label>
                <input
                  type="text"
                  value={cashierUsername}
                  onChange={(e) => setCashierUsername(e.target.value)}
                  placeholder="e.g. ramesh1"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900"
                  required
                />
              </div>

              <div>
                <label className="font-semibold text-gray-700 block mb-1">Password</label>
                <input
                  type="password"
                  value={cashierPassword}
                  onChange={(e) => setCashierPassword(e.target.value)}
                  placeholder="At least 4 characters"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-xl font-bold text-sm shadow-md active:scale-98 transition"
              >
                Create Cashier Account
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

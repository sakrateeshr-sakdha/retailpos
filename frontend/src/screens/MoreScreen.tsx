import React, { useState, useEffect, useRef } from 'react';
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
  Download,
  Upload,
  Database,
  FileJson,
  Percent,
  CheckCircle2,
  AlertTriangle,
  Lock,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { NavTab } from '../components/BottomNav';

interface MoreScreenProps {
  onNavigate?: (tab: NavTab) => void;
}

export const MoreScreen: React.FC<MoreScreenProps> = ({ onNavigate }) => {
  const { user, shop, isOnline, pendingSalesCount, logout, refreshShop, syncNow } = useAuth();

  // Shop Settings form
  const [shopName, setShopName] = useState(shop?.name || '');
  const [address, setAddress] = useState(shop?.address || '');
  const [phone, setPhone] = useState(shop?.phone || '');
  const [gstNumber, setGstNumber] = useState(shop?.gstNumber || '');
  const [upiId, setUpiId] = useState(shop?.upiId || '');
  const [receiptFooter, setReceiptFooter] = useState(shop?.receiptFooter || '');
  const [isSavingShop, setIsSavingShop] = useState(false);
  const [shopSavedMsg, setShopSavedMsg] = useState(false);

  // GST Configuration
  const [gstEnabled, setGstEnabled] = useState(shop?.gstEnabled || false);
  const [gstType, setGstType] = useState<'INCLUSIVE' | 'EXCLUSIVE'>((shop?.gstType as any) || 'INCLUSIVE');
  const [defaultCgstRate, setDefaultCgstRate] = useState(shop?.defaultCgstRate ? String(shop.defaultCgstRate) : '2.5');
  const [defaultSgstRate, setDefaultSgstRate] = useState(shop?.defaultSgstRate ? String(shop.defaultSgstRate) : '2.5');
  const [defaultIgstRate, setDefaultIgstRate] = useState(shop?.defaultIgstRate ? String(shop.defaultIgstRate) : '5.0');
  const [defaultHsnCode, setDefaultHsnCode] = useState(shop?.defaultHsnCode || '');

  // Cashiers
  const [cashiers, setCashiers] = useState<any[]>([]);
  const [isAddCashierOpen, setIsAddCashierOpen] = useState(false);
  const [cashierName, setCashierName] = useState('');
  const [cashierUsername, setCashierUsername] = useState('');
  const [cashierPassword, setCashierPassword] = useState('');
  const [syncing, setSyncing] = useState(false);

  // Backup & Restore
  const [backupStatus, setBackupStatus] = useState<any>(null);
  const [loadingBackup, setLoadingBackup] = useState(false);
  const [exportingBackup, setExportingBackup] = useState(false);
  const [restoringBackup, setRestoringBackup] = useState(false);
  const [backupMsg, setBackupMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = user?.role === 'ADMIN';

  useEffect(() => {
    if (shop) {
      setShopName(shop.name);
      setAddress(shop.address || '');
      setPhone(shop.phone || '');
      setGstNumber(shop.gstNumber || '');
      setUpiId(shop.upiId || '');
      setReceiptFooter(shop.receiptFooter || '');
      setGstEnabled(shop.gstEnabled || false);
      setGstType((shop.gstType as any) || 'INCLUSIVE');
      setDefaultCgstRate(shop.defaultCgstRate ? String(shop.defaultCgstRate) : '2.5');
      setDefaultSgstRate(shop.defaultSgstRate ? String(shop.defaultSgstRate) : '2.5');
      setDefaultIgstRate(shop.defaultIgstRate ? String(shop.defaultIgstRate) : '5.0');
      setDefaultHsnCode(shop.defaultHsnCode || '');
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

  const loadBackupStatus = async () => {
    if (isAdmin && isOnline) {
      try {
        setLoadingBackup(true);
        const res = await api.getBackupStatus();
        setBackupStatus(res.status);
      } catch (err) {
        console.error('Error fetching backup status:', err);
      } finally {
        setLoadingBackup(false);
      }
    }
  };

  useEffect(() => {
    loadCashiers();
    loadBackupStatus();
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
        gstEnabled,
        gstType,
        defaultCgstRate: defaultCgstRate ? Number(defaultCgstRate) : undefined,
        defaultSgstRate: defaultSgstRate ? Number(defaultSgstRate) : undefined,
        defaultIgstRate: defaultIgstRate ? Number(defaultIgstRate) : undefined,
        defaultHsnCode: defaultHsnCode || undefined,
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

  // Export Backup
  const handleExportBackup = async () => {
    try {
      setExportingBackup(true);
      setBackupMsg(null);
      const data = await api.exportBackup();
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeShopName = (shop?.name || 'retailpos').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      const dateStr = new Date().toISOString().split('T')[0];
      a.download = `${safeShopName}_backup_${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setBackupMsg({ type: 'success', text: 'Backup exported and downloaded successfully!' });
      await loadBackupStatus();
    } catch (err: any) {
      setBackupMsg({ type: 'error', text: err.message || 'Failed to export backup' });
    } finally {
      setExportingBackup(false);
    }
  };

  // Restore Backup
  const handleRestoreFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const backupData = JSON.parse(text);

        if (!backupData.version || !backupData.checksum || !backupData.data) {
          alert('Invalid backup file! File must be an authentic RetailPOS backup JSON.');
          return;
        }

        const confirmMsg = `WARNING: Restoring will overwrite existing products, sales, and customers with the contents of this backup file!\n\nShop: ${backupData.shop?.name || 'Unknown'}\nExported: ${backupData.exportedAt || 'Unknown'}\nProducts: ${backupData.metadata?.counts?.products || 0}\nCustomers: ${backupData.metadata?.counts?.customers || 0}\nSales: ${backupData.metadata?.counts?.sales || 0}\n\nAre you sure you want to proceed?`;
        if (!confirm(confirmMsg)) {
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
        }

        setRestoringBackup(true);
        setBackupMsg(null);
        const res = await api.restoreBackup(backupData);
        setBackupMsg({
          type: 'success',
          text: `Backup restored successfully! Restored ${res.restored.products} products, ${res.restored.customers} customers, and ${res.restored.sales} sales.`,
        });
        await refreshShop();
        await loadBackupStatus();
      } catch (err: any) {
        console.error('Restore error:', err);
        setBackupMsg({ type: 'error', text: err.message || 'Failed to restore backup' });
      } finally {
        setRestoringBackup(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="min-h-screen pb-28 w-full space-y-4 text-xs">
      {/* User Header Profile */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 shadow-xs flex items-center justify-between">
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

      {/* Two Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* Left Column */}
        <div className="space-y-4">
          {/* Daily Cash Closing Quick Navigation Card */}
          <div className="bg-gradient-to-r from-amber-500 to-amber-600 rounded-2xl p-4 text-white shadow-xs flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                <Lock className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="font-extrabold text-sm">Daily Cash Closing</div>
                <div className="text-[11px] text-amber-100">Count physical drawer cash and reconcile day's sales</div>
              </div>
            </div>
            {onNavigate && (
              <button
                onClick={() => onNavigate('closing')}
                className="bg-white text-amber-800 font-bold px-3 py-2 rounded-xl text-xs hover:bg-amber-50 active:scale-95 transition flex items-center gap-1.5 shadow-sm"
              >
                <span>Open Register</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
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

          {/* Backup & Disaster Recovery (Admin Only) */}
          {isAdmin && (
            <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Database className="w-5 h-5 text-indigo-600" />
                  <div>
                    <div className="font-bold text-sm text-gray-900">Backup & Disaster Recovery</div>
                    <div className="text-[11px] text-gray-500">Export and restore shop data safely</div>
                  </div>
                </div>

                <button
                  onClick={loadBackupStatus}
                  disabled={loadingBackup}
                  className="text-gray-400 hover:text-gray-600 p-1"
                  title="Refresh backup status"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingBackup ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {backupMsg && (
                <div
                  className={`p-2.5 rounded-xl text-xs flex items-center gap-2 ${
                    backupMsg.type === 'success'
                      ? 'bg-green-50 text-green-800 border border-green-200'
                      : 'bg-red-50 text-red-800 border border-red-200'
                  }`}
                >
                  {backupMsg.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  )}
                  <span>{backupMsg.text}</span>
                </div>
              )}

              {/* Status Stats */}
              <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-3 space-y-1.5">
                <div className="flex justify-between items-center text-indigo-950 font-semibold">
                  <span>Last Exported Backup:</span>
                  <span className="font-mono text-indigo-700">
                    {backupStatus?.lastBackupAt
                      ? new Date(backupStatus.lastBackupAt).toLocaleString()
                      : shop?.lastBackupAt
                      ? new Date(shop.lastBackupAt).toLocaleString()
                      : 'Never backed up'}
                  </span>
                </div>
                {backupStatus?.counts && (
                  <div className="flex items-center gap-3 text-[11px] text-indigo-700 pt-1 border-t border-indigo-200/50">
                    <span>📦 {backupStatus.counts.products} Products</span>
                    <span>👥 {backupStatus.counts.customers} Customers</span>
                    <span>🧾 {backupStatus.counts.sales} Sales</span>
                  </div>
                )}
              </div>

              {/* Backup Actions */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={handleExportBackup}
                  disabled={exportingBackup}
                  className="flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-2.5 rounded-xl font-bold active:scale-98 transition shadow-xs"
                >
                  <Download className={`w-4 h-4 ${exportingBackup ? 'animate-bounce' : ''}`} />
                  <span>{exportingBackup ? 'Exporting...' : 'Export Backup'}</span>
                </button>

                <div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".json,application/json"
                    onChange={handleRestoreFileChange}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={restoringBackup}
                    className="w-full flex items-center justify-center gap-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white py-2.5 rounded-xl font-bold active:scale-98 transition shadow-xs"
                  >
                    <Upload className={`w-4 h-4 ${restoringBackup ? 'animate-spin' : ''}`} />
                    <span>{restoringBackup ? 'Restoring...' : 'Restore Backup'}</span>
                  </button>
                </div>
              </div>

              <p className="text-[10px] text-gray-500 italic">
                * Backups contain complete JSON snapshot with SHA-256 integrity verification. Keep a copy in Google Drive or offline USB before software updates.
              </p>
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
        </div>

        {/* Right Column (Settings & GST) */}
        <div>
          {isAdmin && (
            <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs space-y-4">
              <div className="flex items-center space-x-2">
                <Store className="w-5 h-5 text-green-600" />
                <div>
                  <div className="font-bold text-sm text-gray-900">Shop Profile & Tax Settings</div>
                  <div className="text-[11px] text-gray-500">Configure receipt info, UPI payments & GST rates</div>
                </div>
              </div>

              {shopSavedMsg && (
                <div className="bg-green-50 border border-green-200 text-green-800 p-2.5 rounded-xl font-semibold flex items-center gap-1.5">
                  <Check className="w-4 h-4" />
                  <span>Shop settings updated successfully!</span>
                </div>
              )}

              <form onSubmit={handleSaveShop} className="space-y-4">
                {/* Basic Shop Info */}
                <div className="space-y-3">
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
                      <label className="font-semibold text-gray-700 block mb-1">Receipt Footer Note</label>
                      <input
                        type="text"
                        value={receiptFooter}
                        onChange={(e) => setReceiptFooter(e.target.value)}
                        placeholder="Thank you! Visit again"
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900"
                      />
                    </div>
                  </div>
                </div>

                {/* Merchant UPI Configuration */}
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
                  <p className="text-[10px] text-gray-500">
                    Enables cashiers to accept fast customer UPI scans with pre-filled amount and invoice number.
                  </p>
                </div>

                {/* GST Tax Configuration Section */}
                <div className="border border-gray-200 rounded-xl p-3.5 space-y-3 bg-gray-50/50">
                  <div className="flex items-center justify-between pb-2 border-b border-gray-200">
                    <div className="flex items-center space-x-2">
                      <Percent className="w-4 h-4 text-green-700" />
                      <div>
                        <div className="font-bold text-xs text-gray-900">GST Configuration</div>
                        <div className="text-[10px] text-gray-500">Goods & Services Tax billing</div>
                      </div>
                    </div>

                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={gstEnabled}
                        onChange={(e) => setGstEnabled(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-600"></div>
                      <span className="ml-2 text-xs font-bold text-gray-700">
                        {gstEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </label>
                  </div>

                  {gstEnabled ? (
                    <div className="space-y-3 pt-1">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="font-semibold text-gray-700 block mb-1">GSTIN (Shop GST Number)</label>
                          <input
                            type="text"
                            value={gstNumber}
                            onChange={(e) => setGstNumber(e.target.value)}
                            placeholder="e.g. 27AAAAA0000A1Z5"
                            className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 uppercase font-mono"
                          />
                        </div>
                        <div>
                          <label className="font-semibold text-gray-700 block mb-1">Tax Calculation Mode</label>
                          <select
                            value={gstType}
                            onChange={(e) => setGstType(e.target.value as any)}
                            className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900"
                          >
                            <option value="INCLUSIVE">Tax Inclusive (Price includes GST)</option>
                            <option value="EXCLUSIVE">Tax Exclusive (GST added to price)</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-2">
                        <div>
                          <label className="font-semibold text-gray-700 block mb-1">CGST %</label>
                          <input
                            type="number"
                            step="0.01"
                            value={defaultCgstRate}
                            onChange={(e) => setDefaultCgstRate(e.target.value)}
                            placeholder="2.5"
                            className="w-full bg-white border border-gray-200 rounded-xl px-2.5 py-2 text-sm text-gray-900"
                          />
                        </div>
                        <div>
                          <label className="font-semibold text-gray-700 block mb-1">SGST %</label>
                          <input
                            type="number"
                            step="0.01"
                            value={defaultSgstRate}
                            onChange={(e) => setDefaultSgstRate(e.target.value)}
                            placeholder="2.5"
                            className="w-full bg-white border border-gray-200 rounded-xl px-2.5 py-2 text-sm text-gray-900"
                          />
                        </div>
                        <div>
                          <label className="font-semibold text-gray-700 block mb-1">IGST %</label>
                          <input
                            type="number"
                            step="0.01"
                            value={defaultIgstRate}
                            onChange={(e) => setDefaultIgstRate(e.target.value)}
                            placeholder="5.0"
                            className="w-full bg-white border border-gray-200 rounded-xl px-2.5 py-2 text-sm text-gray-900"
                          />
                        </div>
                        <div>
                          <label className="font-semibold text-gray-700 block mb-1">Default HSN</label>
                          <input
                            type="text"
                            value={defaultHsnCode}
                            onChange={(e) => setDefaultHsnCode(e.target.value)}
                            placeholder="0401"
                            className="w-full bg-white border border-gray-200 rounded-xl px-2.5 py-2 text-sm text-gray-900 font-mono"
                          />
                        </div>
                      </div>

                      <p className="text-[10px] text-gray-500">
                        When GST is enabled, receipts will display GSTIN, HSN codes, and CGST/SGST tax breakdown. Small shops without GST can keep this toggle disabled for simpler, faster bills.
                      </p>
                    </div>
                  ) : (
                    <div className="text-[11px] text-gray-500 italic">
                      GST is currently disabled. All receipts and bills operate in simple non-tax mode.
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isSavingShop}
                  className="w-full bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-xl font-bold text-sm shadow-md active:scale-98 transition flex items-center justify-center space-x-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSavingShop ? 'Saving Settings...' : 'Save All Settings'}</span>
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Add Cashier Modal */}
      {isAddCashierOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-md sm:rounded-2xl rounded-t-2xl p-4 sm:p-5 shadow-2xl space-y-3 animate-in slide-in-from-bottom duration-200">
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

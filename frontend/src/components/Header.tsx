import React, { useState } from 'react';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Store,
  UserCheck,
  ShoppingCart,
  Package,
  BarChart3,
  ClipboardList,
  Settings,
  LogOut,
  Users,
  Lock,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { NavTab } from './BottomNav';

interface HeaderProps {
  currentTab?: NavTab;
  onSelectTab?: (tab: NavTab) => void;
}

export const Header: React.FC<HeaderProps> = ({ currentTab, onSelectTab }) => {
  const { shop, user, isOnline, pendingSalesCount, syncNow, logout } = useAuth();
  const { itemCount } = useCart();
  const [syncing, setSyncing] = useState(false);

  const handleManualSync = async () => {
    if (syncing || !isOnline) return;
    setSyncing(true);
    try {
      const res = await syncNow();
      if (res.count > 0) {
        alert(`Synced ${res.count} pending sales to server!`);
      }
    } finally {
      setSyncing(false);
    }
  };

  const navItems: { id: NavTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    {
      id: 'billing',
      label: 'Billing',
      icon: <ShoppingCart className="w-4 h-4" />,
      badge: itemCount > 0 ? itemCount : undefined,
    },
    {
      id: 'products',
      label: 'Products',
      icon: <Package className="w-4 h-4" />,
    },
    {
      id: 'customers',
      label: 'Customers',
      icon: <Users className="w-4 h-4" />,
    },
    {
      id: 'sales',
      label: 'Sales',
      icon: <BarChart3 className="w-4 h-4" />,
    },
    {
      id: 'stock',
      label: 'Stock',
      icon: <ClipboardList className="w-4 h-4" />,
    },
    {
      id: 'closing',
      label: 'Cash Closing',
      icon: <Lock className="w-4 h-4" />,
    },
    {
      id: 'more',
      label: 'Settings',
      icon: <Settings className="w-4 h-4" />,
      badge: pendingSalesCount > 0 ? pendingSalesCount : undefined,
    },
  ];

  return (
    <header className="sticky top-0 z-30 bg-green-700 text-white shadow-md w-full">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 flex items-center justify-between gap-3">
        {/* Shop Name & User Info */}
        <div className="flex items-center space-x-2.5 min-w-0 flex-shrink-0">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-green-800 flex items-center justify-center flex-shrink-0 shadow-inner">
            <Store className="w-4 h-4 sm:w-5 sm:h-5 text-green-200" />
          </div>
          <div className="min-w-0">
            <h1 className="font-extrabold text-sm sm:text-base leading-tight truncate">
              {shop?.name || 'Grocery POS'}
            </h1>
            <div className="flex items-center space-x-1.5 text-[11px] text-green-100">
              <UserCheck className="w-3 h-3 inline flex-shrink-0" />
              <span className="truncate">{user?.name || user?.username || 'Cashier'}</span>
              <span className="hidden sm:inline text-green-300">•</span>
              <span className="hidden sm:inline uppercase text-[10px] tracking-wider text-green-200 font-semibold">
                {user?.role}
              </span>
            </div>
          </div>
        </div>

        {/* Desktop / Tablet Navigation Bar */}
        {onSelectTab && (
          <nav className="hidden md:flex items-center space-x-1 bg-green-800/60 p-1 rounded-xl border border-green-600/50">
            {navItems.map((tab) => {
              const isActive = currentTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onSelectTab(tab.id)}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition relative ${
                    isActive
                      ? 'bg-white text-green-800 shadow-sm'
                      : 'text-green-100 hover:text-white hover:bg-green-700/50'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && (
                    <span
                      className={`text-[10px] font-black rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center ${
                        isActive ? 'bg-green-700 text-white' : 'bg-red-500 text-white animate-pulse'
                      }`}
                    >
                      {tab.badge > 99 ? '99+' : tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        )}

        {/* Right Status Indicators & Quick Actions */}
        <div className="flex items-center space-x-2 flex-shrink-0">
          {pendingSalesCount > 0 && (
            <button
              onClick={handleManualSync}
              disabled={syncing || !isOnline}
              className="flex items-center space-x-1 bg-amber-500 hover:bg-amber-600 text-white text-xs px-2.5 py-1 rounded-lg font-semibold shadow-xs transition active:scale-95"
            >
              <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
              <span>{pendingSalesCount} sync</span>
            </button>
          )}

          <div
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${
              isOnline ? 'bg-green-800 text-green-100' : 'bg-red-600 text-white animate-pulse'
            }`}
          >
            {isOnline ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-green-300" />
                <span className="text-[11px] hidden sm:inline">Online</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-white" />
                <span className="text-[11px]">Offline</span>
              </>
            )}
          </div>

          <button
            onClick={logout}
            className="hidden md:flex items-center justify-center p-1.5 rounded-lg bg-green-800/80 hover:bg-red-600 text-green-100 hover:text-white transition"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};

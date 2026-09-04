import React, { useState } from 'react';
import { Wifi, WifiOff, RefreshCw, Store, UserCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const Header: React.FC = () => {
  const { shop, user, isOnline, pendingSalesCount, syncNow } = useAuth();
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

  return (
    <header className="sticky top-0 z-20 bg-green-700 text-white shadow-md max-w-lg mx-auto">
      <div className="px-4 py-2.5 flex items-center justify-between">
        {/* Shop Name & Logo */}
        <div className="flex items-center space-x-2 overflow-hidden">
          <div className="w-8 h-8 rounded-lg bg-green-800 flex items-center justify-center flex-shrink-0">
            <Store className="w-5 h-5 text-green-200" />
          </div>
          <div className="overflow-hidden">
            <h1 className="font-bold text-base leading-tight truncate">
              {shop?.name || 'Grocery POS'}
            </h1>
            <div className="flex items-center space-x-1.5 text-[11px] text-green-100">
              <UserCheck className="w-3 h-3 inline" />
              <span className="truncate">{user?.name || user?.username || 'Cashier'}</span>
            </div>
          </div>
        </div>

        {/* Status Indicators */}
        <div className="flex items-center space-x-2">
          {pendingSalesCount > 0 && (
            <button
              onClick={handleManualSync}
              disabled={syncing || !isOnline}
              className="flex items-center space-x-1 bg-amber-500 hover:bg-amber-600 text-white text-xs px-2 py-1 rounded-full font-medium shadow-sm transition active:scale-95"
            >
              <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
              <span>{pendingSalesCount} sync</span>
            </button>
          )}

          <div
            className={`flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-semibold ${
              isOnline ? 'bg-green-800/80 text-green-100' : 'bg-red-600 text-white animate-pulse'
            }`}
          >
            {isOnline ? (
              <>
                <Wifi className="w-3 h-3 text-green-300" />
                <span className="text-[11px]">Online</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3 text-white" />
                <span className="text-[11px]">Offline</span>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

import React, { useState } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const OfflineBanner: React.FC = () => {
  const { isOnline, pendingSalesCount, syncNow } = useAuth();
  const [syncing, setSyncing] = useState(false);

  if (isOnline && pendingSalesCount === 0) {
    return null;
  }

  const handleSync = async () => {
    if (syncing || !isOnline) return;
    setSyncing(true);
    try {
      const res = await syncNow();
      if (res.count > 0) {
        alert(`Successfully synced ${res.count} bills!`);
      }
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="sticky top-0 z-30 bg-amber-500 text-white text-xs px-3 py-1.5 flex items-center justify-between shadow-xs">
      <div className="flex items-center space-x-1.5">
        {!isOnline ? (
          <>
            <WifiOff className="w-3.5 h-3.5" />
            <span className="font-semibold">Offline Mode</span>
            <span className="opacity-90">• Bills queued locally</span>
          </>
        ) : (
          <>
            <span className="font-semibold">{pendingSalesCount} Offline Bill(s)</span>
            <span className="opacity-90">• Ready to sync</span>
          </>
        )}
      </div>

      {pendingSalesCount > 0 && isOnline && (
        <button
          onClick={handleSync}
          disabled={syncing}
          className="bg-amber-700 hover:bg-amber-800 text-white font-bold px-2 py-0.5 rounded text-[11px] flex items-center space-x-1 active:scale-95 transition"
        >
          <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
          <span>Sync Now</span>
        </button>
      )}
    </div>
  );
};

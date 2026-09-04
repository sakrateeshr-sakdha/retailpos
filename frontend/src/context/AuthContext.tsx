import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Shop } from '../types/index';
import { api } from '../services/api';
import { db } from '../services/db';
import { syncPendingSales } from '../services/sync';

interface AuthContextType {
  user: User | null;
  shop: Shop | null;
  token: string | null;
  loading: boolean;
  isOnline: boolean;
  pendingSalesCount: number;
  login: (credentials: { username: string; password: string }) => Promise<void>;
  logout: () => void;
  refreshShop: () => Promise<void>;
  syncNow: () => Promise<{ success: boolean; count: number }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('retailpos_token'));
  const [loading, setLoading] = useState<boolean>(true);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [pendingSalesCount, setPendingSalesCount] = useState<number>(0);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Auto-trigger sync when returning online
      syncPendingSales().then((res) => {
        if (res.count > 0) {
          updatePendingCount();
        }
      });
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const updatePendingCount = async () => {
    try {
      const count = await db.pendingSales.count();
      setPendingSalesCount(count);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    updatePendingCount();
    const interval = setInterval(updatePendingCount, 10000);
    return () => clearInterval(interval);
  }, []);

  // Check auth session
  useEffect(() => {
    const initAuth = async () => {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const data = await api.getMe();
        setUser(data.user);
        setShop(data.shop);
      } catch (err) {
        console.warn('Session expired or offline, checking cached credentials');
        localStorage.removeItem('retailpos_token');
        setToken(null);
        setUser(null);
        setShop(null);
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, [token]);

  const login = async (credentials: { username: string; password: string }) => {
    const data = await api.login(credentials);
    localStorage.setItem('retailpos_token', data.token);
    setToken(data.token);
    setUser(data.user);
    setShop(data.shop);
  };

  const logout = () => {
    localStorage.removeItem('retailpos_token');
    setToken(null);
    setUser(null);
    setShop(null);
  };

  const refreshShop = async () => {
    try {
      const data = await api.getShop();
      setShop(data.shop);
    } catch (e) {
      console.error(e);
    }
  };

  const syncNow = async () => {
    const res = await syncPendingSales();
    await updatePendingCount();
    return res;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        shop,
        token,
        loading,
        isOnline,
        pendingSalesCount,
        login,
        logout,
        refreshShop,
        syncNow,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

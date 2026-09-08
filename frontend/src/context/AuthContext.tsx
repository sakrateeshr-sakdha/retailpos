import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Shop } from '../types/index';
import { api, OnboardPayload } from '../services/api';
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
  onboard: (data: OnboardPayload) => Promise<void>;
  logout: () => void;
  refreshShop: () => Promise<void>;
  syncNow: () => Promise<{ success: boolean; count: number }>;
}

const CACHE_KEYS = {
  TOKEN: 'retailpos_token',
  OFFLINE_USER: 'retailpos_offline_user',
  OFFLINE_SHOP: 'retailpos_offline_shop',
  AUTH_TIMESTAMP: 'retailpos_auth_timestamp',
};

function saveOfflineSession(token: string, user: User, shop: Shop) {
  try {
    localStorage.setItem(CACHE_KEYS.TOKEN, token);
    localStorage.setItem(CACHE_KEYS.OFFLINE_USER, JSON.stringify(user));
    localStorage.setItem(CACHE_KEYS.OFFLINE_SHOP, JSON.stringify(shop));
    localStorage.setItem(CACHE_KEYS.AUTH_TIMESTAMP, Date.now().toString());
  } catch (err) {
    console.warn('Failed to cache offline session in localStorage', err);
  }
}

function clearOfflineSession() {
  try {
    localStorage.removeItem(CACHE_KEYS.TOKEN);
    localStorage.removeItem(CACHE_KEYS.OFFLINE_USER);
    localStorage.removeItem(CACHE_KEYS.OFFLINE_SHOP);
    localStorage.removeItem(CACHE_KEYS.AUTH_TIMESTAMP);
  } catch (err) {
    console.warn('Failed to clear offline session', err);
  }
}

function loadOfflineSession(): { token: string | null; user: User | null; shop: Shop | null } {
  try {
    const token = localStorage.getItem(CACHE_KEYS.TOKEN);
    const userStr = localStorage.getItem(CACHE_KEYS.OFFLINE_USER);
    const shopStr = localStorage.getItem(CACHE_KEYS.OFFLINE_SHOP);
    const user = userStr ? JSON.parse(userStr) : null;
    const shop = shopStr ? JSON.parse(shopStr) : null;
    return { token, user, shop };
  } catch {
    return { token: null, user: null, shop: null };
  }
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initialSession = loadOfflineSession();
  const [user, setUser] = useState<User | null>(initialSession.user);
  const [shop, setShop] = useState<Shop | null>(initialSession.shop);
  const [token, setToken] = useState<string | null>(initialSession.token);
  const [loading, setLoading] = useState<boolean>(!initialSession.user && !!initialSession.token);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [pendingSalesCount, setPendingSalesCount] = useState<number>(0);

  // Monitor online status & revalidate session
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Revalidate session with server when returning online
      const currentToken = localStorage.getItem(CACHE_KEYS.TOKEN);
      if (currentToken) {
        api.getMe()
          .then((data) => {
            setUser(data.user);
            setShop(data.shop);
            saveOfflineSession(currentToken, data.user, data.shop);
          })
          .catch((err: any) => {
            if (err.status === 401 || err.message?.includes('401') || err.message?.includes('Session expired')) {
              clearOfflineSession();
              setToken(null);
              setUser(null);
              setShop(null);
            }
          });
      }

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

      // If device is offline, retain the cached offline session without clearing credentials
      if (!navigator.onLine) {
        setLoading(false);
        return;
      }

      try {
        const data = await api.getMe();
        setUser(data.user);
        setShop(data.shop);
        saveOfflineSession(token, data.user, data.shop);
      } catch (err: any) {
        // Only log out if genuinely rejected by the server with 401 Unauthorized
        const isUnauthorized =
          err.status === 401 ||
          err.message?.includes('401') ||
          err.message?.includes('Authentication required') ||
          err.message?.includes('Session expired');

        if (isUnauthorized) {
          clearOfflineSession();
          setToken(null);
          setUser(null);
          setShop(null);
        } else {
          console.warn('Network issue during session validation; retaining offline session:', err.message);
        }
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, [token]);

  const login = async (credentials: { username: string; password: string }) => {
    const data = await api.login(credentials);
    saveOfflineSession(data.token, data.user, data.shop);
    setToken(data.token);
    setUser(data.user);
    setShop(data.shop);
  };

  const onboard = async (payload: OnboardPayload) => {
    const data = await api.onboard(payload);
    saveOfflineSession(data.token, data.user, data.shop);
    setToken(data.token);
    setUser(data.user);
    setShop(data.shop);
  };

  const logout = () => {
    clearOfflineSession();
    setToken(null);
    setUser(null);
    setShop(null);
  };

  const refreshShop = async () => {
    try {
      const data = await api.getShop();
      setShop(data.shop);
      if (token && user) {
        saveOfflineSession(token, user, data.shop);
      }
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
        onboard,
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

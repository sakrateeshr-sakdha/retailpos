import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { User, Shop } from '../types/index';
import { api } from '../api/index';
import { STORAGE_KEYS } from '../utils/constants';
import { saveShopConfig, getLocalShopConfig } from '../database/index';
import { syncService } from '../sync/SyncService';

interface AuthContextType {
  user: User | null;
  shop: Shop | null;
  token: string | null;
  isLoading: boolean;
  loading: boolean;
  isInitialized: boolean;
  isAuthenticated: boolean;
  login: (
    usernameOrCreds: string | { username: string; password: string },
    password?: string
  ) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  verifyAdminPin: (pin: string) => Promise<{ success: boolean; adminAuthToken?: string; message?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session securely on app startup
  useEffect(() => {
    syncService.init();

    async function restoreSession() {
      try {
        const storedToken = await SecureStore.getItemAsync(STORAGE_KEYS.AUTH_TOKEN);
        const storedUserJson = await SecureStore.getItemAsync(STORAGE_KEYS.USER_DATA);
        const storedShopJson = await SecureStore.getItemAsync(STORAGE_KEYS.SHOP_DATA);

        if (storedToken && storedUserJson) {
          const parsedUser = JSON.parse(storedUserJson);
          const parsedShop = storedShopJson ? JSON.parse(storedShopJson) : await getLocalShopConfig();

          setToken(storedToken);
          setUser(parsedUser);
          setShop(parsedShop);

          // Trigger catalogue download so offline SQLite is populated
          syncService.downloadCatalogue().catch(() => {});

          // If online, validate session in background
          try {
            const meRes = await api.getMe();
            if (meRes.user) {
              setUser(meRes.user);
              setShop(meRes.shop);
              await SecureStore.setItemAsync(STORAGE_KEYS.USER_DATA, JSON.stringify(meRes.user));
              if (meRes.shop) {
                await SecureStore.setItemAsync(STORAGE_KEYS.SHOP_DATA, JSON.stringify(meRes.shop));
                await saveShopConfig(meRes.shop);
              }
            }
          } catch (netErr: any) {
            // If genuinely unauthorized (401), session is revoked by server
            if (netErr.status === 401) {
              await performLogout();
            }
            // If offline / network error, allow offline session to proceed safely
          }
        }
      } catch (err) {
        console.error('Failed to restore session from secure store:', err);
      } finally {
        setIsLoading(false);
      }
    }

    restoreSession();
    return () => syncService.destroy();
  }, []);

  const login = async (
    usernameOrCreds: string | { username: string; password: string },
    passwordArg?: string
  ): Promise<{ success: boolean; message?: string }> => {
    const username = typeof usernameOrCreds === 'string' ? usernameOrCreds : usernameOrCreds.username;
    const password = typeof usernameOrCreds === 'string' ? (passwordArg || '') : usernameOrCreds.password;

    try {
      const res = await api.login({ username, password });
      if (res.success && res.token) {
        setToken(res.token);
        setUser(res.user);
        setShop(res.shop);

        // Store token in Android Keystore / iOS Keychain
        await SecureStore.setItemAsync(STORAGE_KEYS.AUTH_TOKEN, res.token);
        await SecureStore.setItemAsync(STORAGE_KEYS.USER_DATA, JSON.stringify(res.user));
        if (res.shop) {
          await SecureStore.setItemAsync(STORAGE_KEYS.SHOP_DATA, JSON.stringify(res.shop));
          await saveShopConfig(res.shop);
        }

        // Trigger catalogue download immediately
        syncService.downloadCatalogue().catch(() => {});

        return { success: true };
      }
      return { success: false, message: res.message || 'Login failed' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Unable to connect to server' };
    }
  };

  const performLogout = async (): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(STORAGE_KEYS.AUTH_TOKEN);
      await SecureStore.deleteItemAsync(STORAGE_KEYS.USER_DATA);
      await SecureStore.deleteItemAsync(STORAGE_KEYS.SHOP_DATA);
    } catch {
      // Ignore secure store deletion errors
    } finally {
      setToken(null);
      setUser(null);
      setShop(null);
    }
  };

  const logout = async (): Promise<void> => {
    await performLogout();
  };

  const refreshSession = async (): Promise<void> => {
    try {
      const res = await api.getMe();
      if (res.user) {
        setUser(res.user);
        setShop(res.shop);
        await SecureStore.setItemAsync(STORAGE_KEYS.USER_DATA, JSON.stringify(res.user));
        if (res.shop) {
          await SecureStore.setItemAsync(STORAGE_KEYS.SHOP_DATA, JSON.stringify(res.shop));
          await saveShopConfig(res.shop);
        }
      }
    } catch (err: any) {
      if (err.status === 401) {
        await performLogout();
      }
    }
  };

  const verifyAdminPin = async (
    pin: string
  ): Promise<{ success: boolean; adminAuthToken?: string; message?: string }> => {
    try {
      const res = await api.verifyAdminPin(pin);
      if (res.adminAuthToken) {
        return { success: true, adminAuthToken: res.adminAuthToken };
      }
      return { success: false, message: res.message || 'Incorrect Admin PIN' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Verification failed' };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        shop,
        token,
        isLoading,
        loading: isLoading,
        isInitialized: !isLoading,
        isAuthenticated: Boolean(token && user),
        login,
        logout,
        refreshSession,
        verifyAdminPin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

import * as SecureStore from 'expo-secure-store';
import { STORAGE_KEYS, DEFAULT_SERVER_URL, LOCALHOST_SERVER_URL } from '../utils/constants';

let cachedServerUrl: string | null = null;

export async function getServerUrl(): Promise<string> {
  if (cachedServerUrl) return cachedServerUrl;
  try {
    const saved = await SecureStore.getItemAsync(STORAGE_KEYS.SERVER_URL);
    if (saved && !saved.includes('10.0.2.2') && !saved.includes('localhost')) {
      cachedServerUrl = saved;
    } else {
      cachedServerUrl = DEFAULT_SERVER_URL;
    }
  } catch {
    cachedServerUrl = DEFAULT_SERVER_URL;
  }
  return cachedServerUrl;
}

export async function setServerUrl(url: string): Promise<void> {
  cachedServerUrl = url.trim().replace(/\/+$/, '');
  await SecureStore.setItemAsync(STORAGE_KEYS.SERVER_URL, cachedServerUrl);
}

export const getApiBaseUrl = getServerUrl;
export const setApiBaseUrl = setServerUrl;

export async function getAuthToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(STORAGE_KEYS.AUTH_TOKEN);
  } catch {
    return null;
  }
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit & { adminPinAuthToken?: string; idempotencyKey?: string } = {}
): Promise<T> {
  const baseUrl = await getServerUrl();
  const token = await getAuthToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.adminPinAuthToken ? { 'x-admin-pin-auth': options.adminPinAuthToken } : {}),
    ...(options.idempotencyKey ? { 'x-idempotency-key': options.idempotencyKey } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(`${baseUrl}${endpoint}`, {
      ...options,
      headers,
      signal: options.signal || controller.signal,
    });

    const data = await res.json().catch(() => ({
      success: false,
      message: 'Server returned non-JSON response',
    }));

    if (!res.ok) {
      const err: any = new Error(data.message || `Request failed (${res.status})`);
      err.status = res.status;
      err.data = data;
      throw err;
    }

    return data as T;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      const timeoutErr: any = new Error('Network request timed out. Please check your connection.');
      timeoutErr.isTimeout = true;
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { api } from '../api/index';
import {
  upsertProducts,
  upsertCategories,
  upsertCustomers,
  saveShopConfig,
  getPendingSalesQueue,
  removePendingSale,
  markPendingSaleFailed,
  getPendingSalesCount,
} from '../database/index';
import { SyncState } from '../types/index';

type SyncListener = (state: {
  status: SyncState;
  pendingCount: number;
  lastSyncTime: string | null;
  error: string | null;
}) => void;

class SyncService {
  private isSyncing = false;
  private isOnline = true;
  private lastSyncTime: string | null = null;
  private lastError: string | null = null;
  private listeners: Set<SyncListener> = new Set();
  private unsubscribeNetInfo: (() => void) | null = null;

  init() {
    this.unsubscribeNetInfo = NetInfo.addEventListener((state: NetInfoState) => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      const wasOffline = !this.isOnline;
      this.isOnline = online;

      this.notify();

      // Trigger automatic sync worker when transitioning from OFFLINE -> ONLINE
      if (online && wasOffline) {
        this.syncPendingSales();
      }
    });
  }

  destroy() {
    if (this.unsubscribeNetInfo) {
      this.unsubscribeNetInfo();
      this.unsubscribeNetInfo = null;
    }
    this.listeners.clear();
  }

  subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    this.notifySingle(listener);
    return () => this.listeners.delete(listener);
  }

  private async notifySingle(listener: SyncListener) {
    const pendingCount = await getPendingSalesCount();
    listener({
      status: this.isSyncing ? 'SYNCING' : this.isOnline ? 'ONLINE' : 'OFFLINE',
      pendingCount,
      lastSyncTime: this.lastSyncTime,
      error: this.lastError,
    });
  }

  private async notify() {
    const pendingCount = await getPendingSalesCount();
    const payload = {
      status: (this.isSyncing ? 'SYNCING' : this.isOnline ? 'ONLINE' : 'OFFLINE') as SyncState,
      pendingCount,
      lastSyncTime: this.lastSyncTime,
      error: this.lastError,
    };
    this.listeners.forEach((l) => l(payload));
  }

  // 1. Initial / Catalogue Sync (Non-blocking background refresh)
  async downloadCatalogue(): Promise<{ success: boolean; count: number; message?: string }> {
    try {
      this.isSyncing = true;
      this.lastError = null;
      this.notify();

      const [pRes, cRes, custRes, sRes] = await Promise.allSettled([
        api.getProducts({ isActive: true }),
        api.getCategories(),
        api.getCustomers(),
        api.getShop(),
      ]);

      let productCount = 0;
      if (pRes.status === 'fulfilled' && pRes.value?.products) {
        await upsertProducts(pRes.value.products);
        productCount = pRes.value.products.length;
      }
      if (cRes.status === 'fulfilled' && cRes.value?.categories) {
        await upsertCategories(cRes.value.categories);
      }
      if (custRes.status === 'fulfilled' && custRes.value?.customers) {
        await upsertCustomers(custRes.value.customers);
      }
      if (sRes.status === 'fulfilled' && sRes.value?.shop) {
        await saveShopConfig(sRes.value.shop);
      }

      this.isOnline = true;
      this.lastSyncTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return { success: true, count: productCount };
    } catch (err: any) {
      this.lastError = err.message || 'Catalogue download failed';
      return { success: false, count: 0, message: this.lastError || undefined };
    } finally {
      this.isSyncing = false;
      this.notify();
    }
  }

  async pullInitialData(shopId?: string): Promise<number> {
    const res = await this.downloadCatalogue();
    return res.count;
  }

  // 2. Offline Sales Queue Sync
  async syncPendingSales(): Promise<{
    success: boolean;
    syncedCount: number;
    synced: any[];
    failed: any[];
  }> {
    if (!this.isOnline || this.isSyncing) {
      return { success: false, syncedCount: 0, synced: [], failed: [] };
    }

    try {
      this.isSyncing = true;
      this.lastError = null;
      this.notify();

      const queue = await getPendingSalesQueue();
      if (queue.length === 0) {
        return { success: true, syncedCount: 0, synced: [], failed: [] };
      }

      // Format payload for POST /api/sales/sync
      const salesBatch = queue.map((item) => {
        try {
          const parsed = JSON.parse(item.payload);
          return {
            ...parsed,
            idempotencyKey: item.idempotencyKey,
            createdAt: item.createdAt,
          };
        } catch {
          return {
            idempotencyKey: item.idempotencyKey,
            createdAt: item.createdAt,
          };
        }
      });

      const response = await api.syncSales(salesBatch);
      let syncedCount = 0;
      const syncedList = response.synced || [];
      const failedList = response.failed || [];

      if (response.success) {
        // Safe dequeue for confirmed or already-synced keys
        for (const item of syncedList) {
          await removePendingSale(item.idempotencyKey);
          syncedCount++;
        }

        // Handle failed items without deleting
        for (const item of failedList) {
          await markPendingSaleFailed(item.idempotencyKey, item.reason);
        }
      }

      this.lastSyncTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return { success: true, syncedCount, synced: syncedList, failed: failedList };
    } catch (err: any) {
      this.lastError = err.message || 'Failed to sync offline sales';
      return { success: false, syncedCount: 0, synced: [], failed: [] };
    } finally {
      this.isSyncing = false;
      this.notify();
    }
  }

  getOnlineStatus(): boolean {
    return this.isOnline;
  }
}

export const syncService = new SyncService();

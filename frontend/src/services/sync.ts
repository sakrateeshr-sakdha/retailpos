import { db } from './db';
import { api } from './api';

export async function syncPendingSales(): Promise<{ success: boolean; count: number }> {
  if (!navigator.onLine) {
    return { success: false, count: 0 };
  }

  try {
    const pending = await db.pendingSales.toArray();
    if (pending.length === 0) {
      return { success: true, count: 0 };
    }

    const payload = pending.map((sale) => ({
      idempotencyKey: sale.idempotencyKey,
      items: sale.items,
      subtotal: sale.subtotal,
      discount: sale.discount,
      total: sale.total,
      paymentMethod: sale.paymentMethod,
      payments: sale.payments,
      createdAt: sale.createdAt,
    }));

    const response = await api.syncSales(payload);

    if (response.success) {
      // Remove successfully synced sales from Dexie
      const syncedKeys = new Set(
        response.synced.map((s: any) => s.idempotencyKey)
      );

      const toDelete = pending.filter((p) => syncedKeys.has(p.idempotencyKey));
      for (const item of toDelete) {
        if (item.id !== undefined) {
          await db.pendingSales.delete(item.id);
        }
      }

      return { success: true, count: toDelete.length };
    }

    return { success: false, count: 0 };
  } catch (error) {
    console.error('Offline synchronization error:', error);
    return { success: false, count: 0 };
  }
}

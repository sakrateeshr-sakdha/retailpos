import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Sale } from '../types/index';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/index';
import { getPendingSalesOffline } from '../database/index';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { ReceiptModal } from '../components/ReceiptModal';
import { OfflineBanner } from '../components/OfflineBanner';

export const SalesScreen: React.FC = () => {
  const { shop } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [range, setRange] = useState<string>('today');
  const [search, setSearch] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [receiptVisible, setReceiptVisible] = useState<boolean>(false);

  const fetchSalesData = useCallback(async () => {
    try {
      // 1. Get pending local offline sales (safe)
      let localSalesFormatted: Sale[] = [];
      try {
        const localPending = await getPendingSalesOffline();
        setPendingCount(localPending.length);

        localSalesFormatted = localPending.map((p: any) => {
          let payload: any = {};
          try {
            payload = typeof p.payload === 'string' ? JSON.parse(p.payload) : (p.payload || {});
          } catch {
            payload = {};
          }
          return {
            id: p.idempotencyKey,
            shopId: p.shopId || shop?.id || 'offline_shop',
            userId: 'offline_user',
            invoiceNumber: `LOCAL-${p.idempotencyKey.slice(0, 6).toUpperCase()}`,
            subtotal: Number(payload.subtotal || payload.total || 0),
            discount: Number(payload.discount || 0),
            total: Number(payload.total || 0),
            paymentMethod: payload.paymentMethod || 'CASH',
            status: 'COMPLETED',
            createdAt: p.createdAt,
            items: (payload.items || []).map((it: any) => ({
              productId: it.productId,
              productName: it.productName || 'Item',
              quantity: it.quantity,
              unitPrice: it.unitPrice,
              totalPrice: it.totalPrice || it.quantity * it.unitPrice,
              unit: it.unit,
            })),
            payments: [
              {
                method: payload.paymentMethod || 'CASH',
                amount: Number(payload.total || 0),
              },
            ],
          };
        });
      } catch (localErr) {
        console.warn('Local pending sales load error:', localErr);
      }

      // 2. Fetch server sales
      let serverSales: Sale[] = [];
      try {
        const res = await api.getSales({ range, search: search.trim() || undefined });
        if (res.success && res.sales) {
          serverSales = res.sales;
        }
      } catch {
        // Offline: continue with local sales only
      }

      // Combine local pending at top
      setSales([...localSalesFormatted, ...serverSales]);
    } catch (err: any) {
      console.warn('Error loading sales:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [range, search, shop]);

  useEffect(() => {
    fetchSalesData();
  }, [fetchSalesData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchSalesData();
  };

  const currency = shop?.currency || '₹';

  const todayTotal = sales.reduce((sum, s) => sum + s.total, 0);

  return (
    <ScreenWrapper backgroundColor="#F8FAFC">
      <OfflineBanner />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Sales History</Text>
      </View>

      {/* Summary KPI Cards */}
      <View style={styles.kpiRow}>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Total Revenue</Text>
          <Text style={styles.kpiValue}>{currency}{todayTotal.toFixed(2)}</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Bills Count</Text>
          <Text style={styles.kpiValue}>{sales.length}</Text>
        </View>
        <View style={[styles.kpiCard, pendingCount > 0 && styles.kpiCardPending]}>
          <Text style={[styles.kpiLabel, pendingCount > 0 && styles.kpiLabelPending]}>
            Pending Sync
          </Text>
          <Text style={[styles.kpiValue, pendingCount > 0 && styles.kpiValuePending]}>
            {pendingCount}
          </Text>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {['today', 'yesterday', 'month'].map((r) => (
          <TouchableOpacity
            key={r}
            style={[styles.filterChip, range === r && styles.filterChipActive]}
            onPress={() => setRange(r)}
          >
            <Text style={[styles.filterChipText, range === r && styles.filterChipTextActive]}>
              {r.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by invoice number or customer..."
          placeholderTextColor="#94A3B8"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Sales List */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <FlatList
          data={sales}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No sales recorded for this period</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isLocalPending = item.invoiceNumber?.startsWith('LOCAL-');
            return (
              <TouchableOpacity
                style={styles.saleCard}
                onPress={() => {
                  setSelectedSale(item);
                  setReceiptVisible(true);
                }}
              >
                <View style={styles.saleHeader}>
                  <View>
                    <Text style={styles.invoiceNumber}>{item.invoiceNumber}</Text>
                    <Text style={styles.saleTime}>
                      {new Date(item.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      • {new Date(item.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                  <View style={styles.totalCol}>
                    <Text style={styles.saleTotal}>{currency}{item.total.toFixed(2)}</Text>
                    <View
                      style={[
                        styles.methodBadge,
                        (item.paymentMethod === 'KHATA' || item.paymentMethod === 'CREDIT') && styles.methodKhata,
                        item.paymentMethod === 'UPI' && styles.methodUpi,
                      ]}
                    >
                      <Text style={styles.methodText}>{item.paymentMethod}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.saleFooter}>
                  <Text style={styles.itemCountText}>
                    {item.items?.length || 0} items
                  </Text>
                  {isLocalPending ? (
                    <View style={styles.offlineTag}>
                      <Text style={styles.offlineTagText}>⏳ Unsynced</Text>
                    </View>
                  ) : (
                    <Text style={styles.reprintHint}>Tap to view / reprint receipt 🖨️</Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      <ReceiptModal
        visible={receiptVisible}
        sale={selectedSale}
        onClose={() => {
          setReceiptVisible(false);
          setSelectedSale(null);
        }}
      />
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  kpiRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    backgroundColor: '#FFFFFF',
  },
  kpiCard: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    padding: 10,
  },
  kpiCardPending: {
    backgroundColor: '#FEF3C7',
  },
  kpiLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  kpiLabelPending: {
    color: '#B45309',
  },
  kpiValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 4,
  },
  kpiValuePending: {
    color: '#B45309',
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  filterChipActive: {
    backgroundColor: '#0F172A',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  searchContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
  },
  searchInput: {
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 38,
    fontSize: 13,
    color: '#0F172A',
  },
  listContent: {
    padding: 12,
  },
  saleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  saleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  invoiceNumber: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  saleTime: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  totalCol: {
    alignItems: 'flex-end',
  },
  saleTotal: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  methodBadge: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
  },
  methodKhata: {
    backgroundColor: '#FEE2E2',
  },
  methodUpi: {
    backgroundColor: '#DCFCE7',
  },
  methodText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0369A1',
  },
  saleFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  itemCountText: {
    fontSize: 12,
    color: '#64748B',
  },
  offlineTag: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  offlineTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B45309',
  },
  reprintHint: {
    fontSize: 11,
    color: '#2563EB',
    fontWeight: '600',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 60,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748B',
  },
});

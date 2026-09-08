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
  Alert,
} from 'react-native';
import { Product, Category } from '../types/index';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/index';
import {
  searchProductsOffline,
  getCategoriesOffline,
  upsertProducts,
  upsertCategories,
} from '../database/index';
import { syncService } from '../sync/SyncService';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { QuickAddProductModal } from '../components/QuickAddProductModal';
import { OfflineBanner } from '../components/OfflineBanner';

export const ProductsScreen: React.FC = () => {
  const { user, shop } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [quickAddVisible, setQuickAddVisible] = useState<boolean>(false);

  const loadData = useCallback(async () => {
    try {
      let prods: Product[] = [];
      let cats: Category[] = [];

      try {
        [prods, cats] = await Promise.all([
          searchProductsOffline(searchQuery),
          getCategoriesOffline(),
        ]);
      } catch (dbErr) {
        console.warn('Offline DB load error in ProductsScreen:', dbErr);
      }

      // If prods is empty, fetch directly from server API
      if (prods.length === 0) {
        try {
          const [pRes, cRes] = await Promise.all([
            api.getProducts({ search: searchQuery.trim() || undefined, isActive: true }),
            api.getCategories(),
          ]);
          if (pRes?.products && pRes.products.length > 0) {
            prods = pRes.products;
            upsertProducts(pRes.products).catch(() => {});
          }
          if (cRes?.categories && cRes.categories.length > 0) {
            cats = cRes.categories;
            upsertCategories(cats).catch(() => {});
          }
        } catch (apiErr) {
          console.warn('Direct API load in ProductsScreen failed:', apiErr);
        }
      }

      setProducts(prods);
      setCategories(cats);
    } catch (err: any) {
      console.warn('Failed to load products in ProductsScreen:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const unsub = syncService.subscribe((state) => {
      if (state.lastSyncTime) {
        searchProductsOffline(searchQuery).then(setProducts).catch(() => {});
        getCategoriesOffline().then(setCategories).catch(() => {});
      }
    });
    return unsub;
  }, [searchQuery]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await syncService.downloadCatalogue();
    } catch {}
    await loadData();
  };

  const filteredProducts = products.filter((p) => {
    if (selectedCategory === 'ALL') return true;
    return p.categoryId === selectedCategory;
  });

  const currency = shop?.currency || '₹';

  const renderStockBadge = (product: Product) => {
    const qty = product.stockQuantity;
    const threshold = product.lowStockThreshold || 5;

    if (qty <= 0) {
      return (
        <View style={[styles.badge, styles.badgeOut]}>
          <Text style={[styles.badgeText, styles.badgeTextOut]}>Out of Stock</Text>
        </View>
      );
    }
    if (qty <= threshold) {
      return (
        <View style={[styles.badge, styles.badgeLow]}>
          <Text style={[styles.badgeText, styles.badgeTextLow]}>Low: {qty} {product.unit}</Text>
        </View>
      );
    }
    return (
      <View style={[styles.badge, styles.badgeOk]}>
        <Text style={[styles.badgeText, styles.badgeTextOk]}>{qty} {product.unit}</Text>
      </View>
    );
  };

  return (
    <ScreenWrapper backgroundColor="#F8FAFC">
      <OfflineBanner />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Inventory & Catalogue</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setQuickAddVisible(true)}
        >
          <Text style={styles.addBtnText}>+ Add Item</Text>
        </TouchableOpacity>
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search products by name, barcode, SKU..."
          placeholderTextColor="#94A3B8"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
        />
      </View>

      {/* Category Pills */}
      <View style={styles.categoryScrollContainer}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[{ id: 'ALL', name: 'All Items' }, ...categories]}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.categoryList}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.categoryPill,
                selectedCategory === item.id && styles.categoryPillActive,
              ]}
              onPress={() => setSelectedCategory(item.id)}
            >
              <Text
                style={[
                  styles.categoryPillText,
                  selectedCategory === item.id && styles.categoryPillTextActive,
                ]}
              >
                {item.name}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* Product List */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <FlatList
          data={filteredProducts}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No products found</Text>
              <Text style={styles.emptySubtext}>
                Tap "+ Add Item" or pull down to sync from server.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.productCard}>
              <View style={styles.productDetails}>
                <Text style={styles.productName}>{item.name}</Text>
                <View style={styles.metaRow}>
                  {item.barcode && (
                    <Text style={styles.metaBarcode}>Barcode: {item.barcode}</Text>
                  )}
                  {item.sku && <Text style={styles.metaSku}>SKU: {item.sku}</Text>}
                </View>
                <View style={styles.priceRow}>
                  <Text style={styles.sellingPrice}>
                    {currency}{item.sellingPrice.toFixed(2)}
                  </Text>
                  {user?.role === 'ADMIN' && item.purchasePrice !== undefined && (
                    <Text style={styles.purchasePrice}>
                      Cost: {currency}{item.purchasePrice.toFixed(2)}
                    </Text>
                  )}
                </View>
              </View>

              <View style={styles.stockCol}>{renderStockBadge(item)}</View>
            </View>
          )}
        />
      )}

      <QuickAddProductModal
        visible={quickAddVisible}
        onClose={() => setQuickAddVisible(false)}
        onSuccess={loadData}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  addBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
  },
  searchInput: {
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 40,
    fontSize: 14,
    color: '#0F172A',
  },
  categoryScrollContainer: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  categoryList: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  categoryPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginHorizontal: 4,
  },
  categoryPillActive: {
    backgroundColor: '#0F172A',
  },
  categoryPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  categoryPillTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    padding: 12,
  },
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  productDetails: {
    flex: 1,
  },
  productName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  metaBarcode: {
    fontSize: 11,
    color: '#64748B',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  metaSku: {
    fontSize: 11,
    color: '#64748B',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sellingPrice: {
    fontSize: 16,
    fontWeight: '800',
    color: '#16A34A',
  },
  purchasePrice: {
    fontSize: 12,
    color: '#64748B',
  },
  stockCol: {
    marginLeft: 12,
    alignItems: 'flex-end',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  badgeOk: {
    backgroundColor: '#DCFCE7',
  },
  badgeTextOk: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '700',
  },
  badgeLow: {
    backgroundColor: '#FEF3C7',
  },
  badgeTextLow: {
    color: '#92400E',
    fontSize: 12,
    fontWeight: '700',
  },
  badgeOut: {
    backgroundColor: '#FEE2E2',
  },
  badgeTextOut: {
    color: '#991B1B',
    fontSize: 12,
    fontWeight: '700',
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
    fontSize: 16,
    fontWeight: '700',
    color: '#475569',
  },
  emptySubtext: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 4,
    textAlign: 'center',
  },
});

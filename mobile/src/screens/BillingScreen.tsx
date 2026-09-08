import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  Keyboard,
  Modal,
  Platform,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useCart } from '../hooks/useCart';
import { useAuth } from '../auth/AuthContext';
import { Product, Category, Sale } from '../types/index';
import { api } from '../api/index';
import {
  searchProductsOffline,
  findProductByBarcodeOffline,
  getCategoriesOffline,
  upsertProducts,
  upsertCategories,
} from '../database/index';
import { syncService } from '../sync/SyncService';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { OfflineBanner } from '../components/OfflineBanner';
import { CameraScannerModal } from '../components/CameraScannerModal';
import { QuickAddProductModal } from '../components/QuickAddProductModal';
import { CheckoutModal } from '../components/CheckoutModal';
import { ReceiptModal } from '../components/ReceiptModal';

export const BillingScreen: React.FC = () => {
  const { user, shop } = useAuth();
  const {
    items,
    subtotal,
    discount,
    total,
    itemCount,
    addToCart,
    removeFromCart,
    updateQuantity,
    setDiscount,
    clearCart,
    scanBarcode,
  } = useCart();

  // Search & Barcode
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Catalog & Categories state
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [cartModalVisible, setCartModalVisible] = useState<boolean>(false);

  // Modals state
  const [cameraModalVisible, setCameraModalVisible] = useState(false);
  const [quickAddVisible, setQuickAddVisible] = useState(false);
  const [unknownBarcode, setUnknownBarcode] = useState('');
  const [checkoutVisible, setCheckoutVisible] = useState(false);
  const [receiptVisible, setReceiptVisible] = useState(false);
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);

  // Discount modal / prompt
  const [showDiscountInput, setShowDiscountInput] = useState(false);
  const [discountVal, setDiscountVal] = useState(discount.toString());

  const searchInputRef = useRef<TextInput>(null);

  // Load catalog on mount & auto-sync if empty
  useEffect(() => {
    let active = true;

    async function loadCatalog() {
      try {
        let prods: Product[] = [];
        let cats: Category[] = [];

        try {
          [prods, cats] = await Promise.all([
            searchProductsOffline(''),
            getCategoriesOffline(),
          ]);
        } catch (dbErr) {
          console.warn('Offline DB read failed:', dbErr);
        }

        // Direct fetch from API if local cache is empty
        if (prods.length === 0) {
          try {
            const [pRes, cRes] = await Promise.all([
              api.getProducts({ isActive: true }),
              api.getCategories(),
            ]);
            if (pRes?.products && pRes.products.length > 0) {
              prods = pRes.products;
              upsertProducts(prods).catch(() => {});
            }
            if (cRes?.categories && cRes.categories.length > 0) {
              cats = cRes.categories;
              upsertCategories(cats).catch(() => {});
            }
          } catch (apiErr) {
            console.warn('Direct API load failed in BillingScreen:', apiErr);
          }
        }

        if (active) {
          setCatalogProducts(prods);
          setCategories(cats);
        }
      } catch (err) {
        console.warn('Failed to load initial catalog in BillingScreen:', err);
      }
    }

    loadCatalog();

    const unsub = syncService.subscribe((state) => {
      if (state.lastSyncTime) {
        searchProductsOffline('').then((prods) => active && setCatalogProducts(prods)).catch(() => {});
        getCategoriesOffline().then((cats) => active && setCategories(cats)).catch(() => {});
      }
    });

    return () => {
      active = false;
      unsub();
    };
  }, []);

  // Search SQLite whenever user types
  useEffect(() => {
    let active = true;
    if (searchQuery.trim().length > 0) {
      setIsSearching(true);
      searchProductsOffline(searchQuery.trim())
        .then((res) => {
          if (active) setSearchResults(res);
        })
        .catch(() => {
          if (active) setSearchResults([]);
        });
    } else {
      setIsSearching(false);
      setSearchResults([]);
    }
    return () => {
      active = false;
    };
  }, [searchQuery]);

  // Handle Barcode scanned from Camera or Hardware Scanner (HID Enter)
  const handleBarcodeProcess = async (barcode: string) => {
    const clean = barcode.trim();
    if (!clean) return;

    const res = await scanBarcode(clean, findProductByBarcodeOffline);
    if (!res.success) {
      if (res.message?.includes('Barcode not found')) {
        Alert.alert(
          'Product Not Found',
          `No item matches barcode: ${clean}.\nWould you like to add it now?`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Add Product',
              onPress: () => {
                setUnknownBarcode(clean);
                setQuickAddVisible(true);
              },
            },
          ]
        );
      } else if (res.message) {
        Alert.alert('Scan Issue', res.message);
      }
    }
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleSelectProduct = (product: Product) => {
    const res = addToCart(product, 1);
    if (!res.success && res.message) {
      Alert.alert('Stock Limit', res.message);
    }
    setSearchQuery('');
    setSearchResults([]);
    Keyboard.dismiss();
  };

  const handleAddProductFromCatalog = (product: Product) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    const res = addToCart(product, 1);
    if (!res.success && res.message) {
      Alert.alert('Stock Limit', res.message);
    }
  };

  const handleApplyDiscount = () => {
    const d = parseFloat(discountVal) || 0;
    setDiscount(d);
    setShowDiscountInput(false);
  };

  const handleCheckoutSuccess = (sale: Sale) => {
    setCheckoutVisible(false);
    clearCart();
    setCompletedSale(sale);
    setReceiptVisible(true);
  };

  const currency = shop?.currency || '₹';

  const filteredCatalog = catalogProducts.filter((p) => {
    if (selectedCategory === 'ALL') return true;
    return p.categoryId === selectedCategory;
  });

  return (
    <ScreenWrapper backgroundColor="#F8FAFC">
      <OfflineBanner />

      {/* Top Header */}
      <View style={styles.topHeader}>
        <View>
          <Text style={styles.shopNameHeader}>{shop?.name || 'Retail POS'}</Text>
          <Text style={styles.cashierBadge}>Cashier: {user?.name || 'Staff'}</Text>
        </View>

        <View style={styles.headerRightRow}>
          {items.length > 0 && (
            <TouchableOpacity
              style={styles.clearCartBtn}
              onPress={() => {
                Alert.alert('Clear Cart', 'Remove all items from current cart?', [
                  { text: 'No', style: 'cancel' },
                  { text: 'Yes, Clear', style: 'destructive', onPress: clearCart },
                ]);
              }}
            >
              <Text style={styles.clearCartText}>Clear</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.cartBadgeBtn, items.length > 0 && styles.cartBadgeBtnActive]}
            onPress={() => setCartModalVisible(true)}
          >
            <Text style={styles.cartBadgeIcon}>🛒</Text>
            <Text style={styles.cartBadgeCount}>{itemCount}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Search & Scan Bar */}
      <View style={styles.searchScanContainer}>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder="Search name, barcode or SKU..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={() => handleBarcodeProcess(searchQuery)}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearSearchBtn}>
              <Text style={styles.clearSearchText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={styles.cameraScanBtn}
          onPress={() => setCameraModalVisible(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.cameraIcon}>📷</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.quickAddBtn}
          onPress={() => {
            setUnknownBarcode('');
            setQuickAddVisible(true);
          }}
          activeOpacity={0.7}
        >
          <Text style={styles.quickAddIcon}>➕</Text>
        </TouchableOpacity>
      </View>

      {/* Dropdown Suggestions if typing */}
      {isSearching && searchResults.length > 0 && (
        <View style={styles.dropdownContainer}>
          <FlatList
            data={searchResults}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.dropdownRow}
                onPress={() => handleSelectProduct(item)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.dropdownItemName}>{item.name}</Text>
                  <Text style={styles.dropdownItemMeta}>
                    {item.barcode ? `Barcode: ${item.barcode} | ` : ''}
                    Stock: {item.stockQuantity} {item.unit}
                  </Text>
                </View>
                <Text style={styles.dropdownItemPrice}>
                  {currency}{item.sellingPrice.toFixed(2)}
                </Text>
              </TouchableOpacity>
            )}
            style={{ maxHeight: 220 }}
          />
        </View>
      )}

      {/* Category Filter Pills */}
      <View style={styles.categoriesContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoriesScrollContent}
        >
          <TouchableOpacity
            style={[styles.categoryChip, selectedCategory === 'ALL' && styles.categoryChipActive]}
            onPress={() => setSelectedCategory('ALL')}
          >
            <Text
              style={[
                styles.categoryChipText,
                selectedCategory === 'ALL' && styles.categoryChipTextActive,
              ]}
            >
              All Items ({catalogProducts.length})
            </Text>
          </TouchableOpacity>
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat.id}
              style={[
                styles.categoryChip,
                selectedCategory === cat.id && styles.categoryChipActive,
              ]}
              onPress={() => setSelectedCategory(cat.id)}
            >
              <Text
                style={[
                  styles.categoryChipText,
                  selectedCategory === cat.id && styles.categoryChipTextActive,
                ]}
              >
                {cat.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Product Catalog Grid */}
      <View style={styles.catalogSection}>
        <FlatList
          data={filteredCatalog}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={styles.catalogListContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyCatalogBox}>
              <Text style={styles.emptyCatalogIcon}>📦</Text>
              <Text style={styles.emptyCatalogText}>No products found in this category</Text>
              <TouchableOpacity
                style={styles.syncCatalogBtn}
                onPress={() => syncService.downloadCatalogue()}
              >
                <Text style={styles.syncCatalogBtnText}>Sync Products from Server</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }) => {
            const inCart = items.find((i) => i.product.id === item.id);
            const isLow = item.stockQuantity <= (item.lowStockThreshold || 5);
            const isOut = item.stockQuantity <= 0;

            return (
              <TouchableOpacity
                style={[styles.productCard, inCart && styles.productCardInCart]}
                onPress={() => handleAddProductFromCatalog(item)}
                activeOpacity={0.7}
              >
                <View style={styles.productCardTop}>
                  <Text style={styles.productCardName} numberOfLines={2}>
                    {item.name}
                  </Text>
                  <Text
                    style={[
                      styles.productCardStock,
                      isOut ? styles.stockOut : isLow ? styles.stockLow : styles.stockOk,
                    ]}
                  >
                    {isOut ? 'Out of stock' : `${item.stockQuantity} ${item.unit}`}
                  </Text>
                </View>

                <View style={styles.productCardBottom}>
                  <Text style={styles.productCardPrice}>
                    {currency}{item.sellingPrice.toFixed(2)}
                  </Text>
                  {inCart ? (
                    <View style={styles.inCartBadge}>
                      <Text style={styles.inCartBadgeText}>✓ {inCart.quantity}</Text>
                    </View>
                  ) : (
                    <View style={styles.addCardBtn}>
                      <Text style={styles.addCardBtnText}>+ Add</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* Bottom Cart Action Bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.cartInfoSection}
          onPress={() => setCartModalVisible(true)}
          disabled={items.length === 0}
        >
          <View>
            <Text style={styles.cartInfoTitle}>
              🛒 {itemCount} {itemCount === 1 ? 'item' : 'items'}
            </Text>
            <Text style={styles.cartInfoSubtitle}>
              {items.length > 0 ? 'Tap to view cart details ⌃' : 'Tap products above to add'}
            </Text>
          </View>
          <Text style={styles.cartInfoTotal}>
            {currency}{total.toFixed(2)}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.mainCheckoutBtn, items.length === 0 && styles.mainCheckoutBtnDisabled]}
          disabled={items.length === 0}
          onPress={() => setCheckoutVisible(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.mainCheckoutBtnText}>CHECKOUT</Text>
        </TouchableOpacity>
      </View>

      {/* Slide-Up Cart Review Modal */}
      <Modal
        visible={cartModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setCartModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.cartModalCard}>
            {/* Modal Header */}
            <View style={styles.cartModalHeader}>
              <View>
                <Text style={styles.cartModalTitle}>Current Cart</Text>
                <Text style={styles.cartModalSubtitle}>{itemCount} items ready for billing</Text>
              </View>
              <TouchableOpacity
                style={styles.closeCartModalBtn}
                onPress={() => setCartModalVisible(false)}
              >
                <Text style={styles.closeCartModalText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Cart Items List */}
            {items.length === 0 ? (
              <View style={styles.emptyCartInModal}>
                <Text style={styles.emptyCatalogIcon}>🛒</Text>
                <Text style={styles.emptyCartTitle}>Your cart is empty</Text>
                <Text style={styles.emptyCartSubtitle}>
                  Select products from the catalog or scan barcodes to begin.
                </Text>
              </View>
            ) : (
              <FlatList
                data={items}
                keyExtractor={(item) => item.product.id}
                contentContainerStyle={styles.cartListContent}
                renderItem={({ item }) => (
                  <View style={styles.cartItemRow}>
                    <View style={styles.itemInfoCol}>
                      <Text style={styles.cartItemName} numberOfLines={1}>
                        {item.product.name}
                      </Text>
                      <Text style={styles.cartItemUnitPrice}>
                        {currency}{item.unitPrice.toFixed(2)} / {item.product.unit}
                      </Text>
                    </View>

                    {/* Stepper */}
                    <View style={styles.qtyContainer}>
                      <TouchableOpacity
                        style={styles.qtyBtn}
                        onPress={() => updateQuantity(item.product.id, item.quantity - 1)}
                      >
                        <Text style={styles.qtyBtnText}>−</Text>
                      </TouchableOpacity>
                      <Text style={styles.qtyValue}>{item.quantity}</Text>
                      <TouchableOpacity
                        style={styles.qtyBtn}
                        onPress={() => {
                          const res = updateQuantity(item.product.id, item.quantity + 1);
                          if (!res.success && res.message) {
                            Alert.alert('Stock Limit', res.message);
                          }
                        }}
                      >
                        <Text style={styles.qtyBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.lineTotalCol}>
                      <Text style={styles.lineTotalText}>
                        {currency}{item.lineTotal.toFixed(2)}
                      </Text>
                      <TouchableOpacity
                        onPress={() => removeFromCart(item.product.id)}
                        style={styles.deleteItemBtn}
                      >
                        <Text style={styles.deleteItemText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              />
            )}

            {/* Subtotal & Discount in Cart Modal */}
            <View style={styles.cartModalFooter}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>
                  Subtotal: <Text style={styles.summaryValue}>{currency}{subtotal.toFixed(2)}</Text>
                </Text>

                <TouchableOpacity
                  onPress={() => {
                    setDiscountVal(discount.toString());
                    setShowDiscountInput(!showDiscountInput);
                  }}
                  style={styles.discountBadge}
                >
                  <Text style={styles.discountBadgeText}>
                    {discount > 0 ? `Discount: -${currency}${discount.toFixed(2)}` : '+ Add Discount'}
                  </Text>
                </TouchableOpacity>
              </View>

              {showDiscountInput && (
                <View style={styles.discountInputRow}>
                  <TextInput
                    style={styles.discountInput}
                    placeholder="Discount amount (₹)"
                    value={discountVal}
                    onChangeText={setDiscountVal}
                    keyboardType="decimal-pad"
                    autoFocus
                  />
                  <TouchableOpacity style={styles.applyDiscountBtn} onPress={handleApplyDiscount}>
                    <Text style={styles.applyDiscountText}>Apply</Text>
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.modalTotalRow}>
                <Text style={styles.modalTotalLabel}>Total Due</Text>
                <Text style={styles.modalTotalAmount}>{currency}{total.toFixed(2)}</Text>
              </View>

              <TouchableOpacity
                style={[styles.modalProceedBtn, items.length === 0 && styles.mainCheckoutBtnDisabled]}
                disabled={items.length === 0}
                onPress={() => {
                  setCartModalVisible(false);
                  setCheckoutVisible(true);
                }}
              >
                <Text style={styles.modalProceedBtnText}>
                  Proceed to Payment ({currency}{total.toFixed(2)})
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modals */}
      <CameraScannerModal
        visible={cameraModalVisible}
        onClose={() => setCameraModalVisible(false)}
        onScan={handleBarcodeProcess}
      />

      <QuickAddProductModal
        visible={quickAddVisible}
        initialBarcode={unknownBarcode}
        onClose={() => setQuickAddVisible(false)}
        onSuccess={(newProduct) => {
          addToCart(newProduct, 1);
        }}
      />

      <CheckoutModal
        visible={checkoutVisible}
        onClose={() => setCheckoutVisible(false)}
        onSuccess={handleCheckoutSuccess}
      />

      <ReceiptModal
        visible={receiptVisible}
        sale={completedSale}
        onClose={() => {
          setReceiptVisible(false);
          setCompletedSale(null);
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
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  shopNameHeader: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  cashierBadge: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  headerRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clearCartBtn: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  clearCartText: {
    color: '#DC2626',
    fontWeight: '700',
    fontSize: 12,
  },
  cartBadgeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cartBadgeBtnActive: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  cartBadgeIcon: {
    fontSize: 14,
  },
  cartBadgeCount: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  searchScanContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    gap: 8,
    alignItems: 'center',
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 42,
  },
  searchIcon: {
    marginRight: 6,
    fontSize: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
    paddingVertical: 0,
  },
  clearSearchBtn: {
    padding: 4,
  },
  clearSearchText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '700',
  },
  cameraScanBtn: {
    width: 42,
    height: 42,
    backgroundColor: '#EEF2FF',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  cameraIcon: {
    fontSize: 18,
  },
  quickAddBtn: {
    width: 42,
    height: 42,
    backgroundColor: '#ECFDF5',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  quickAddIcon: {
    fontSize: 18,
  },
  dropdownContainer: {
    position: 'absolute',
    top: 110,
    left: 16,
    right: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    zIndex: 999,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  dropdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  dropdownItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  dropdownItemMeta: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  dropdownItemPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2563EB',
  },
  categoriesContainer: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingVertical: 6,
  },
  categoriesScrollContent: {
    paddingHorizontal: 12,
    gap: 6,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  categoryChipActive: {
    backgroundColor: '#15803D',
    borderColor: '#15803D',
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  categoryChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  catalogSection: {
    flex: 1,
  },
  catalogListContent: {
    padding: 8,
    paddingBottom: 24,
  },
  productCard: {
    flex: 0.5,
    margin: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'space-between',
    minHeight: 110,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  productCardInCart: {
    borderColor: '#22C55E',
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
  },
  productCardTop: {
    marginBottom: 8,
  },
  productCardName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 17,
  },
  productCardStock: {
    fontSize: 11,
    marginTop: 4,
  },
  stockOk: {
    color: '#15803D',
  },
  stockLow: {
    color: '#D97706',
    fontWeight: '600',
  },
  stockOut: {
    color: '#DC2626',
    fontWeight: '700',
  },
  productCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 6,
  },
  productCardPrice: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  addCardBtn: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  addCardBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
  },
  inCartBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  inCartBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#15803D',
  },
  emptyCatalogBox: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCatalogIcon: {
    fontSize: 48,
    marginBottom: 10,
  },
  emptyCatalogText: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 14,
  },
  syncCatalogBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  syncCatalogBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0F172A',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  cartInfoSection: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginRight: 14,
  },
  cartInfoTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  cartInfoSubtitle: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  cartInfoTotal: {
    fontSize: 18,
    fontWeight: '900',
    color: '#4ADE80',
    marginLeft: 8,
  },
  mainCheckoutBtn: {
    backgroundColor: '#22C55E',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  mainCheckoutBtnDisabled: {
    backgroundColor: '#475569',
  },
  mainCheckoutBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  cartModalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
  },
  cartModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  cartModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  cartModalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  closeCartModalBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeCartModalText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#475569',
  },
  emptyCartInModal: {
    padding: 32,
    alignItems: 'center',
  },
  emptyCartTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#475569',
    marginTop: 8,
  },
  emptyCartSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 4,
  },
  cartListContent: {
    padding: 12,
  },
  cartItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  itemInfoCol: {
    flex: 2,
  },
  cartItemName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  cartItemUnitPrice: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  qtyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 2,
    marginHorizontal: 8,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  qtyBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  qtyValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    minWidth: 28,
    textAlign: 'center',
  },
  lineTotalCol: {
    alignItems: 'flex-end',
    minWidth: 68,
  },
  lineTotalText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  deleteItemBtn: {
    marginTop: 4,
    padding: 2,
  },
  deleteItemText: {
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '700',
  },
  cartModalFooter: {
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 13,
    color: '#475569',
  },
  summaryValue: {
    fontWeight: '700',
    color: '#0F172A',
  },
  discountBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  discountBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#059669',
  },
  discountInputRow: {
    flexDirection: 'row',
    marginBottom: 10,
    gap: 8,
  },
  discountInput: {
    flex: 1,
    height: 38,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 10,
    fontSize: 13,
    backgroundColor: '#FFFFFF',
  },
  applyDiscountBtn: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: 6,
  },
  applyDiscountText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  modalTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  modalTotalLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalTotalAmount: {
    fontSize: 20,
    fontWeight: '900',
    color: '#15803D',
  },
  modalProceedBtn: {
    backgroundColor: '#16A34A',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalProceedBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});

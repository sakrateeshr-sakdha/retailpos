import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Product, Category } from '../types/index';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/index';
import { upsertProducts, getCategoriesOffline } from '../database/index';

interface QuickAddProductModalProps {
  visible: boolean;
  initialBarcode?: string;
  onClose: () => void;
  onSuccess: (product: Product) => void;
}

const COMMON_UNITS = ['pcs', 'kg', 'gm', 'ltr', 'pack', 'box', 'bottle'];

export const QuickAddProductModal: React.FC<QuickAddProductModalProps> = ({
  visible,
  initialBarcode = '',
  onClose,
  onSuccess,
}) => {
  const { user, shop, verifyAdminPin } = useAuth();

  const [name, setName] = useState('');
  const [barcode, setBarcode] = useState(initialBarcode);
  const [sellingPrice, setSellingPrice] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [stockQuantity, setStockQuantity] = useState('20');
  const [unit, setUnit] = useState('pcs');
  const [categoryId, setCategoryId] = useState('');
  const [adminPin, setAdminPin] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      setBarcode(initialBarcode);
      loadCategories();
    } else {
      // Reset form
      setName('');
      setSellingPrice('');
      setPurchasePrice('');
      setStockQuantity('20');
      setUnit('pcs');
      setCategoryId('');
      setAdminPin('');
    }
  }, [visible, initialBarcode]);

  const loadCategories = async () => {
    try {
      const cats = await getCategoriesOffline();
      setCategories(cats);
      if (cats.length > 0 && !categoryId) {
        setCategoryId(cats[0].id);
      }
    } catch {
      // Fallback
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Required', 'Please enter product name');
      return;
    }
    const priceNum = parseFloat(sellingPrice);
    if (isNaN(priceNum) || priceNum <= 0) {
      Alert.alert('Required', 'Please enter a valid selling price');
      return;
    }

    setLoading(true);

    try {
      let adminToken: string | undefined = undefined;

      // If user is cashier, require Admin PIN verification
      if (user?.role === 'CASHIER') {
        if (!adminPin.trim()) {
          setLoading(false);
          Alert.alert('Admin Verification', 'Admin PIN is required to create new products');
          return;
        }
        const verifyRes = await verifyAdminPin(adminPin.trim());
        if (!verifyRes.success) {
          setLoading(false);
          Alert.alert('PIN Rejected', verifyRes.message || 'Incorrect Admin PIN');
          return;
        }
        adminToken = verifyRes.adminAuthToken;
      }

      const pCost = parseFloat(purchasePrice) || 0;
      const pStock = parseFloat(stockQuantity) || 0;

      // Attempt server creation
      let createdProduct: Product;
      try {
        const res = await api.createProduct(
          {
            shopId: shop?.id,
            name: name.trim(),
            barcode: barcode.trim() || undefined,
            sellingPrice: priceNum,
            purchasePrice: pCost,
            stockQuantity: pStock,
            unit,
            categoryId: categoryId || undefined,
            lowStockThreshold: 5,
            isActive: true,
          },
          adminToken
        );
        createdProduct = res.product;
      } catch (networkErr) {
        // Offline Fallback: create local product record in SQLite
        createdProduct = {
          id: `local_prod_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          shopId: shop?.id || 'shop_local',
          categoryId: categoryId || undefined,
          name: name.trim(),
          barcode: barcode.trim() || undefined,
          purchasePrice: pCost,
          sellingPrice: priceNum,
          stockQuantity: pStock,
          unit,
          lowStockThreshold: 5,
          isActive: true,
        };
      }

      // Ensure local SQLite cache is immediately updated
      await upsertProducts([createdProduct]);

      Alert.alert('Success', `"${createdProduct.name}" added to catalogue`);
      onSuccess(createdProduct);
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not add product');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={styles.modalCard}>
          <View style={styles.header}>
            <Text style={styles.title}>⚡ Quick Add Product</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {/* Product Name */}
            <Text style={styles.label}>Product Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Fortune Sunflower Oil 1L"
              value={name}
              onChangeText={setName}
            />

            {/* Barcode */}
            <Text style={styles.label}>Barcode / SKU</Text>
            <TextInput
              style={styles.input}
              placeholder="Scan or enter barcode"
              value={barcode}
              onChangeText={setBarcode}
              keyboardType="default"
              autoCapitalize="none"
            />

            {/* Price & Stock Row */}
            <View style={styles.row}>
              <View style={[styles.flex1, { marginRight: 8 }]}>
                <Text style={styles.label}>Selling Price (₹) *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0.00"
                  value={sellingPrice}
                  onChangeText={setSellingPrice}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={[styles.flex1, { marginLeft: 8 }]}>
                <Text style={styles.label}>Purchase Price (₹)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0.00"
                  value={purchasePrice}
                  onChangeText={setPurchasePrice}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            {/* Stock & Unit */}
            <View style={styles.row}>
              <View style={[styles.flex1, { marginRight: 8 }]}>
                <Text style={styles.label}>Initial Stock</Text>
                <TextInput
                  style={styles.input}
                  placeholder="20"
                  value={stockQuantity}
                  onChangeText={setStockQuantity}
                  keyboardType="number-pad"
                />
              </View>
              <View style={[styles.flex1, { marginLeft: 8 }]}>
                <Text style={styles.label}>Unit</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.unitScroll}>
                  {COMMON_UNITS.map((u) => (
                    <TouchableOpacity
                      key={u}
                      style={[styles.unitChip, unit === u && styles.unitChipActive]}
                      onPress={() => setUnit(u)}
                    >
                      <Text style={[styles.unitChipText, unit === u && styles.unitChipTextActive]}>
                        {u}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>

            {/* Admin PIN if Cashier */}
            {user?.role === 'CASHIER' && (
              <View style={styles.adminSection}>
                <Text style={styles.adminLabel}>🔒 Admin PIN Required for Catalog Addition</Text>
                <TextInput
                  style={[styles.input, styles.pinInput]}
                  placeholder="Enter 4-6 digit Admin PIN"
                  value={adminPin}
                  onChangeText={setAdminPin}
                  secureTextEntry
                  keyboardType="numeric"
                  maxLength={6}
                />
              </View>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={loading}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitBtn, loading && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.submitBtnText}>Add & Insert to Cart</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#0F172A',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  closeBtn: {
    padding: 4,
  },
  closeText: {
    color: '#94A3B8',
    fontSize: 18,
    fontWeight: 'bold',
  },
  body: {
    padding: 18,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flex1: {
    flex: 1,
  },
  unitScroll: {
    flexDirection: 'row',
    marginTop: 2,
  },
  unitChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  unitChipActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  unitChipText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  unitChipTextActive: {
    color: '#FFFFFF',
  },
  adminSection: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  adminLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 8,
  },
  pinInput: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FCD34D',
  },
  footer: {
    flexDirection: 'row',
    padding: 14,
    borderTopWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
  },
  cancelBtnText: {
    color: '#475569',
    fontWeight: '600',
    fontSize: 14,
  },
  submitBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#2563EB',
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});

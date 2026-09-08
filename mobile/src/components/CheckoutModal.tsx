import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { PaymentMethod, Customer, Sale, Shop } from '../types/index';
import { useCart } from '../hooks/useCart';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/index';
import { syncService } from '../sync/SyncService';
import {
  createOfflineSaleTransaction,
  searchCustomersOffline,
  updateLocalProductStock,
  updateLocalCustomerCredit,
} from '../database/index';

interface CheckoutModalProps {
  visible: boolean;
  onClose: () => void;
  onSaleCompleted?: (sale: Sale, isOffline: boolean) => void;
  onSuccess?: (sale: Sale) => void;
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  visible,
  onClose,
  onSaleCompleted,
  onSuccess,
}) => {
  const { shop, user } = useAuth();
  const { items, subtotal, discount, total, clearCart } = useCart();

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [cashReceived, setCashReceived] = useState<string>('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState<string>('');
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [draftInvoiceNumber] = useState<string>(
    () => `${shop?.invoicePrefix || 'INV-'}${Math.floor(1000 + Math.random() * 9000)}`
  );

  const currency = shop?.currency || '₹';

  useEffect(() => {
    if (visible) {
      setPaymentMethod('CASH');
      setCashReceived(String(Math.ceil(total)));
      setSelectedCustomer(null);
      setCustomerSearch('');
      setCustomerResults([]);
      setSubmitting(false);
    }
  }, [visible, total]);

  useEffect(() => {
    if (paymentMethod === 'CREDIT' && customerSearch.trim()) {
      searchCustomersOffline(customerSearch).then(setCustomerResults);
    } else {
      setCustomerResults([]);
    }
  }, [paymentMethod, customerSearch]);

  const numCashReceived = parseFloat(cashReceived) || 0;
  const changeGiven = Math.max(0, Math.round((numCashReceived - total) * 100) / 100);

  const handleQuickCash = (amt: number) => {
    setCashReceived(String(amt));
  };

  const handleCompleteSale = async () => {
    if (items.length === 0) {
      Alert.alert('Empty Cart', 'Please add products to cart before checkout.');
      return;
    }

    if (paymentMethod === 'CASH' && numCashReceived < total) {
      Alert.alert('Insufficient Cash', `Cash received (${currency}${numCashReceived}) is less than total amount (${currency}${total}).`);
      return;
    }

    if (paymentMethod === 'CREDIT' && !selectedCustomer) {
      Alert.alert('Customer Required', 'Please select a customer for Khata (Credit) sale.');
      return;
    }

    if (submitting) return; // Prevent double submission
    setSubmitting(true);

    const idempotencyKey = generateUUID();
    const isOnline = syncService.getOnlineStatus();

    const salePayload = {
      idempotencyKey,
      customerId: selectedCustomer?.id || null,
      items: items.map((i) => ({
        productId: i.product.id,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        unit: i.product.unit,
        productName: i.product.name,
      })),
      subtotal,
      discount,
      total,
      paymentMethod,
      cashReceived: paymentMethod === 'CASH' ? numCashReceived : null,
      changeGiven: paymentMethod === 'CASH' ? changeGiven : null,
      notes: notes.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    if (isOnline) {
      try {
        const response = await api.createSale(salePayload, idempotencyKey);
        if (response.success && response.sale) {
          // Update local SQLite stock for responsiveness
          for (const item of items) {
            await updateLocalProductStock(item.product.id, item.quantity);
          }
          if (selectedCustomer && paymentMethod === 'CREDIT') {
            await updateLocalCustomerCredit(selectedCustomer.id, total);
          }

          clearCart();
          onClose();
          if (onSaleCompleted) onSaleCompleted(response.sale, false);
          if (onSuccess) onSuccess(response.sale);
          return;
        }
      } catch (err: any) {
        console.warn('Online sale submission failed, fallback to offline SQLite:', err);
      }
    }

    // Offline Sale Fallback (or when device is offline)
    try {
      await createOfflineSaleTransaction(salePayload, idempotencyKey, draftInvoiceNumber);

      const localOfflineSale: Sale = {
        id: `offline_${idempotencyKey.slice(0, 8)}`,
        shopId: shop?.id || 'offline_shop',
        userId: user?.id || 'offline_user',
        customerId: selectedCustomer?.id || null,
        invoiceNumber: draftInvoiceNumber,
        idempotencyKey,
        subtotal,
        discount,
        total,
        paymentMethod,
        cashReceived: paymentMethod === 'CASH' ? numCashReceived : null,
        changeGiven: paymentMethod === 'CASH' ? changeGiven : null,
        status: 'COMPLETED',
        notes: notes.trim() || null,
        createdAt: new Date().toISOString(),
        items: items.map((i) => ({
          productId: i.product.id,
          productName: i.product.name,
          quantity: i.quantity,
          unit: i.product.unit,
          unitPrice: i.unitPrice,
          totalPrice: i.lineTotal,
        })),
        payments: [
          {
            method: paymentMethod,
            amount: total,
            cashReceived: paymentMethod === 'CASH' ? numCashReceived : null,
            changeGiven: paymentMethod === 'CASH' ? changeGiven : null,
          },
        ],
        customer: selectedCustomer,
        user: user || undefined,
      };

      clearCart();
      onClose();
      if (onSaleCompleted) onSaleCompleted(localOfflineSale, true);
      if (onSuccess) onSuccess(localOfflineSale);
    } catch (dbErr: any) {
      Alert.alert('Checkout Error', dbErr.message || 'Failed to save offline sale');
    } finally {
      setSubmitting(false);
    }
  };

  // UPI QR String
  const upiId = shop?.upiId || 'merchant@upi';
  const upiPayload = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(
    shop?.name || 'Grocery Store'
  )}&am=${total.toFixed(2)}&cu=INR&tn=${draftInvoiceNumber}`;

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>Checkout</Text>
              <Text style={styles.headerSubtitle}>
                {items.length} items • Total: {currency}{total.toFixed(2)}
              </Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollBody} keyboardShouldPersistTaps="handled">
            {/* Payment Method Selector */}
            <Text style={styles.sectionLabel}>Select Payment Mode</Text>
            <View style={styles.methodsRow}>
              {(['CASH', 'UPI', 'CARD', 'CREDIT'] as PaymentMethod[]).map((m) => {
                const isSelected = paymentMethod === m;
                const label = m === 'CREDIT' ? 'KHATA' : m;
                return (
                  <TouchableOpacity
                    key={m}
                    style={[styles.methodTab, isSelected && styles.methodTabActive]}
                    onPress={() => setPaymentMethod(m)}
                  >
                    <Text style={[styles.methodTabText, isSelected && styles.methodTabTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* CASH Flow */}
            {paymentMethod === 'CASH' && (
              <View style={styles.paymentSection}>
                <Text style={styles.subLabel}>Quick Tender</Text>
                <View style={styles.quickCashRow}>
                  {[Math.ceil(total), 100, 200, 500, 1000].map((amt, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={[
                        styles.quickCashBtn,
                        numCashReceived === amt && styles.quickCashBtnActive,
                      ]}
                      onPress={() => handleQuickCash(amt)}
                    >
                      <Text
                        style={[
                          styles.quickCashBtnText,
                          numCashReceived === amt && styles.quickCashBtnTextActive,
                        ]}
                      >
                        {currency}{amt}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.subLabel}>Cash Received ({currency})</Text>
                <TextInput
                  style={styles.cashInput}
                  keyboardType="numeric"
                  value={cashReceived}
                  onChangeText={setCashReceived}
                  placeholder="0.00"
                />

                {/* Change return banner */}
                <View style={styles.changeBanner}>
                  <Text style={styles.changeLabel}>Change to Return:</Text>
                  <Text style={styles.changeValue}>
                    {currency}{changeGiven.toFixed(2)}
                  </Text>
                </View>
              </View>
            )}

            {/* UPI QR Flow */}
            {paymentMethod === 'UPI' && (
              <View style={styles.upiSection}>
                <Text style={styles.upiNote}>
                  Ask customer to scan with GPay, PhonePe, Paytm, or BHIM
                </Text>
                <View style={styles.qrWrapper}>
                  <QRCode value={upiPayload} size={180} />
                </View>
                <Text style={styles.upiIdLabel}>Merchant UPI: {upiId}</Text>
                <Text style={styles.upiAmountLabel}>
                  Amount: {currency}{total.toFixed(2)}
                </Text>
              </View>
            )}

            {/* CARD Flow */}
            {paymentMethod === 'CARD' && (
              <View style={styles.cardSection}>
                <Text style={styles.cardInfo}>
                  Swipe or tap card on POS terminal for {currency}{total.toFixed(2)}
                </Text>
                <Text style={styles.cardSubtext}>
                  Once the external card machine prints the slip, tap Complete Sale below.
                </Text>
              </View>
            )}

            {/* KHATA (Credit) Flow */}
            {paymentMethod === 'CREDIT' && (
              <View style={styles.khataSection}>
                <Text style={styles.subLabel}>Search / Select Customer (Required)</Text>
                {selectedCustomer ? (
                  <View style={styles.selectedCustomerCard}>
                    <View style={styles.customerInfo}>
                      <Text style={styles.custName}>{selectedCustomer.name}</Text>
                      <Text style={styles.custPhone}>{selectedCustomer.phone || 'No phone'}</Text>
                      <Text style={styles.custBal}>
                        Current Dues: {currency}{Number(selectedCustomer.totalCredit || 0).toFixed(2)}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.removeCustBtn}
                      onPress={() => setSelectedCustomer(null)}
                    >
                      <Text style={styles.removeCustText}>Change</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View>
                    <TextInput
                      style={styles.custSearchInput}
                      placeholder="Type customer name or phone..."
                      value={customerSearch}
                      onChangeText={setCustomerSearch}
                    />
                    {customerResults.map((c) => (
                      <TouchableOpacity
                        key={c.id}
                        style={styles.custResultRow}
                        onPress={() => {
                          setSelectedCustomer(c);
                          setCustomerSearch('');
                        }}
                      >
                        <View>
                          <Text style={styles.custResultName}>{c.name}</Text>
                          <Text style={styles.custResultPhone}>{c.phone || 'No phone'}</Text>
                        </View>
                        <Text style={styles.custResultCredit}>
                          Dues: {currency}{Number(c.totalCredit || 0).toFixed(2)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}
          </ScrollView>

          {/* Action Button */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.completeBtn, submitting && styles.completeBtnDisabled]}
              onPress={handleCompleteSale}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.completeBtnText}>
                  Complete Sale • {currency}{total.toFixed(2)}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#15803d',
    fontWeight: '600',
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  closeBtnText: {
    fontSize: 18,
    color: '#9ca3af',
    fontWeight: 'bold',
  },
  scrollBody: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 8,
  },
  methodsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  methodTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  methodTabActive: {
    backgroundColor: '#15803d',
    borderColor: '#15803d',
  },
  methodTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4b5563',
  },
  methodTabTextActive: {
    color: '#ffffff',
  },
  paymentSection: {
    marginBottom: 12,
  },
  subLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4b5563',
    marginBottom: 6,
  },
  quickCashRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  quickCashBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  quickCashBtnActive: {
    backgroundColor: '#dcfce7',
    borderColor: '#22c55e',
  },
  quickCashBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#374151',
  },
  quickCashBtnTextActive: {
    color: '#15803d',
  },
  cashInput: {
    backgroundColor: '#f9fafb',
    borderWidth: 1.5,
    borderColor: '#15803d',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 12,
  },
  changeBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#dcfce7',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  changeLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#166534',
  },
  changeValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#15803d',
  },
  upiSection: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  upiNote: {
    fontSize: 12,
    color: '#4b5563',
    marginBottom: 14,
    textAlign: 'center',
  },
  qrWrapper: {
    padding: 12,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    marginBottom: 10,
  },
  upiIdLabel: {
    fontSize: 12,
    color: '#6b7280',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  upiAmountLabel: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#15803d',
    marginTop: 4,
  },
  cardSection: {
    backgroundColor: '#f9fafb',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
  },
  cardInfo: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1f2937',
    textAlign: 'center',
    marginBottom: 6,
  },
  cardSubtext: {
    fontSize: 11,
    color: '#6b7280',
    textAlign: 'center',
  },
  khataSection: {
    marginBottom: 16,
  },
  custSearchInput: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    marginBottom: 8,
  },
  custResultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  custResultName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },
  custResultPhone: {
    fontSize: 11,
    color: '#6b7280',
  },
  custResultCredit: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#b45309',
  },
  selectedCustomerCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fde68a',
    padding: 12,
    borderRadius: 12,
  },
  customerInfo: {
    flex: 1,
  },
  custName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#92400e',
  },
  custPhone: {
    fontSize: 11,
    color: '#78350f',
  },
  custBal: {
    fontSize: 12,
    fontWeight: '700',
    color: '#b45309',
    marginTop: 2,
  },
  removeCustBtn: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  removeCustText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#b45309',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  completeBtn: {
    backgroundColor: '#15803d',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#15803d',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 2 },
  },
  completeBtnDisabled: {
    opacity: 0.6,
  },
  completeBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
});

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
  Modal,
  Alert,
  ScrollView,
} from 'react-native';
import { Customer, PaymentMethod } from '../types/index';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/index';
import {
  searchCustomersOffline,
  upsertCustomers,
  updateLocalCustomerCredit,
} from '../database/index';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { OfflineBanner } from '../components/OfflineBanner';

export const KhataScreen: React.FC = () => {
  const { shop } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [totalCredit, setTotalCredit] = useState<number>(0);

  // Add Customer Modal
  const [addModalVisible, setAddModalVisible] = useState<boolean>(false);
  const [newName, setNewName] = useState<string>('');
  const [newPhone, setNewPhone] = useState<string>('');
  const [newOpeningBalance, setNewOpeningBalance] = useState<string>('');
  const [savingCustomer, setSavingCustomer] = useState<boolean>(false);

  // Settle / Payment Modal
  const [paymentModalVisible, setPaymentModalVisible] = useState<boolean>(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [paymentNotes, setPaymentNotes] = useState<string>('');
  const [recordingPayment, setRecordingPayment] = useState<boolean>(false);

  const loadCustomers = useCallback(async () => {
    try {
      // Try fetching from server
      let fetchedFromServer = false;
      try {
        const res = await api.getCustomers({ search: search.trim() || undefined });
        if (res.success && res.customers) {
          setCustomers(res.customers);
          setTotalCredit(Number(res.summary?.totalOutstandingCredit || 0));
          upsertCustomers(res.customers).catch(() => {});
          fetchedFromServer = true;
        }
      } catch {
        // Offline
      }

      if (!fetchedFromServer) {
        const offlineCusts = await searchCustomersOffline(search);
        setCustomers(offlineCusts);
        const sum = offlineCusts.reduce((acc, c) => acc + Number(c.totalCredit || 0), 0);
        setTotalCredit(sum);
      }
    } catch (err: any) {
      console.warn('Error loading customers:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadCustomers();
  };

  const handleCreateCustomer = async () => {
    if (!newName.trim()) {
      Alert.alert('Required', 'Please enter customer name');
      return;
    }

    setSavingCustomer(true);
    try {
      const openBal = parseFloat(newOpeningBalance) || 0;
      let newCust: Customer;
      try {
        const res = await api.createCustomer({
          name: newName.trim(),
          phone: newPhone.trim() || undefined,
          openingBalance: openBal,
        });
        newCust = res.customer;
      } catch {
        newCust = {
          id: `local_cust_${Date.now()}`,
          shopId: shop?.id || 'local_shop',
          name: newName.trim(),
          phone: newPhone.trim() || undefined,
          totalCredit: openBal,
        };
      }

      await upsertCustomers([newCust]);
      Alert.alert('Success', `Customer "${newCust.name}" added`);
      setAddModalVisible(false);
      setNewName('');
      setNewPhone('');
      setNewOpeningBalance('');
      loadCustomers();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create customer');
    } finally {
      setSavingCustomer(false);
    }
  };

  const handleRecordPayment = async () => {
    if (!selectedCustomer) return;
    const amt = parseFloat(paymentAmount);
    if (isNaN(amt) || amt <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid payment amount');
      return;
    }

    setRecordingPayment(true);
    try {
      try {
        await api.recordCustomerPayment(selectedCustomer.id, {
          amount: amt,
          paymentMethod,
          notes: paymentNotes.trim() || undefined,
        });
      } catch {
        // Offline: update local credit directly
        await updateLocalCustomerCredit(selectedCustomer.id, -amt);
      }

      Alert.alert(
        'Payment Recorded',
        `Successfully received ${shop?.currency || '₹'}${amt.toFixed(2)} from ${selectedCustomer.name}`
      );
      setPaymentModalVisible(false);
      setSelectedCustomer(null);
      setPaymentAmount('');
      setPaymentNotes('');
      loadCustomers();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to record payment');
    } finally {
      setRecordingPayment(false);
    }
  };

  const currency = shop?.currency || '₹';

  return (
    <ScreenWrapper backgroundColor="#F8FAFC">
      <OfflineBanner />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Khata (Customer Credit)</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setAddModalVisible(true)}>
          <Text style={styles.addBtnText}>+ New Customer</Text>
        </TouchableOpacity>
      </View>

      {/* Total Credit KPI Card */}
      <View style={styles.kpiContainer}>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Total Outstanding Khata Debt</Text>
          <Text style={styles.kpiValue}>{currency}{totalCredit.toFixed(2)}</Text>
          <Text style={styles.kpiSub}>Across {customers.length} customer accounts</Text>
        </View>
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by customer name or phone..."
          placeholderTextColor="#94A3B8"
          value={search}
          onChangeText={setSearch}
          keyboardType="default"
        />
      </View>

      {/* Customer List */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <FlatList
          data={customers}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No customers found</Text>
            </View>
          }
          renderItem={({ item }) => {
            const creditNum = Number(item.totalCredit || 0);
            const hasDebt = creditNum > 0;
            return (
              <View style={styles.customerCard}>
                <View style={styles.customerInfo}>
                  <Text style={styles.customerName}>{item.name}</Text>
                  {item.phone && <Text style={styles.customerPhone}>📞 {item.phone}</Text>}
                </View>

                <View style={styles.balanceCol}>
                  <Text style={styles.balanceLabel}>Khata Balance</Text>
                  <Text style={[styles.balanceValue, hasDebt && styles.balanceDue]}>
                    {currency}{creditNum.toFixed(2)}
                  </Text>
                  {hasDebt && (
                    <TouchableOpacity
                      style={styles.settleBtn}
                      onPress={() => {
                        setSelectedCustomer(item);
                        setPaymentAmount(creditNum.toString());
                        setPaymentModalVisible(true);
                      }}
                    >
                      <Text style={styles.settleBtnText}>Receive ₹</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Add Customer Modal */}
      <Modal visible={addModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Khata Customer</Text>
              <TouchableOpacity onPress={() => setAddModalVisible(false)}>
                <Text style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.fieldLabel}>Customer Name *</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Ramesh Kumar"
                value={newName}
                onChangeText={setNewName}
              />

              <Text style={styles.fieldLabel}>Mobile Number</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="10-digit mobile number"
                value={newPhone}
                onChangeText={setNewPhone}
                keyboardType="phone-pad"
              />

              <Text style={styles.fieldLabel}>Opening Credit / Due (Optional)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="0.00"
                value={newOpeningBalance}
                onChangeText={setNewOpeningBalance}
                keyboardType="decimal-pad"
              />
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setAddModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, savingCustomer && { opacity: 0.6 }]}
                onPress={handleCreateCustomer}
                disabled={savingCustomer}
              >
                {savingCustomer ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.confirmBtnText}>Save Customer</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Record Payment Modal */}
      <Modal visible={paymentModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Receive Khata Payment</Text>
              <TouchableOpacity onPress={() => setPaymentModalVisible(false)}>
                <Text style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.customerNotice}>
                Customer: <Text style={{ fontWeight: '800' }}>{selectedCustomer?.name}</Text>
              </Text>
              <Text style={styles.dueNotice}>
                Outstanding: {currency}{(selectedCustomer?.totalCredit || 0).toFixed(2)}
              </Text>

              <Text style={styles.fieldLabel}>Amount Received ({currency}) *</Text>
              <TextInput
                style={[styles.modalInput, styles.highlightInput]}
                placeholder="0.00"
                value={paymentAmount}
                onChangeText={setPaymentAmount}
                keyboardType="decimal-pad"
              />

              <Text style={styles.fieldLabel}>Payment Mode</Text>
              <View style={styles.methodToggleRow}>
                {(['CASH', 'UPI'] as PaymentMethod[]).map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[
                      styles.methodToggleBtn,
                      paymentMethod === m && styles.methodToggleBtnActive,
                    ]}
                    onPress={() => setPaymentMethod(m)}
                  >
                    <Text
                      style={[
                        styles.methodToggleText,
                        paymentMethod === m && styles.methodToggleTextActive,
                      ]}
                    >
                      {m}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Notes (Optional)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Paid in full / Part payment"
                value={paymentNotes}
                onChangeText={setPaymentNotes}
              />
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setPaymentModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, recordingPayment && { opacity: 0.6 }]}
                onPress={handleRecordPayment}
                disabled={recordingPayment}
              >
                {recordingPayment ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.confirmBtnText}>Record Payment</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  kpiContainer: {
    padding: 12,
    backgroundColor: '#FFFFFF',
  },
  kpiCard: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    padding: 14,
  },
  kpiLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#991B1B',
  },
  kpiValue: {
    fontSize: 22,
    fontWeight: '900',
    color: '#DC2626',
    marginTop: 4,
  },
  kpiSub: {
    fontSize: 11,
    color: '#7F1D1D',
    marginTop: 2,
  },
  searchContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
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
  customerCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  customerPhone: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 3,
  },
  balanceCol: {
    alignItems: 'flex-end',
  },
  balanceLabel: {
    fontSize: 11,
    color: '#64748B',
  },
  balanceValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#059669',
    marginTop: 2,
  },
  balanceDue: {
    color: '#DC2626',
  },
  settleBtn: {
    marginTop: 6,
    backgroundColor: '#0F172A',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  settleBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
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
    fontSize: 15,
    fontWeight: '600',
    color: '#64748B',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#0F172A',
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  closeText: {
    color: '#94A3B8',
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalBody: {
    padding: 16,
  },
  customerNotice: {
    fontSize: 14,
    color: '#334155',
  },
  dueNotice: {
    fontSize: 13,
    color: '#DC2626',
    fontWeight: '700',
    marginTop: 2,
    marginBottom: 10,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 4,
    marginTop: 8,
  },
  modalInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0F172A',
  },
  highlightInput: {
    borderColor: '#2563EB',
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  methodToggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  methodToggleBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  methodToggleBtnActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  methodToggleText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  methodToggleTextActive: {
    color: '#FFFFFF',
  },
  modalFooter: {
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
  confirmBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#2563EB',
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});

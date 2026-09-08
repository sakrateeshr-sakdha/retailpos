import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/index';
import { ClosingSummary } from '../types/index';
import { OfflineBanner } from '../components/OfflineBanner';

export const ClosingScreen: React.FC = () => {
  const { shop, user } = useAuth();
  const [summary, setSummary] = useState<ClosingSummary | null>(null);
  const [actualCash, setActualCash] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await api.getClosingSummary();
      if (res.success && res.summary) {
        setSummary(res.summary);
      }
    } catch (err: any) {
      // Fallback summary if offline
      setSummary({
        date: new Date().toISOString().split('T')[0],
        totalBills: 0,
        grossSales: 0,
        discounts: 0,
        netSales: 0,
        cashSales: 0,
        upiSales: 0,
        cardSales: 0,
        creditSales: 0,
        expectedCash: 0,
        isClosed: false,
        closingRecord: null,
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchSummary();
  };

  const expectedCashNum = summary?.expectedCash ?? 0;
  const actualCashNum = parseFloat(actualCash);
  const hasEnteredCash = !isNaN(actualCashNum);
  const difference = hasEnteredCash ? actualCashNum - expectedCashNum : 0;

  const handleCloseRegister = async () => {
    if (!hasEnteredCash) {
      Alert.alert('Required', 'Please enter the physical cash counted in drawer');
      return;
    }

    Alert.alert(
      'Confirm Register Closing',
      `Expected Cash: ${shop?.currency || '₹'}${expectedCashNum.toFixed(2)}\nActual Cash: ${shop?.currency || '₹'}${actualCashNum.toFixed(2)}\nDifference: ${shop?.currency || '₹'}${difference.toFixed(2)}\n\nAre you sure you want to close today's register?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm & Close',
          onPress: async () => {
            setSubmitting(true);
            try {
              const res = await api.closeDay({
                actualCash: actualCashNum,
                notes: notes.trim() || undefined,
              });
              if (res.success) {
                Alert.alert('Register Closed', res.message || 'Daily register successfully closed');
                fetchSummary();
              } else {
                Alert.alert('Error', res.message || 'Failed to close register');
              }
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Could not close register');
            } finally {
              setSubmitting(false);
            }
          },
        },
      ]
    );
  };

  const currency = shop?.currency || '₹';

  return (
    <ScreenWrapper backgroundColor="#F8FAFC">
      <OfflineBanner />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Daily Register Closing</Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* Status Header */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Register Status</Text>
            <View style={styles.rowBetween}>
              <Text style={styles.metaLabel}>Date</Text>
              <Text style={styles.metaValue}>{summary?.date || new Date().toLocaleDateString()}</Text>
            </View>
            <View style={styles.rowBetween}>
              <Text style={styles.metaLabel}>Cashier</Text>
              <Text style={styles.metaValue}>{user?.name}</Text>
            </View>
            <View style={styles.rowBetween}>
              <Text style={styles.metaLabel}>Total Bills Billed</Text>
              <Text style={styles.metaValue}>{summary?.totalBills ?? 0}</Text>
            </View>
          </View>

          {/* Breakdown Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Payment Breakdown</Text>
            <View style={styles.rowBetween}>
              <Text style={styles.subLabel}>💵 Cash Sales</Text>
              <Text style={styles.subVal}>{currency}{(summary?.cashSales ?? 0).toFixed(2)}</Text>
            </View>
            <View style={styles.rowBetween}>
              <Text style={styles.subLabel}>📱 UPI Sales</Text>
              <Text style={styles.subVal}>{currency}{(summary?.upiSales ?? 0).toFixed(2)}</Text>
            </View>
            <View style={styles.rowBetween}>
              <Text style={styles.subLabel}>💳 Card Sales</Text>
              <Text style={styles.subVal}>{currency}{(summary?.cardSales ?? 0).toFixed(2)}</Text>
            </View>
            <View style={styles.rowBetween}>
              <Text style={styles.subLabel}>📒 Khata (Credit)</Text>
              <Text style={styles.subVal}>{currency}{(summary?.creditSales ?? 0).toFixed(2)}</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.rowBetween}>
              <Text style={styles.boldLabel}>Total Sales</Text>
              <Text style={styles.boldVal}>{currency}{(summary?.netSales ?? 0).toFixed(2)}</Text>
            </View>
          </View>

          {/* Cash Drawer Reconciliation */}
          <View style={[styles.card, styles.highlightCard]}>
            <Text style={styles.cardTitle}>Cash Drawer Reconciliation</Text>

            <View style={styles.rowBetween}>
              <Text style={styles.reconcileLabel}>System Expected Cash:</Text>
              <Text style={styles.reconcileExpected}>{currency}{expectedCashNum.toFixed(2)}</Text>
            </View>

            <Text style={styles.inputLabel}>Physical Cash in Register ({currency}) *</Text>
            <TextInput
              style={styles.cashInput}
              placeholder="0.00"
              value={actualCash}
              onChangeText={setActualCash}
              keyboardType="decimal-pad"
            />

            {hasEnteredCash && (
              <View
                style={[
                  styles.diffContainer,
                  difference === 0
                    ? styles.diffBalanced
                    : difference > 0
                    ? styles.diffSurplus
                    : styles.diffDeficit,
                ]}
              >
                <Text style={styles.diffLabel}>
                  {difference === 0
                    ? '✅ Cash Drawer Balanced'
                    : difference > 0
                    ? `🔵 Surplus (+${currency}${difference.toFixed(2)})`
                    : `🔴 Shortage (${currency}${difference.toFixed(2)})`}
                </Text>
              </View>
            )}

            <Text style={styles.inputLabel}>Closing Notes (Optional)</Text>
            <TextInput
              style={styles.notesInput}
              placeholder="e.g. Discrepancy explanation or handover notes"
              value={notes}
              onChangeText={setNotes}
              multiline
            />

            <TouchableOpacity
              style={[styles.closeRegisterBtn, submitting && { opacity: 0.7 }]}
              onPress={handleCloseRegister}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.closeRegisterText}>🔒 Close Daily Register</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
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
  content: {
    padding: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  highlightCard: {
    borderColor: '#93C5FD',
    backgroundColor: '#F0F9FF',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 12,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 4,
  },
  metaLabel: {
    fontSize: 13,
    color: '#64748B',
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  subLabel: {
    fontSize: 13,
    color: '#475569',
  },
  subVal: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  divider: {
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    marginVertical: 8,
  },
  boldLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  boldVal: {
    fontSize: 16,
    fontWeight: '900',
    color: '#2563EB',
  },
  reconcileLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E3A8A',
  },
  reconcileExpected: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1E3A8A',
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginTop: 12,
    marginBottom: 6,
  },
  cashInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#3B82F6',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  diffContainer: {
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  diffBalanced: {
    backgroundColor: '#DCFCE7',
  },
  diffSurplus: {
    backgroundColor: '#DBEAFE',
  },
  diffDeficit: {
    backgroundColor: '#FEE2E2',
  },
  diffLabel: {
    fontSize: 13,
    fontWeight: '800',
  },
  notesInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0F172A',
    minHeight: 60,
    textAlignVertical: 'top',
  },
  closeRegisterBtn: {
    marginTop: 16,
    backgroundColor: '#0F172A',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  closeRegisterText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

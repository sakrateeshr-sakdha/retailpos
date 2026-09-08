import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Sale } from '../types/index';
import { useAuth } from '../auth/AuthContext';
import { printerService } from '../hardware/PrinterService';

interface ReceiptModalProps {
  visible: boolean;
  sale: Sale | null;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ visible, sale, onClose }) => {
  const { shop } = useAuth();
  const [printing, setPrinting] = useState(false);

  if (!sale) return null;

  const currency = shop?.currency || '₹';
  const paperSize = printerService.getPaperSize();

  const handlePrint = async () => {
    setPrinting(true);
    try {
      const res = await printerService.printReceipt(sale, shop);
      if (res.success) {
        Alert.alert(
          'Receipt Printed',
          `${res.message}\n\nNote: ${printerService.hardwareStatusNote}`
        );
      } else {
        Alert.alert('Print Error', res.message || 'Failed to print');
      }
    } catch (err: any) {
      Alert.alert('Print Error', err.message || 'Error printing receipt');
    } finally {
      setPrinting(false);
    }
  };

  // Tax calculations if enabled
  const cgstRate = Number(shop?.defaultCgstRate || 0);
  const sgstRate = Number(shop?.defaultSgstRate || 0);
  const totalTaxRate = cgstRate + sgstRate;
  const taxable = shop?.gstEnabled && totalTaxRate > 0 ? sale.total / (1 + totalTaxRate / 100) : 0;
  const totalGst = shop?.gstEnabled && totalTaxRate > 0 ? sale.total - taxable : 0;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* Header Bar */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Receipt: {sale.invoiceNumber}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeHeaderBtn}>
              <Text style={styles.closeHeaderText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Receipt Paper Body */}
          <ScrollView contentContainerStyle={styles.receiptScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.paperContainer}>
              <Text style={styles.shopName}>{shop?.name || 'GROCERY POS'}</Text>
              {shop?.address && <Text style={styles.shopDetail}>{shop.address}</Text>}
              {shop?.phone && <Text style={styles.shopDetail}>Ph: {shop.phone}</Text>}
              {shop?.gstEnabled && shop?.gstNumber && (
                <Text style={styles.shopDetail}>GSTIN: {shop.gstNumber}</Text>
              )}

              <View style={styles.dividerDouble} />

              <View style={styles.rowBetween}>
                <Text style={styles.metaText}>Invoice: {sale.invoiceNumber}</Text>
                <Text style={styles.metaText}>
                  {new Date(sale.createdAt).toLocaleDateString()}
                </Text>
              </View>
              <View style={styles.rowBetween}>
                <Text style={styles.metaText}>
                  Cashier: {sale.user?.name || 'Cashier'}
                </Text>
                <Text style={styles.metaText}>
                  {new Date(sale.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>

              <View style={styles.divider} />

              {/* Items Table Header */}
              <View style={styles.rowBetween}>
                <Text style={[styles.columnHeader, { flex: 2 }]}>Item</Text>
                <Text style={[styles.columnHeader, { flex: 1, textAlign: 'center' }]}>Qty</Text>
                <Text style={[styles.columnHeader, { flex: 1, textAlign: 'right' }]}>Rate</Text>
                <Text style={[styles.columnHeader, { flex: 1, textAlign: 'right' }]}>Total</Text>
              </View>

              <View style={styles.divider} />

              {/* Items List */}
              {sale.items.map((item, idx) => (
                <View key={item.id || idx} style={styles.itemRow}>
                  <Text style={[styles.itemText, { flex: 2 }]} numberOfLines={1}>
                    {item.productName}
                  </Text>
                  <Text style={[styles.itemText, { flex: 1, textAlign: 'center' }]}>
                    {item.quantity} {item.unit || ''}
                  </Text>
                  <Text style={[styles.itemText, { flex: 1, textAlign: 'right' }]}>
                    {currency}{item.unitPrice.toFixed(2)}
                  </Text>
                  <Text style={[styles.itemText, { flex: 1, textAlign: 'right', fontWeight: '600' }]}>
                    {currency}{item.totalPrice.toFixed(2)}
                  </Text>
                </View>
              ))}

              <View style={styles.divider} />

              {/* Financial Totals */}
              <View style={styles.rowBetween}>
                <Text style={styles.summaryLabel}>Subtotal</Text>
                <Text style={styles.summaryValue}>{currency}{sale.subtotal.toFixed(2)}</Text>
              </View>

              {sale.discount > 0 && (
                <View style={styles.rowBetween}>
                  <Text style={[styles.summaryLabel, { color: '#059669' }]}>Discount</Text>
                  <Text style={[styles.summaryValue, { color: '#059669' }]}>
                    -{currency}{sale.discount.toFixed(2)}
                  </Text>
                </View>
              )}

              {/* GST Section */}
              {shop?.gstEnabled && totalGst > 0 && (
                <>
                  <View style={styles.dividerDotted} />
                  <View style={styles.rowBetween}>
                    <Text style={styles.taxText}>Taxable Value</Text>
                    <Text style={styles.taxText}>{currency}{taxable.toFixed(2)}</Text>
                  </View>
                  <View style={styles.rowBetween}>
                    <Text style={styles.taxText}>CGST ({cgstRate}%)</Text>
                    <Text style={styles.taxText}>{currency}{(totalGst / 2).toFixed(2)}</Text>
                  </View>
                  <View style={styles.rowBetween}>
                    <Text style={styles.taxText}>SGST ({sgstRate}%)</Text>
                    <Text style={styles.taxText}>{currency}{(totalGst / 2).toFixed(2)}</Text>
                  </View>
                </>
              )}

              <View style={styles.dividerDouble} />

              <View style={styles.rowBetween}>
                <Text style={styles.grandTotalLabel}>TOTAL</Text>
                <Text style={styles.grandTotalValue}>{currency}{sale.total.toFixed(2)}</Text>
              </View>

              <View style={styles.divider} />

              <View style={styles.rowBetween}>
                <Text style={styles.metaText}>Payment Mode:</Text>
                <Text style={[styles.metaText, { fontWeight: '700' }]}>{sale.paymentMethod}</Text>
              </View>

              {sale.paymentMethod === 'CASH' && sale.cashReceived != null && (
                <>
                  <View style={styles.rowBetween}>
                    <Text style={styles.metaText}>Cash Received:</Text>
                    <Text style={styles.metaText}>{currency}{Number(sale.cashReceived).toFixed(2)}</Text>
                  </View>
                  <View style={styles.rowBetween}>
                    <Text style={styles.metaText}>Change Returned:</Text>
                    <Text style={[styles.metaText, { fontWeight: '700', color: '#1E293B' }]}>
                      {currency}{Number(sale.changeGiven || 0).toFixed(2)}
                    </Text>
                  </View>
                </>
              )}

              <View style={styles.dividerDouble} />

              {/* Footer */}
              <Text style={styles.footerMsg}>
                {shop?.receiptFooter || 'Thank you! Please visit again 😊'}
              </Text>
              <Text style={styles.poweredBy}>RetailPOS Cashier</Text>
            </View>
          </ScrollView>

          {/* Action Bar */}
          <View style={styles.modalActions}>
            <TouchableOpacity
              style={[styles.printBtn, printing && { opacity: 0.7 }]}
              onPress={handlePrint}
              disabled={printing}
            >
              {printing ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.printBtnText}>🖨️ Print ({paperSize})</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
              <Text style={styles.doneBtnText}>Done / New Bill</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
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
    maxWidth: 420,
    maxHeight: '90%',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    overflow: 'hidden',
    display: 'flex',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#0F172A',
  },
  modalTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
  },
  closeHeaderBtn: {
    padding: 4,
  },
  closeHeaderText: {
    color: '#94A3B8',
    fontSize: 18,
    fontWeight: '700',
  },
  receiptScroll: {
    padding: 16,
  },
  paperContainer: {
    backgroundColor: '#FFFFFF',
    padding: 18,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  shopName: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    color: '#0F172A',
    marginBottom: 4,
  },
  shopDetail: {
    fontSize: 11,
    textAlign: 'center',
    color: '#64748B',
    marginBottom: 2,
  },
  dividerDouble: {
    borderBottomWidth: 2,
    borderColor: '#0F172A',
    borderStyle: 'dashed',
    marginVertical: 10,
  },
  divider: {
    borderBottomWidth: 1,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    marginVertical: 8,
  },
  dividerDotted: {
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dotted',
    marginVertical: 6,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 2,
  },
  metaText: {
    fontSize: 12,
    color: '#475569',
  },
  columnHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F172A',
    textTransform: 'uppercase',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 3,
  },
  itemText: {
    fontSize: 12,
    color: '#1E293B',
  },
  summaryLabel: {
    fontSize: 13,
    color: '#475569',
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  taxText: {
    fontSize: 11,
    color: '#64748B',
  },
  grandTotalLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  grandTotalValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
  },
  footerMsg: {
    textAlign: 'center',
    fontSize: 12,
    color: '#334155',
    fontWeight: '500',
    marginTop: 6,
  },
  poweredBy: {
    textAlign: 'center',
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 4,
  },
  modalActions: {
    flexDirection: 'row',
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    gap: 10,
  },
  printBtn: {
    flex: 1,
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  printBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  doneBtn: {
    flex: 1,
    backgroundColor: '#0F172A',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
});

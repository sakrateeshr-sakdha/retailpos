import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { useAuth } from '../auth/AuthContext';
import { printerService } from '../hardware/PrinterService';
import { syncService } from '../sync/SyncService';
import { getPendingSalesOffline } from '../database/index';
import { PrinterDevice, PrinterSize } from '../types/index';
import { getApiBaseUrl } from '../api/client';
import { OfflineBanner } from '../components/OfflineBanner';

export const MoreScreen: React.FC = () => {
  const { user, shop, logout } = useAuth();

  const [paperSize, setPaperSizeState] = useState<PrinterSize>(printerService.getPaperSize());
  const [connectedPrinter, setConnectedPrinter] = useState<PrinterDevice | null>(
    printerService.getConnectedPrinter()
  );
  const [pairedPrinters, setPairedPrinters] = useState<PrinterDevice[]>([]);
  const [discovering, setDiscovering] = useState<boolean>(false);
  const [printingTest, setPrintingTest] = useState<boolean>(false);

  // Sync state
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [pullingCatalogue, setPullingCatalogue] = useState<boolean>(false);

  const [serverUrl, setServerUrl] = useState<string>('');

  useEffect(() => {
    refreshStatus();
  }, []);

  const refreshStatus = async () => {
    try {
      const pending = await getPendingSalesOffline();
      setPendingCount(pending.length);
      setConnectedPrinter(printerService.getConnectedPrinter());
      const url = await getApiBaseUrl();
      setServerUrl(url);
    } catch {}
  };

  const handleTogglePaperSize = async (size: PrinterSize) => {
    setPaperSizeState(size);
    await printerService.setPaperSize(size);
  };

  const handleScanPrinters = async () => {
    setDiscovering(true);
    try {
      const list = await printerService.discoverPrinters();
      setPairedPrinters(list);
    } catch (err: any) {
      Alert.alert('Scan Failed', err.message || 'Error discovering printers');
    } finally {
      setDiscovering(false);
    }
  };

  const handleConnectPrinter = async (dev: PrinterDevice) => {
    const res = await printerService.connectPrinter(dev);
    if (res.success) {
      setConnectedPrinter(printerService.getConnectedPrinter());
      Alert.alert('Printer Selected', `Configured: ${dev.name}`);
    } else {
      Alert.alert('Connection Failed', res.message || 'Could not connect');
    }
  };

  const handleDisconnectPrinter = async () => {
    await printerService.disconnectPrinter();
    setConnectedPrinter(null);
  };

  const handleTestPrint = async () => {
    setPrintingTest(true);
    try {
      const res = await printerService.testPrint(shop);
      Alert.alert(
        'Test Print Executed',
        `${res.message}\n\nNote: ${printerService.hardwareStatusNote}`
      );
    } catch (err: any) {
      Alert.alert('Test Print Failed', err.message || 'Print error');
    } finally {
      setPrintingTest(false);
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const res = await syncService.syncPendingSales();
      await refreshStatus();
      Alert.alert(
        'Sync Complete',
        `Synced: ${res.synced.length} sales\nFailed: ${res.failed.length}`
      );
    } catch (err: any) {
      Alert.alert('Sync Error', err.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleRefreshCatalogue = async () => {
    if (!shop?.id) return;
    setPullingCatalogue(true);
    try {
      const count = await syncService.pullInitialData(shop.id);
      Alert.alert('Catalogue Updated', `Successfully cached ${count} products offline`);
    } catch (err: any) {
      Alert.alert('Download Error', err.message || 'Failed to update catalogue');
    } finally {
      setPullingCatalogue(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to log out of RetailPOS?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: () => logout(),
      },
    ]);
  };

  return (
    <ScreenWrapper backgroundColor="#F8FAFC">
      <OfflineBanner />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings & Hardware</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* User & Shop Profile Card */}
        <View style={styles.card}>
          <Text style={styles.shopTitle}>{shop?.name || 'Retail POS'}</Text>
          <Text style={styles.userInfo}>Logged in as: <Text style={styles.bold}>{user?.name}</Text> ({user?.role})</Text>
          <Text style={styles.serverInfo}>Server: {serverUrl}</Text>
        </View>

        {/* Thermal Printer Settings */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🖨️ Bluetooth Thermal Printer (ESC/POS)</Text>

          {/* Hardware Status Disclaimer */}
          <View style={styles.hardwareDisclaimer}>
            <Text style={styles.disclaimerTitle}>⚠️ Hardware Status:</Text>
            <Text style={styles.disclaimerText}>{printerService.hardwareStatusNote}</Text>
          </View>

          {/* Paper Size Selection */}
          <Text style={styles.subTitle}>Paper Width</Text>
          <View style={styles.toggleRow}>
            {(['58mm', '80mm'] as PrinterSize[]).map((size) => (
              <TouchableOpacity
                key={size}
                style={[styles.toggleBtn, paperSize === size && styles.toggleBtnActive]}
                onPress={() => handleTogglePaperSize(size)}
              >
                <Text style={[styles.toggleBtnText, paperSize === size && styles.toggleBtnTextActive]}>
                  {size} {size === '58mm' ? '(32 cols)' : '(48 cols)'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Connected Printer Status */}
          <View style={styles.printerStatusRow}>
            <Text style={styles.metaLabel}>Current Printer:</Text>
            <Text style={styles.metaValue}>
              {connectedPrinter ? `${connectedPrinter.name} (${connectedPrinter.address})` : 'None configured'}
            </Text>
          </View>

          {connectedPrinter && (
            <TouchableOpacity style={styles.disconnectBtn} onPress={handleDisconnectPrinter}>
              <Text style={styles.disconnectText}>Disconnect Printer</Text>
            </TouchableOpacity>
          )}

          {/* Discover Paired Devices */}
          <TouchableOpacity
            style={styles.scanBtn}
            onPress={handleScanPrinters}
            disabled={discovering}
          >
            {discovering ? (
              <ActivityIndicator color="#0F172A" size="small" />
            ) : (
              <Text style={styles.scanBtnText}>Scan Paired Bluetooth Devices</Text>
            )}
          </TouchableOpacity>

          {pairedPrinters.length > 0 && (
            <View style={styles.pairedList}>
              <Text style={styles.pairedTitle}>Select Bluetooth Device:</Text>
              {pairedPrinters.map((p) => (
                <TouchableOpacity
                  key={p.address}
                  style={styles.deviceRow}
                  onPress={() => handleConnectPrinter(p)}
                >
                  <View>
                    <Text style={styles.deviceName}>{p.name}</Text>
                    <Text style={styles.deviceAddress}>{p.address}</Text>
                  </View>
                  <Text style={styles.selectText}>Select</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Test Print */}
          <TouchableOpacity
            style={[styles.testPrintBtn, printingTest && { opacity: 0.6 }]}
            onPress={handleTestPrint}
            disabled={printingTest}
          >
            {printingTest ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.testPrintText}>Print Sample Receipt</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Offline & Sync Monitor */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🔄 Offline Cache & Data Sync</Text>

          <View style={styles.rowBetween}>
            <Text style={styles.metaLabel}>Pending Offline Sales:</Text>
            <Text style={[styles.metaValue, pendingCount > 0 && styles.pendingHighlight]}>
              {pendingCount} records queued
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.actionBtn, syncing && { opacity: 0.6 }]}
            onPress={handleSyncNow}
            disabled={syncing}
          >
            {syncing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.actionBtnText}>Force Sync Pending Sales Now</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryActionBtn, pullingCatalogue && { opacity: 0.6 }]}
            onPress={handleRefreshCatalogue}
            disabled={pullingCatalogue}
          >
            {pullingCatalogue ? (
              <ActivityIndicator color="#0F172A" size="small" />
            ) : (
              <Text style={styles.secondaryActionBtnText}>Re-download Product Catalogue</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutBtnText}>Log Out of Cashier Account</Text>
        </TouchableOpacity>
      </ScrollView>
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
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  shopTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  userInfo: {
    fontSize: 13,
    color: '#475569',
    marginTop: 4,
  },
  bold: {
    fontWeight: '700',
    color: '#0F172A',
  },
  serverInfo: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 4,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 10,
  },
  hardwareDisclaimer: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FCD34D',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  disclaimerTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#B45309',
  },
  disclaimerText: {
    fontSize: 11,
    color: '#92400E',
    marginTop: 2,
    lineHeight: 15,
  },
  subTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  toggleBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  toggleBtnActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  toggleBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  toggleBtnTextActive: {
    color: '#FFFFFF',
  },
  printerStatusRow: {
    marginVertical: 6,
  },
  metaLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 2,
  },
  pendingHighlight: {
    color: '#DC2626',
  },
  disconnectBtn: {
    alignSelf: 'flex-start',
    marginTop: 4,
    marginBottom: 10,
  },
  disconnectText: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '600',
  },
  scanBtn: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    marginTop: 6,
  },
  scanBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  pairedList: {
    marginTop: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 8,
  },
  pairedTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 6,
  },
  deviceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  deviceName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  deviceAddress: {
    fontSize: 11,
    color: '#64748B',
  },
  selectText: {
    color: '#2563EB',
    fontWeight: '700',
    fontSize: 12,
  },
  testPrintBtn: {
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  testPrintText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 4,
  },
  actionBtn: {
    backgroundColor: '#0F172A',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  secondaryActionBtn: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  secondaryActionBtnText: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 13,
  },
  logoutBtn: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 24,
  },
  logoutBtnText: {
    color: '#DC2626',
    fontWeight: '700',
    fontSize: 14,
  },
});

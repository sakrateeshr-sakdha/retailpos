import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { syncService } from '../sync/SyncService';
import { SyncState } from '../types/index';

export const OfflineBanner: React.FC = () => {
  const [syncState, setSyncState] = useState<{
    status: SyncState;
    pendingCount: number;
    lastSyncTime: string | null;
    error: string | null;
  }>({
    status: 'ONLINE',
    pendingCount: 0,
    lastSyncTime: null,
    error: null,
  });

  useEffect(() => {
    const unsub = syncService.subscribe(setSyncState);
    return unsub;
  }, []);

  if (syncState.status === 'ONLINE' && syncState.pendingCount === 0) {
    return null; // Keep UI completely clean when connected with 0 pending sales
  }

  const isOffline = syncState.status === 'OFFLINE';
  const isSyncing = syncState.status === 'SYNCING';

  return (
    <View
      style={[
        styles.container,
        isOffline ? styles.offlineBg : isSyncing ? styles.syncingBg : styles.pendingBg,
      ]}
    >
      <View style={styles.row}>
        <Text style={styles.dot}>
          {isOffline ? '🔴' : isSyncing ? '🟠' : '🟡'}
        </Text>
        <View style={styles.textContainer}>
          <Text style={styles.title}>
            {isOffline
              ? 'Working Offline'
              : isSyncing
              ? 'Syncing offline bills to server...'
              : `${syncState.pendingCount} bills queued for sync`}
          </Text>
          <Text style={styles.subtitle}>
            {isOffline
              ? 'Billing active. Sales will sync automatically when internet returns.'
              : syncState.lastSyncTime
              ? `Last synced: ${syncState.lastSyncTime}`
              : 'Connecting to server...'}
          </Text>
        </View>
        {!isOffline && !isSyncing && (
          <TouchableOpacity
            style={styles.syncButton}
            onPress={() => syncService.syncPendingSales()}
          >
            <Text style={styles.syncButtonText}>Sync</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    width: '100%',
  },
  offlineBg: {
    backgroundColor: '#fee2e2', // red-100
  },
  syncingBg: {
    backgroundColor: '#ffedd5', // orange-100
  },
  pendingBg: {
    backgroundColor: '#fef9c3', // yellow-100
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    fontSize: 12,
    marginRight: 8,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1f2937',
  },
  subtitle: {
    fontSize: 10,
    color: '#4b5563',
  },
  syncButton: {
    backgroundColor: '#15803d',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  syncButtonText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
  },
});

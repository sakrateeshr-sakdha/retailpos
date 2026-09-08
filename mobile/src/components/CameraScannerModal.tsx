import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';

interface CameraScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
}

const { width } = Dimensions.get('window');
const SCAN_BOX_SIZE = width * 0.7;

export const CameraScannerModal: React.FC<CameraScannerModalProps> = ({
  visible,
  onClose,
  onScan,
}) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [torch, setTorch] = useState(false);

  useEffect(() => {
    if (visible) {
      setScanned(false);
    }
  }, [visible]);

  const handleBarcodeScanned = (result: { type: string; data: string }) => {
    if (scanned || !result.data) return;
    setScanned(true);

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch {}

    onScan(result.data);

    // Auto reset for next scan after 800ms
    setTimeout(() => {
      setScanned(false);
    }, 800);
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={styles.container}>
        {!permission ? (
          <View style={styles.centerBox}>
            <Text style={styles.infoText}>Requesting camera permission...</Text>
          </View>
        ) : !permission.granted ? (
          <View style={styles.centerBox}>
            <Text style={styles.errorTitle}>Camera Permission Required</Text>
            <Text style={styles.errorSubtitle}>
              RetailPOS needs access to your camera to scan barcodes on grocery items.
            </Text>
            <TouchableOpacity style={styles.permButton} onPress={requestPermission}>
              <Text style={styles.permButtonText}>Grant Camera Permission</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeFallback} onPress={onClose}>
              <Text style={styles.closeFallbackText}>Use Manual Search</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.cameraWrapper}>
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              enableTorch={torch}
              barcodeScannerSettings={{
                barcodeTypes: ['ean13', 'ean8', 'upc_a', 'code128', 'code39', 'qr'],
              }}
              onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
            />

            {/* Viewfinder Overlay */}
            <View style={styles.overlay}>
              <View style={styles.unfocusedTop} />
              <View style={styles.middleRow}>
                <View style={styles.unfocusedSide} />
                <View style={[styles.scanBox, scanned && styles.scanBoxSuccess]}>
                  {/* Corner markers */}
                  <View style={[styles.corner, styles.topLeft]} />
                  <View style={[styles.corner, styles.topRight]} />
                  <View style={[styles.corner, styles.bottomLeft]} />
                  <View style={[styles.corner, styles.bottomRight]} />
                </View>
                <View style={styles.unfocusedSide} />
              </View>
              <View style={styles.unfocusedBottom}>
                <Text style={styles.instruction}>
                  {scanned ? 'Scanned! Adding to cart...' : 'Point camera at product barcode'}
                </Text>
              </View>
            </View>

            {/* Controls Header */}
            <View style={styles.header}>
              <TouchableOpacity style={styles.iconButton} onPress={() => setTorch(!torch)}>
                <Text style={styles.iconText}>{torch ? '🔦 On' : '🔦 Off'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <Text style={styles.closeButtonText}>✕ Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  cameraWrapper: {
    flex: 1,
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#ffffff',
  },
  infoText: {
    fontSize: 16,
    color: '#374151',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  errorSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 20,
  },
  permButton: {
    backgroundColor: '#15803d',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  permButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  closeFallback: {
    padding: 10,
  },
  closeFallbackText: {
    color: '#4b5563',
    fontWeight: '600',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  unfocusedTop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  middleRow: {
    flexDirection: 'row',
    height: SCAN_BOX_SIZE,
  },
  unfocusedSide: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  scanBox: {
    width: SCAN_BOX_SIZE,
    height: SCAN_BOX_SIZE,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    position: 'relative',
  },
  scanBoxSuccess: {
    borderColor: '#22c55e',
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
  },
  corner: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderColor: '#22c55e',
  },
  topLeft: {
    top: -1,
    left: -1,
    borderTopWidth: 3,
    borderLeftWidth: 3,
  },
  topRight: {
    top: -1,
    right: -1,
    borderTopWidth: 3,
    borderRightWidth: 3,
  },
  bottomLeft: {
    bottom: -1,
    left: -1,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
  },
  bottomRight: {
    bottom: -1,
    right: -1,
    borderBottomWidth: 3,
    borderRightWidth: 3,
  },
  unfocusedBottom: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  instruction: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  header: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  iconButton: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  iconText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 13,
  },
  closeButton: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  closeButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
  },
});

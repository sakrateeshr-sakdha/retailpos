import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { useAuth } from '../auth/AuthContext';
import { getApiBaseUrl, setApiBaseUrl } from '../api/client';

export const LoginScreen: React.FC = () => {
  const { login, loading } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [serverUrl, setServerUrlState] = useState('');
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getApiBaseUrl().then((url: string) => setServerUrlState(url));
  }, []);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert('Required', 'Please enter both username and password');
      return;
    }

    setSubmitting(true);
    try {
      const res = await login({
        username: username.trim(),
        password: password.trim(),
      });
      if (!res.success) {
        Alert.alert('Login Failed', res.message || 'Invalid credentials');
      }
    } catch (err: any) {
      Alert.alert('Login Error', err.message || 'Could not connect to POS server');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveServerUrl = async () => {
    if (!serverUrl.trim()) return;
    await setApiBaseUrl(serverUrl.trim());
    Alert.alert('Updated', `API URL configured to:\n${serverUrl.trim()}`);
    setShowServerConfig(false);
  };

  const handleQuickFill = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
  };

  return (
    <ScreenWrapper backgroundColor="#0F172A" statusBarStyle="light" withBottomPadding>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardContainer}
      >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Brand Header */}
        <View style={styles.brandContainer}>
          <Text style={styles.brandIcon}>🛒</Text>
          <Text style={styles.brandTitle}>RetailPOS</Text>
          <Text style={styles.brandSubtitle}>Grocery & Retail Cashier Terminal</Text>
        </View>

        {/* Login Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Cashier Sign In</Text>

          <Text style={styles.label}>Username or Mobile</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. cashier or admin"
            placeholderTextColor="#94A3B8"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter password"
            placeholderTextColor="#94A3B8"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.loginBtn, (submitting || loading) && { opacity: 0.6 }]}
            onPress={handleLogin}
            disabled={submitting || loading}
          >
            {submitting || loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.loginBtnText}>SIGN IN TO POS</Text>
            )}
          </TouchableOpacity>

          {/* Quick Demo Fillers */}
          <View style={styles.quickRow}>
            <TouchableOpacity
              style={styles.quickChip}
              onPress={() => handleQuickFill('admin', 'admin123')}
            >
              <Text style={styles.quickChipText}>Fill Admin</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickChip}
              onPress={() => handleQuickFill('cashier', 'cashier123')}
            >
              <Text style={styles.quickChipText}>Fill Cashier</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Server Endpoint Settings Toggle */}
        <View style={styles.serverSettingsContainer}>
          <TouchableOpacity
            onPress={() => setShowServerConfig(!showServerConfig)}
            style={styles.serverToggleBtn}
          >
            <Text style={styles.serverToggleText}>
              ⚙️ {showServerConfig ? 'Hide Server URL Settings' : 'Configure Server Endpoint URL'}
            </Text>
          </TouchableOpacity>

          {showServerConfig && (
            <View style={styles.serverConfigCard}>
              <Text style={styles.serverConfigLabel}>Backend API URL</Text>
              <TextInput
                style={styles.serverInput}
                value={serverUrl}
                onChangeText={setServerUrlState}
                placeholder="http://10.0.2.2:5000/api"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={styles.serverHint}>
                Use http://10.0.2.2:5000/api for Android emulator, or http://192.168.x.x:5000/api for physical phone on local Wi-Fi.
              </Text>
              <TouchableOpacity style={styles.saveServerBtn} onPress={handleSaveServerUrl}>
                <Text style={styles.saveServerBtnText}>Save Server URL</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: 28,
  },
  brandIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  brandTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  brandSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 4,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 18,
    textAlign: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0F172A',
  },
  loginBtn: {
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  loginBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
    letterSpacing: 0.5,
  },
  quickRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginTop: 16,
  },
  quickChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quickChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  serverSettingsContainer: {
    marginTop: 24,
    alignItems: 'center',
  },
  serverToggleBtn: {
    padding: 8,
  },
  serverToggleText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  serverConfigCard: {
    width: '100%',
    backgroundColor: '#1E293B',
    borderRadius: 10,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  serverConfigLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 6,
  },
  serverInput: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: '#F8FAFC',
  },
  serverHint: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 6,
    lineHeight: 15,
  },
  saveServerBtn: {
    backgroundColor: '#3B82F6',
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 10,
  },
  saveServerBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
});

import React from 'react';
import { View, StyleSheet, Platform, StatusBar as RNStatusBar, StyleProp, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

interface ScreenWrapperProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  statusBarStyle?: 'auto' | 'inverted' | 'light' | 'dark';
  backgroundColor?: string;
  withBottomPadding?: boolean;
}

export const ScreenWrapper: React.FC<ScreenWrapperProps> = ({
  children,
  style,
  statusBarStyle = 'dark',
  backgroundColor = '#F8FAFC',
  withBottomPadding = false,
}) => {
  const insets = useSafeAreaInsets();
  // Ensure Android always has at least the full status bar height (or 28dp fallback)
  // so app top bars and headers never overlap the phone's clock, battery, camera cutout or status bar.
  const topInset = Math.max(
    insets.top,
    Platform.OS === 'android' ? ((RNStatusBar.currentHeight || 28) + 6) : 0
  );
  const bottomInset = withBottomPadding ? insets.bottom : 0;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor,
          paddingTop: topInset,
          paddingBottom: bottomInset,
        },
        style,
      ]}
    >
      <StatusBar style={statusBarStyle} translucent />
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

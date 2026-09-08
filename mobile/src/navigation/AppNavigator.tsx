import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';

import { BillingScreen } from '../screens/BillingScreen';
import { ProductsScreen } from '../screens/ProductsScreen';
import { SalesScreen } from '../screens/SalesScreen';
import { KhataScreen } from '../screens/KhataScreen';
import { ClosingScreen } from '../screens/ClosingScreen';
import { MoreScreen } from '../screens/MoreScreen';
import { LoginScreen } from '../screens/LoginScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const MainTabs: React.FC = () => {
  return (
    <Tab.Navigator
      initialRouteName="Billing"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#2563EB',
        tabBarInactiveTintColor: '#64748B',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E2E8F0',
          height: 60,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
        },
      }}
    >
      <Tab.Screen
        name="Billing"
        component={BillingScreen}
        options={{
          tabBarLabel: 'Billing',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>🛒</Text>,
        }}
      />
      <Tab.Screen
        name="Products"
        component={ProductsScreen}
        options={{
          tabBarLabel: 'Products',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>📦</Text>,
        }}
      />
      <Tab.Screen
        name="Sales"
        component={SalesScreen}
        options={{
          tabBarLabel: 'Sales',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>📊</Text>,
        }}
      />
      <Tab.Screen
        name="Khata"
        component={KhataScreen}
        options={{
          tabBarLabel: 'Khata',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>📒</Text>,
        }}
      />
      <Tab.Screen
        name="Closing"
        component={ClosingScreen}
        options={{
          tabBarLabel: 'Closing',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>🔒</Text>,
        }}
      />
      <Tab.Screen
        name="More"
        component={MoreScreen}
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>⚙️</Text>,
        }}
      />
    </Tab.Navigator>
  );
};

export const AppNavigator: React.FC = () => {
  const { isAuthenticated, isInitialized } = useAuth();

  if (!isInitialized) {
    return (
      <View style={styles.splash}>
        <Text style={styles.splashIcon}>🛒</Text>
        <Text style={styles.splashTitle}>RetailPOS</Text>
        <ActivityIndicator size="large" color="#2563EB" style={styles.spinner} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          <Stack.Screen name="Main" component={MainTabs} />
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F172A',
  },
  splashIcon: {
    fontSize: 56,
    marginBottom: 10,
  },
  splashTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  spinner: {
    marginTop: 24,
  },
});

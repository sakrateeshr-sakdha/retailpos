import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { OfflineBanner } from './components/OfflineBanner';
import { BottomNav, NavTab } from './components/BottomNav';
import { LoginScreen } from './screens/LoginScreen';
import { BillingScreen } from './screens/BillingScreen';
import { ProductsScreen } from './screens/ProductsScreen';
import { SalesScreen } from './screens/SalesScreen';
import { StockScreen } from './screens/StockScreen';
import { MoreScreen } from './screens/MoreScreen';

const MainLayout: React.FC = () => {
  const { user, loading } = useAuth();
  const [currentTab, setCurrentTab] = useState<NavTab>('billing');

  if (loading) {
    return (
      <div className="min-h-screen bg-green-700 flex items-center justify-center text-white">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin" />
          <span className="text-sm font-semibold tracking-wide">Loading Grocery POS...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <div className="min-h-screen bg-gray-100 flex justify-center">
      <div className="w-full max-w-lg bg-gray-50 min-h-screen relative shadow-2xl flex flex-col">
        <OfflineBanner />

        <main className="flex-1 overflow-x-hidden">
          {currentTab === 'billing' && <BillingScreen />}
          {currentTab === 'products' && <ProductsScreen />}
          {currentTab === 'sales' && <SalesScreen />}
          {currentTab === 'stock' && <StockScreen />}
          {currentTab === 'more' && <MoreScreen />}
        </main>

        <BottomNav currentTab={currentTab} onSelectTab={setCurrentTab} />
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <CartProvider>
        <MainLayout />
      </CartProvider>
    </AuthProvider>
  );
};

export default App;

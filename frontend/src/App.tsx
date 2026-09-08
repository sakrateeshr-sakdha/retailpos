import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { Header } from './components/Header';
import { OfflineBanner } from './components/OfflineBanner';
import { BottomNav, NavTab } from './components/BottomNav';
import { LoginScreen } from './screens/LoginScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { BillingScreen } from './screens/BillingScreen';
import { ProductsScreen } from './screens/ProductsScreen';
import { SalesScreen } from './screens/SalesScreen';
import { StockScreen } from './screens/StockScreen';
import { CustomersScreen } from './screens/CustomersScreen';
import { MoreScreen } from './screens/MoreScreen';
import { ClosingScreen } from './screens/ClosingScreen';

const MainLayout: React.FC = () => {
  const { user, loading } = useAuth();
  const [currentTab, setCurrentTab] = useState<NavTab>('billing');
  const [authView, setAuthView] = useState<'login' | 'onboard'>('login');

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
    if (authView === 'onboard') {
      return <OnboardingScreen onBackToLogin={() => setAuthView('login')} />;
    }
    return <LoginScreen onGoToOnboard={() => setAuthView('onboard')} />;
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <OfflineBanner />
      <Header currentTab={currentTab} onSelectTab={setCurrentTab} />

      <main className="flex-1 w-full max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 py-2 sm:py-4 overflow-x-hidden">
        {currentTab === 'billing' && <BillingScreen />}
        {currentTab === 'products' && <ProductsScreen />}
        {currentTab === 'customers' && <CustomersScreen />}
        {currentTab === 'sales' && <SalesScreen onNavigate={setCurrentTab} />}
        {currentTab === 'stock' && <StockScreen />}
        {currentTab === 'closing' && <ClosingScreen />}
        {currentTab === 'more' && <MoreScreen onNavigate={setCurrentTab} />}
      </main>

      <BottomNav currentTab={currentTab} onSelectTab={setCurrentTab} />
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

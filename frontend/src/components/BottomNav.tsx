import React from 'react';
import { ShoppingCart, Package, BarChart3, ClipboardList, Settings } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';

export type NavTab = 'billing' | 'products' | 'sales' | 'stock' | 'more';

interface BottomNavProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ currentTab, onSelectTab }) => {
  const { itemCount } = useCart();
  const { pendingSalesCount } = useAuth();

  const tabs: { id: NavTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    {
      id: 'billing',
      label: 'Billing',
      icon: <ShoppingCart className="w-6 h-6" />,
      badge: itemCount > 0 ? itemCount : undefined,
    },
    {
      id: 'products',
      label: 'Products',
      icon: <Package className="w-6 h-6" />,
    },
    {
      id: 'sales',
      label: 'Sales',
      icon: <BarChart3 className="w-6 h-6" />,
    },
    {
      id: 'stock',
      label: 'Stock',
      icon: <ClipboardList className="w-6 h-6" />,
    },
    {
      id: 'more',
      label: 'More',
      icon: <Settings className="w-6 h-6" />,
      badge: pendingSalesCount > 0 ? pendingSalesCount : undefined,
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-30 max-w-lg mx-auto pb-safe">
      <div className="flex items-center justify-around h-16">
        {tabs.map((tab) => {
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={`flex-1 flex flex-col items-center justify-center h-full relative transition-colors ${
                isActive ? 'text-green-600 font-semibold' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <div className="relative">
                {tab.icon}
                {tab.badge !== undefined && (
                  <span className="absolute -top-1.5 -right-2.5 bg-red-500 text-white text-[11px] font-bold rounded-full h-5 min-w-[20px] px-1 flex items-center justify-center animate-pulse">
                    {tab.badge > 99 ? '99+' : tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[11px] mt-1 tracking-tight">{tab.label}</span>
              {isActive && (
                <div className="absolute bottom-0 w-8 h-1 bg-green-600 rounded-t-full" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};

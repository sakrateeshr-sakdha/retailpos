import React, { useState } from 'react';
import { ShoppingBag, Lock, User, AlertCircle, ArrowRight, Store } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface LoginScreenProps {
  onGoToOnboard?: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onGoToOnboard }) => {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Please enter username and password');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await login({ username, password });
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-green-700 to-green-900 flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
        {/* App Branding */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-green-100 text-green-700 mb-1 shadow-inner">
            <ShoppingBag className="w-9 h-9" />
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Grocery Retail POS</h1>
          <p className="text-xs text-gray-500 font-medium">
            Fast, mobile-first checkout for grocery shops
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="flex items-center space-x-2 bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-xs font-medium">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              Username
            </label>
            <div className="relative">
              <User className="w-5 h-5 absolute left-3.5 top-3.5 text-gray-400" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-11 pr-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="w-5 h-5 absolute left-3.5 top-3.5 text-gray-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-11 pr-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-700 active:scale-98 text-white py-3.5 px-4 rounded-xl font-bold text-base shadow-lg transition flex items-center justify-center space-x-2"
          >
            {loading ? (
              <span>Signing in...</span>
            ) : (
              <>
                <span>Sign In to POS</span>
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </form>


        {/* Onboard / Register New Store Button */}
        {onGoToOnboard && (
          <div className="pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onGoToOnboard}
              className="w-full bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 py-3 px-4 rounded-xl font-bold text-xs sm:text-sm transition flex items-center justify-center space-x-2"
            >
              <Store className="w-4 h-4 text-emerald-600" />
              <span>New Store Owner? Register & Onboard</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

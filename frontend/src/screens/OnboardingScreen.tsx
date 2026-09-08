import React, { useState } from 'react';
import {
  Store,
  User,
  Lock,
  Phone,
  MapPin,
  QrCode,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  Sparkles,
  Receipt,
  FileText,
  Eye,
  EyeOff,
  Check,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface OnboardingScreenProps {
  onBackToLogin: () => void;
}

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ onBackToLogin }) => {
  const { onboard } = useAuth();

  // Wizard Step (1: Owner, 2: Store & UPI, 3: Preferences & Launch)
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Form State
  const [ownerName, setOwnerName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [shopName, setShopName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [upiId, setUpiId] = useState('');
  const [gstNumber, setGstNumber] = useState('');

  const [currency] = useState('₹');
  const [invoicePrefix, setInvoicePrefix] = useState('INV-');
  const [receiptFooter, setReceiptFooter] = useState('Thank You! Visit Again 😊');
  const [seedStarterCatalog, setSeedStarterCatalog] = useState(true);

  // Status
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Quick UPI handles helper
  const handleUpiSuffix = (suffix: string) => {
    const prefix = upiId.split('@')[0] || username || 'store';
    setUpiId(`${prefix}${suffix}`);
  };

  const handleNextFromStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!ownerName.trim()) {
      setError('Please enter the owner full name');
      return;
    }
    if (!username.trim() || username.trim().length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }
    if (!password || password.length < 4) {
      setError('Password must be at least 4 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Pre-fill phone or UPI suggestion if username is mobile number
    if (!phone && /^\d{10}$/.test(username.trim())) {
      setPhone(username.trim());
    }
    if (!upiId && /^\d{10}$/.test(username.trim())) {
      setUpiId(`${username.trim()}@upi`);
    }

    setStep(2);
  };

  const handleNextFromStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!shopName.trim()) {
      setError('Please enter your shop or store name');
      return;
    }

    setStep(3);
  };

  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await onboard({
        ownerName: ownerName.trim(),
        username: username.toLowerCase().trim(),
        password,
        shopName: shopName.trim(),
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        gstNumber: gstNumber.trim() || undefined,
        upiId: upiId.trim() || undefined,
        currency,
        invoicePrefix: invoicePrefix.trim() || 'INV-',
        receiptFooter: receiptFooter.trim() || 'Thank You! Visit Again 😊',
        seedStarterCatalog,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to complete store onboarding. Please check details.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-green-700 via-green-800 to-green-950 flex items-center justify-center p-3 sm:p-6 py-6 sm:py-10">
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-green-600 to-emerald-700 px-6 py-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-11 h-11 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center text-white border border-white/20">
                <Store className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Merchant Onboarding</h1>
                <p className="text-xs text-green-100">Set up your store and start billing in seconds</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onBackToLogin}
              className="text-xs text-green-100 hover:text-white underline font-medium transition"
            >
              Sign In Instead
            </button>
          </div>

          {/* Stepper Indicator */}
          <div className="mt-5 grid grid-cols-3 gap-2 text-xs">
            <div
              className={`flex items-center space-x-2 pb-2 border-b-2 transition-all ${
                step >= 1 ? 'border-white text-white font-semibold' : 'border-white/30 text-white/60'
              }`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                step > 1 ? 'bg-white text-green-700' : 'bg-white/20 text-white'
              }`}>
                {step > 1 ? '✓' : '1'}
              </span>
              <span className="truncate">Owner</span>
            </div>

            <div
              className={`flex items-center space-x-2 pb-2 border-b-2 transition-all ${
                step >= 2 ? 'border-white text-white font-semibold' : 'border-white/30 text-white/60'
              }`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                step > 2 ? 'bg-white text-green-700' : 'bg-white/20 text-white'
              }`}>
                {step > 2 ? '✓' : '2'}
              </span>
              <span className="truncate">Shop & UPI</span>
            </div>

            <div
              className={`flex items-center space-x-2 pb-2 border-b-2 transition-all ${
                step >= 3 ? 'border-white text-white font-semibold' : 'border-white/30 text-white/60'
              }`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                step === 3 ? 'bg-white text-green-700' : 'bg-white/20 text-white'
              }`}>
                3
              </span>
              <span className="truncate">Launch</span>
            </div>
          </div>
        </div>

        {/* Form Body */}
        <div className="p-6 sm:p-8 flex-1">
          {error && (
            <div className="mb-5 flex items-center space-x-2 bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-xs font-medium">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* STEP 1: Owner Profile */}
          {step === 1 && (
            <form onSubmit={handleNextFromStep1} className="space-y-4">
              <div className="border-b border-gray-100 pb-3 mb-4">
                <h2 className="text-base font-bold text-gray-900 flex items-center space-x-2">
                  <User className="w-4 h-4 text-green-600" />
                  <span>Step 1: Store Owner Credentials</span>
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  These details will be used to log in as the Store Administrator.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Owner Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="e.g. Ramesh Kumar"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Admin Username or Mobile Number <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3.5 top-3.5 text-gray-400" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. ramesh_pos or 9876543210"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition"
                    required
                  />
                </div>
                <span className="text-[11px] text-gray-400 mt-1 block">
                  You will use this username to sign in to the POS app.
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3.5 top-3.5 text-gray-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Minimum 4 characters"
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-10 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3.5 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    Confirm Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3.5 top-3.5 text-gray-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter password"
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={onBackToLogin}
                  className="flex items-center space-x-1.5 text-xs text-gray-600 hover:text-gray-900 font-semibold px-3 py-2.5 rounded-xl transition"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back to Login</span>
                </button>

                <button
                  type="submit"
                  className="bg-green-600 hover:bg-green-700 active:scale-98 text-white px-6 py-3 rounded-xl font-bold text-sm shadow-md transition flex items-center space-x-2"
                >
                  <span>Continue to Store Setup</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          )}

          {/* STEP 2: Store & UPI Setup */}
          {step === 2 && (
            <form onSubmit={handleNextFromStep2} className="space-y-4">
              <div className="border-b border-gray-100 pb-3 mb-4">
                <h2 className="text-base font-bold text-gray-900 flex items-center space-x-2">
                  <Store className="w-4 h-4 text-green-600" />
                  <span>Step 2: Store Profile & UPI QR Setup</span>
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Configure your store brand and digital payment parameters.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Shop Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Store className="w-4 h-4 absolute left-3.5 top-3.5 text-gray-400" />
                  <input
                    type="text"
                    value={shopName}
                    onChange={(e) => setShopName(e.target.value)}
                    placeholder="e.g. Sri Lakshmi Supermarket"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition"
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    Store Contact Phone
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 absolute left-3.5 top-3.5 text-gray-400" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91 9876543210"
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    GSTIN / Tax ID (Optional)
                  </label>
                  <div className="relative">
                    <FileText className="w-4 h-4 absolute left-3.5 top-3.5 text-gray-400" />
                    <input
                      type="text"
                      value={gstNumber}
                      onChange={(e) => setGstNumber(e.target.value.toUpperCase())}
                      placeholder="e.g. 32AAAAA0000A1Z5"
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm text-gray-900 uppercase focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Store Address / Location
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 absolute left-3.5 top-3.5 text-gray-400" />
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="e.g. Shop #12, Market Road, Bengaluru"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition"
                  />
                </div>
              </div>

              {/* UPI ID Setup */}
              <div className="p-4 bg-emerald-50/70 border border-emerald-200/80 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-emerald-950 uppercase tracking-wider flex items-center space-x-1.5">
                    <QrCode className="w-4 h-4 text-emerald-700" />
                    <span>Merchant UPI ID (For Dynamic QR Codes)</span>
                  </label>
                  <span className="text-[10px] bg-emerald-200/60 text-emerald-800 font-semibold px-2 py-0.5 rounded-full">
                    Instant Payments
                  </span>
                </div>
                <input
                  type="text"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  placeholder="e.g. storename@okaxis, 9876543210@paytm"
                  className="w-full bg-white border border-emerald-300 rounded-xl px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition font-mono"
                />
                <div className="flex items-center flex-wrap gap-1.5 pt-1">
                  <span className="text-[11px] text-gray-500 font-medium">Quick handles:</span>
                  {['@okaxis', '@okhdfcbank', '@paytm', '@ybl', '@upi'].map((suf) => (
                    <button
                      key={suf}
                      type="button"
                      onClick={() => handleUpiSuffix(suf)}
                      className="text-[11px] bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-lg transition font-mono"
                    >
                      {suf}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-emerald-700/90 leading-tight">
                  Customers scan dynamic QR codes on your POS screen using GPay, PhonePe, or Paytm with the exact bill amount pre-filled.
                </p>
              </div>

              <div className="pt-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex items-center space-x-1.5 text-xs text-gray-600 hover:text-gray-900 font-semibold px-3 py-2.5 rounded-xl transition"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>

                <button
                  type="submit"
                  className="bg-green-600 hover:bg-green-700 active:scale-98 text-white px-6 py-3 rounded-xl font-bold text-sm shadow-md transition flex items-center space-x-2"
                >
                  <span>Continue to Preferences</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          )}

          {/* STEP 3: Starter Setup, Receipt Preview & Launch */}
          {step === 3 && (
            <form onSubmit={handleFinalSubmit} className="space-y-5">
              <div className="border-b border-gray-100 pb-3">
                <h2 className="text-base font-bold text-gray-900 flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-green-600" />
                  <span>Step 3: Review & Launch POS</span>
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Confirm your receipt details and pre-load instant starter grocery items.
                </p>
              </div>

              {/* Starter Catalog Option */}
              <div
                onClick={() => setSeedStarterCatalog(!seedStarterCatalog)}
                className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex items-start space-x-3.5 ${
                  seedStarterCatalog
                    ? 'border-green-600 bg-green-50/50'
                    : 'border-gray-200 bg-gray-50/50 hover:border-gray-300'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 transition ${
                    seedStarterCatalog ? 'bg-green-600 text-white' : 'border border-gray-300 bg-white'
                  }`}
                >
                  {seedStarterCatalog && <Check className="w-4 h-4 stroke-[3]" />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-bold text-gray-900">Pre-load Starter Grocery Catalog</span>
                    <span className="text-[10px] bg-green-200 text-green-800 font-bold px-1.5 py-0.5 rounded">
                      Recommended
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                    Automatically initializes standard grocery categories (Dairy, Grains & Staples, Beverages, Snacks, Produce) with 9 essential products (Milk, Rice, Sugar, Bread, Eggs, Tea, etc.) so you can test billing immediately!
                  </p>
                </div>
              </div>

              {/* Receipt & Billing Customization */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    Invoice Prefix
                  </label>
                  <input
                    type="text"
                    value={invoicePrefix}
                    onChange={(e) => setInvoicePrefix(e.target.value)}
                    placeholder="INV-"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    Receipt Footer Note
                  </label>
                  <input
                    type="text"
                    value={receiptFooter}
                    onChange={(e) => setReceiptFooter(e.target.value)}
                    placeholder="Thank You! Visit Again 😊"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition"
                  />
                </div>
              </div>

              {/* LIVE THERMAL RECEIPT PREVIEW */}
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
                <div className="flex items-center space-x-2 text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">
                  <Receipt className="w-3.5 h-3.5 text-gray-500" />
                  <span>Live Receipt & QR Header Preview</span>
                </div>
                <div className="bg-white border border-dashed border-gray-300 rounded-xl p-4 max-w-sm mx-auto font-mono text-center shadow-sm">
                  <p className="text-base font-black text-gray-900 uppercase tracking-tight">
                    {shopName || 'YOUR STORE NAME'}
                  </p>
                  <p className="text-[11px] text-gray-600 mt-0.5">
                    {address || '123 Market Street, City'}
                  </p>
                  <p className="text-[11px] text-gray-600">
                    Ph: {phone || '+91 9876543210'} {gstNumber ? `• GST: ${gstNumber}` : ''}
                  </p>
                  <div className="my-2 border-b border-dashed border-gray-300" />
                  <div className="flex justify-between text-[11px] text-gray-500">
                    <span>Invoice: {invoicePrefix}0001</span>
                    <span>Admin: {ownerName || 'Owner'}</span>
                  </div>
                  {upiId && (
                    <div className="mt-2.5 bg-emerald-50 border border-emerald-200 rounded-lg p-1.5 flex items-center justify-center space-x-1 text-[11px] text-emerald-800 font-bold">
                      <QrCode className="w-3.5 h-3.5 text-emerald-700" />
                      <span>UPI: {upiId}</span>
                    </div>
                  )}
                  <div className="mt-2 text-[10px] text-gray-400 italic">
                    {receiptFooter || 'Thank You! Visit Again'}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={loading}
                  className="flex items-center space-x-1.5 text-xs text-gray-600 hover:text-gray-900 font-semibold px-3 py-2.5 rounded-xl transition"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>

                <button
                  type="submit"
                  disabled={loading}
                  className="bg-green-600 hover:bg-green-700 active:scale-98 text-white px-8 py-3.5 rounded-xl font-bold text-base shadow-lg transition flex items-center space-x-2"
                >
                  {loading ? (
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      <span>Setting up your store...</span>
                    </div>
                  ) : (
                    <>
                      <CheckCircle2 className="w-5 h-5" />
                      <span>Launch Store & Open POS</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Bottom link */}
          <div className="mt-6 pt-4 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-500">
              Already registered your store?{' '}
              <button
                type="button"
                onClick={onBackToLogin}
                className="text-green-700 hover:text-green-800 font-bold underline ml-1"
              >
                Sign in to POS
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

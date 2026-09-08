import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Plus,
  Phone,
  MapPin,
  CreditCard,
  Banknote,
  QrCode,
  Calendar,
  ArrowDownLeft,
  ArrowUpRight,
  Receipt,
  X,
  Check,
  AlertCircle,
  Share2,
  ExternalLink,
  Edit2,
  Trash2,
  Clock,
} from 'lucide-react';
import { Customer, CustomerPayment, PaymentMethod } from '../types/index';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { cacheCustomers, getLocalCustomers } from '../services/db';

export const CustomersScreen: React.FC = () => {
  const { shop, user, isOnline } = useAuth();
  const currency = shop?.currency || '₹';

  // State
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [summary, setSummary] = useState({
    totalOutstandingCredit: 0,
    totalCustomers: 0,
    customersWithBalance: 0,
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'due' | 'settled'>('all');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isLedgerModalOpen, setIsLedgerModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // Add/Edit Form State
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formOpeningBalance, setFormOpeningBalance] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Payment Form State
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('CASH');
  const [payNotes, setPayNotes] = useState('');
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  // Ledger details
  const [ledgerCustomer, setLedgerCustomer] = useState<Customer | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  // Toast
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const res = await api.getCustomers({
        search: searchQuery.trim() || undefined,
        hasBalance: filterType === 'due' ? true : undefined,
      });
      setCustomers(res.customers);
      setSummary(res.summary);
      if (!searchQuery && filterType === 'all') {
        cacheCustomers(res.customers);
      }
    } catch (err) {
      console.error('Failed to load customers from server', err);
      // Fallback to local Dexie customers when offline
      const localCusts = await getLocalCustomers();
      if (localCusts.length > 0) {
        setCustomers(localCusts);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCustomer = async (cust: Customer) => {
    if (Number(cust.totalCredit) !== 0) {
      alert(
        `Cannot delete customer "${cust.name}" with outstanding balance of ${currency}${Number(
          cust.totalCredit
        ).toFixed(2)}. Please settle the balance first.`
      );
      return;
    }

    if (
      !window.confirm(
        `Are you sure you want to permanently delete customer "${cust.name}"? This action cannot be undone.`
      )
    ) {
      return;
    }

    try {
      await api.deleteCustomer(cust.id);
      showToast(`✓ Customer "${cust.name}" deleted successfully`);
      fetchCustomers();
    } catch (err: any) {
      alert(err.message || 'Failed to delete customer');
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCustomers();
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery, filterType]);

  // Open Add Modal
  const handleOpenAddModal = () => {
    setFormName('');
    setFormPhone('');
    setFormEmail('');
    setFormAddress('');
    setFormOpeningBalance('');
    setFormError(null);
    setIsAddModalOpen(true);
  };

  // Submit Add Customer
  const handleAddCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError('Customer name is required');
      return;
    }

    setFormLoading(true);
    setFormError(null);
    try {
      await api.createCustomer({
        name: formName.trim(),
        phone: formPhone.trim() || undefined,
        email: formEmail.trim() || undefined,
        address: formAddress.trim() || undefined,
        openingBalance: formOpeningBalance ? parseFloat(formOpeningBalance) : 0,
      });
      setIsAddModalOpen(false);
      showToast('Customer created successfully');
      fetchCustomers();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create customer');
    } finally {
      setFormLoading(false);
    }
  };

  // Open Edit Modal
  const handleOpenEditModal = (cust: Customer) => {
    setSelectedCustomer(cust);
    setFormName(cust.name);
    setFormPhone(cust.phone || '');
    setFormEmail(cust.email || '');
    setFormAddress(cust.address || '');
    setFormError(null);
    setIsEditModalOpen(true);
  };

  // Submit Edit Customer
  const handleEditCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    if (!formName.trim()) {
      setFormError('Customer name is required');
      return;
    }

    setFormLoading(true);
    setFormError(null);
    try {
      await api.updateCustomer(selectedCustomer.id, {
        name: formName.trim(),
        phone: formPhone.trim() || undefined,
        email: formEmail.trim() || undefined,
        address: formAddress.trim() || undefined,
      });
      setIsEditModalOpen(false);
      showToast('Customer profile updated');
      fetchCustomers();
    } catch (err: any) {
      setFormError(err.message || 'Failed to update customer');
    } finally {
      setFormLoading(false);
    }
  };

  // Open Payment Modal
  const handleOpenPaymentModal = (cust: Customer) => {
    setSelectedCustomer(cust);
    const bal = Number(cust.totalCredit);
    setPayAmount(bal > 0 ? bal.toString() : '');
    setPayMethod('CASH');
    setPayNotes('');
    setPayError(null);
    setIsPaymentModalOpen(true);
  };

  // Submit Payment
  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    const amt = parseFloat(payAmount);
    if (!amt || amt <= 0) {
      setPayError('Please enter a valid positive payment amount');
      return;
    }

    setPayLoading(true);
    setPayError(null);
    try {
      await api.recordCustomerPayment(selectedCustomer.id, {
        amount: amt,
        paymentMethod: payMethod,
        notes: payNotes.trim() || undefined,
      });
      setIsPaymentModalOpen(false);
      showToast(`Payment of ${currency}${amt.toFixed(2)} recorded!`);
      fetchCustomers();
    } catch (err: any) {
      setPayError(err.message || 'Failed to record payment');
    } finally {
      setPayLoading(false);
    }
  };

  // Open Ledger Modal
  const handleOpenLedger = async (cust: Customer) => {
    setSelectedCustomer(cust);
    setIsLedgerModalOpen(true);
    setLedgerLoading(true);
    try {
      const res = await api.getCustomer(cust.id);
      setLedgerCustomer(res.customer);
    } catch (err) {
      console.error('Failed to load ledger', err);
    } finally {
      setLedgerLoading(false);
    }
  };

  // Share Statement via WhatsApp
  const handleShareStatement = (cust: Customer) => {
    const bal = Number(cust.totalCredit);
    const storeName = shop?.name || 'Retail POS';
    const upi = shop?.upiId ? `\nUPI for Payment: ${shop.upiId}` : '';
    const text = encodeURIComponent(
      `Hello ${cust.name},\nThis is a statement from ${storeName}.\nYour current outstanding balance is: ${currency}${bal.toFixed(2)}.${upi}\nThank you!`
    );

    if (cust.phone) {
      const cleanPhone = cust.phone.replace(/[^0-9]/g, '');
      const fullPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
      window.open(`https://wa.me/${fullPhone}?text=${text}`, '_blank');
    } else {
      navigator.clipboard.writeText(decodeURIComponent(text));
      showToast('Statement message copied to clipboard!');
    }
  };

  // Filter customers by selected status
  const displayedCustomers = customers.filter((cust) => {
    const bal = Number(cust.totalCredit);
    if (filterType === 'due') return bal > 0;
    if (filterType === 'settled') return bal <= 0;
    return true;
  });

  return (
    <div className="space-y-4 pb-20 md:pb-6">
      {/* Toast */}
      {toastMsg && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white px-4 py-2.5 rounded-xl shadow-xl text-xs font-semibold flex items-center space-x-2 animate-bounce">
          <Check className="w-4 h-4 text-green-400" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Top Metric Cards */}
      <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
        <div className="bg-white border border-red-100 rounded-2xl p-3 sm:p-4 shadow-sm">
          <span className="text-[11px] font-bold text-red-600 uppercase tracking-wider block">
            Outstanding Credit
          </span>
          <div className="text-lg sm:text-2xl font-black text-gray-900 mt-1">
            {currency}{summary.totalOutstandingCredit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span className="text-[10px] text-gray-400">Total balance due</span>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-3 sm:p-4 shadow-sm">
          <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">
            Customers with Due
          </span>
          <div className="text-lg sm:text-2xl font-black text-gray-900 mt-1">
            {summary.customersWithBalance}
          </div>
          <span className="text-[10px] text-gray-400">Active accounts</span>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-3 sm:p-4 shadow-sm">
          <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">
            Total Customers
          </span>
          <div className="text-lg sm:text-2xl font-black text-gray-900 mt-1">
            {summary.totalCustomers}
          </div>
          <span className="text-[10px] text-gray-400">Registered</span>
        </div>
      </div>

      {/* Search and Action Bar */}
      <div className="bg-white rounded-2xl p-3 sm:p-4 border border-gray-200 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row gap-2.5 justify-between">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by customer name or phone..."
              className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition"
            />
          </div>

          <button
            type="button"
            onClick={handleOpenAddModal}
            className="bg-green-600 hover:bg-green-700 active:scale-98 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md transition flex items-center justify-center space-x-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Add Customer</span>
          </button>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center space-x-2 border-t border-gray-100 pt-2.5">
          <button
            type="button"
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              filterType === 'all'
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All ({customers.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('due')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              filterType === 'due'
                ? 'bg-red-600 text-white'
                : 'bg-red-50 text-red-700 hover:bg-red-100'
            }`}
          >
            Due Balance Only ({summary.customersWithBalance})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('settled')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              filterType === 'settled'
                ? 'bg-green-600 text-white'
                : 'bg-green-50 text-green-700 hover:bg-green-100'
            }`}
          >
            Settled (0 Balance)
          </button>
        </div>
      </div>

      {/* Customer Cards List */}
      {loading ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-gray-200">
          <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <span className="text-xs text-gray-500 font-medium">Loading customer accounts...</span>
        </div>
      ) : displayedCustomers.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-gray-200 space-y-3">
          <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto text-gray-400">
            <Users className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-gray-800">No Customers Found</h3>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            {searchQuery
              ? `No customer matches "${searchQuery}".`
              : 'Add customers to track credit sales, manage pay-later balances, and record payments.'}
          </p>
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="bg-green-600 text-white text-xs font-bold px-4 py-2 rounded-xl"
          >
            Add First Customer
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
          {displayedCustomers.map((cust) => {
            const balance = Number(cust.totalCredit);
            const hasDue = balance > 0;

            return (
              <div
                key={cust.id}
                className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm hover:border-gray-300 transition flex flex-col justify-between"
              >
                <div>
                  {/* Top Bar: Name & Balance */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-700 text-white font-black text-sm flex items-center justify-center flex-shrink-0">
                        {cust.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-gray-900 leading-tight">
                          {cust.name}
                        </h3>
                        {cust.phone ? (
                          <a
                            href={`tel:${cust.phone}`}
                            className="text-xs text-gray-500 hover:text-green-600 flex items-center space-x-1 mt-0.5"
                          >
                            <Phone className="w-3 h-3" />
                            <span>{cust.phone}</span>
                          </a>
                        ) : (
                          <span className="text-[11px] text-gray-400">No phone provided</span>
                        )}
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">
                        {hasDue ? 'Balance Due' : 'Status'}
                      </span>
                      <span
                        className={`text-base font-black ${
                          hasDue ? 'text-red-600' : 'text-green-600'
                        }`}
                      >
                        {currency}{balance.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {cust.address && (
                    <div className="mt-2.5 text-xs text-gray-500 flex items-center space-x-1">
                      <MapPin className="w-3 h-3 text-gray-400 flex-shrink-0" />
                      <span className="truncate">{cust.address}</span>
                    </div>
                  )}
                </div>

                {/* Bottom Action Bar */}
                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between gap-1.5">
                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={() => handleOpenLedger(cust)}
                      className="p-2 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg text-xs font-semibold transition flex items-center space-x-1"
                      title="View Transaction Ledger"
                    >
                      <Receipt className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Ledger</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleShareStatement(cust)}
                      className="p-2 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg text-xs font-semibold transition flex items-center space-x-1"
                      title="Send Statement via WhatsApp"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Statement</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(cust)}
                      className="p-2 bg-gray-50 hover:bg-gray-100 text-gray-500 rounded-lg transition"
                      title="Edit Customer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    {user?.role === 'ADMIN' && (
                      <button
                        type="button"
                        onClick={() => handleDeleteCustomer(cust)}
                        className="p-2 bg-red-50 hover:bg-red-100 text-red-500 hover:text-red-700 rounded-lg transition"
                        title="Delete Customer (Admin Only)"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpenPaymentModal(cust)}
                    className="bg-green-600 hover:bg-green-700 active:scale-95 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition flex items-center space-x-1"
                  >
                    <Banknote className="w-3.5 h-3.5" />
                    <span>Record Payment</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL 1: ADD CUSTOMER */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-3">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-base font-bold text-gray-900 flex items-center space-x-2">
                <Users className="w-5 h-5 text-green-600" />
                <span>Add New Customer</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleAddCustomerSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Customer Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Ramesh Kumar"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  placeholder="+91 9876543210"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Address / Notes
                </label>
                <input
                  type="text"
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  placeholder="e.g. House #4, Near Temple"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Opening Due Balance ({currency})
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formOpeningBalance}
                  onChange={(e) => setFormOpeningBalance(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white"
                />
                <span className="text-[11px] text-gray-400 mt-0.5 block">
                  Leave empty if there is no previous balance.
                </span>
              </div>

              <div className="pt-3 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-xl text-xs font-bold shadow transition"
                >
                  {formLoading ? 'Creating...' : 'Save Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: EDIT CUSTOMER */}
      {isEditModalOpen && selectedCustomer && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-3">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-base font-bold text-gray-900 flex items-center space-x-2">
                <Edit2 className="w-4 h-4 text-green-600" />
                <span>Edit Customer Profile</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleEditCustomerSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Customer Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Address / Notes
                </label>
                <input
                  type="text"
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white"
                />
              </div>

              <div className="pt-3 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-xl text-xs font-bold shadow transition"
                >
                  {formLoading ? 'Saving...' : 'Update Details'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: RECORD PAYMENT */}
      {isPaymentModalOpen && selectedCustomer && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-3">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-gray-900 flex items-center space-x-2">
                  <Banknote className="w-5 h-5 text-green-600" />
                  <span>Record Customer Payment</span>
                </h3>
                <p className="text-xs text-gray-500">{selectedCustomer.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Current Balance Display */}
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3 flex items-center justify-between">
              <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">
                Current Due Balance
              </span>
              <span className="text-lg font-black text-red-600">
                {currency}{Number(selectedCustomer.totalCredit).toFixed(2)}
              </span>
            </div>

            {payError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{payError}</span>
              </div>
            )}

            <form onSubmit={handlePaymentSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Payment Amount ({currency}) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-lg font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white"
                  required
                  autoFocus
                />

                {/* Quick Fill Preset Chips */}
                <div className="flex items-center flex-wrap gap-1.5 mt-2">
                  <button
                    type="button"
                    onClick={() => setPayAmount(Number(selectedCustomer.totalCredit).toString())}
                    className="text-[11px] bg-green-50 hover:bg-green-100 text-green-700 font-bold px-2.5 py-1 rounded-lg border border-green-200 transition"
                  >
                    Full Due ({currency}{Number(selectedCustomer.totalCredit).toFixed(2)})
                  </button>
                  {[100, 200, 500, 1000].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setPayAmount(amt.toString())}
                      className="text-[11px] bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold px-2.5 py-1 rounded-lg transition"
                    >
                      {currency}{amt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment Method Selector */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">
                  Payment Mode
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPayMethod('CASH')}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center space-y-1 transition ${
                      payMethod === 'CASH'
                        ? 'border-green-600 bg-green-50 text-green-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <Banknote className="w-5 h-5" />
                    <span>Cash</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPayMethod('UPI')}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center space-y-1 transition ${
                      payMethod === 'UPI'
                        ? 'border-green-600 bg-green-50 text-green-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <QrCode className="w-5 h-5" />
                    <span>UPI</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPayMethod('CARD')}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center space-y-1 transition ${
                      payMethod === 'CARD'
                        ? 'border-green-600 bg-green-50 text-green-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <CreditCard className="w-5 h-5" />
                    <span>Card</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Notes / Reference (Optional)
                </label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="e.g. PhonePe transaction or receipt note"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white"
                />
              </div>

              {/* Updated Balance Preview */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 text-xs text-emerald-800 flex justify-between font-semibold">
                <span>Remaining Balance After Payment:</span>
                <span className="font-bold">
                  {currency}{Math.max(0, Number(selectedCustomer.totalCredit) - (parseFloat(payAmount) || 0)).toFixed(2)}
                </span>
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={payLoading}
                  className="bg-green-600 hover:bg-green-700 text-white px-6 py-2.5 rounded-xl text-xs font-bold shadow-md transition"
                >
                  {payLoading ? 'Recording...' : 'Confirm Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: TRANSACTION LEDGER & HISTORY */}
      {isLedgerModalOpen && selectedCustomer && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-3">
          <div className="bg-white rounded-3xl w-full max-w-lg p-6 shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-gray-900 flex items-center space-x-2">
                  <Receipt className="w-5 h-5 text-green-600" />
                  <span>Customer Transaction Ledger</span>
                </h3>
                <p className="text-xs text-gray-500">{selectedCustomer.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsLedgerModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Current Balance Banner */}
            <div className="my-3 bg-gray-50 border border-gray-200 rounded-2xl p-3 flex items-center justify-between">
              <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">
                Current Due Balance
              </span>
              <span className="text-lg font-black text-red-600">
                {currency}{Number(selectedCustomer.totalCredit).toFixed(2)}
              </span>
            </div>

            {/* Ledger Timeline */}
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {ledgerLoading ? (
                <div className="py-12 text-center text-xs text-gray-400">Loading ledger entries...</div>
              ) : (
                (() => {
                  const sales = (ledgerCustomer?.sales || []).map((s) => ({
                    type: 'CREDIT_SALE' as const,
                    id: s.id,
                    date: s.createdAt,
                    amount: Number(s.total),
                    title: `Credit Sale (${s.invoiceNumber})`,
                    subtitle: `${s.items?.length || 0} items purchased`,
                  }));

                  const payments = (ledgerCustomer?.payments || []).map((p) => ({
                    type: 'PAYMENT' as const,
                    id: p.id,
                    date: p.createdAt,
                    amount: Number(p.amount),
                    title: `Payment Received (${p.paymentMethod})`,
                    subtitle: p.notes || 'Balance payment',
                  }));

                  const combined = [...sales, ...payments].sort(
                    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
                  );

                  if (combined.length === 0) {
                    return (
                      <div className="py-10 text-center text-xs text-gray-400">
                        No recorded credit sales or payments yet.
                      </div>
                    );
                  }

                  return combined.map((entry) => {
                    const isCredit = entry.type === 'CREDIT_SALE';
                    return (
                      <div
                        key={entry.id}
                        className="p-3 bg-white border border-gray-100 rounded-xl flex items-center justify-between shadow-2xs"
                      >
                        <div className="flex items-center space-x-2.5">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                              isCredit ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
                            }`}
                          >
                            {isCredit ? (
                              <ArrowUpRight className="w-4 h-4" />
                            ) : (
                              <ArrowDownLeft className="w-4 h-4" />
                            )}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-gray-900">{entry.title}</div>
                            <div className="text-[11px] text-gray-400 flex items-center space-x-1 mt-0.5">
                              <Clock className="w-3 h-3" />
                              <span>{new Date(entry.date).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <div
                            className={`text-xs font-black ${
                              isCredit ? 'text-red-600' : 'text-green-600'
                            }`}
                          >
                            {isCredit ? '+' : '-'}{currency}{entry.amount.toFixed(2)}
                          </div>
                          <span className="text-[10px] text-gray-400">{entry.subtitle}</span>
                        </div>
                      </div>
                    );
                  });
                })()
              )}
            </div>

            <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
              <button
                type="button"
                onClick={() => handleShareStatement(selectedCustomer)}
                className="text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 px-3 py-2 rounded-xl transition flex items-center space-x-1"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Share Statement</span>
              </button>

              <button
                type="button"
                onClick={() => setIsLedgerModalOpen(false)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

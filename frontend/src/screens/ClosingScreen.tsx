import React, { useState, useEffect } from 'react';
import {
  Banknote,
  DollarSign,
  Receipt,
  QrCode,
  CreditCard,
  BookOpen,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  History,
  Lock,
  RefreshCw,
  FileText,
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { DailyClosing } from '../types/index';

export const ClosingScreen: React.FC = () => {
  const { shop, user, isOnline } = useAuth();
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [history, setHistory] = useState<DailyClosing[]>([]);
  const [actualCash, setActualCash] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [activeView, setActiveView] = useState<'current' | 'history'>('current');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const currency = shop?.currency || '₹';

  const loadClosingData = async () => {
    try {
      setLoading(true);
      setErrorMessage(null);
      const [summaryRes, historyRes] = await Promise.all([
        api.getClosingSummary(),
        api.getClosingHistory(20),
      ]);
      setSummary(summaryRes.summary);
      setHistory(historyRes.closings || []);
      if (summaryRes.summary?.closingRecord) {
        setActualCash(String(summaryRes.summary.closingRecord.actualCash));
        setNotes(summaryRes.summary.closingRecord.notes || '');
      }
    } catch (err: any) {
      console.error('Failed to load closing data:', err);
      setErrorMessage(err.message || 'Failed to load daily closing data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClosingData();
  }, [isOnline]);

  const expectedCash = summary ? Number(summary.expectedCash || 0) : 0;
  const countedCash = actualCash === '' ? 0 : Number(actualCash);
  const difference = actualCash === '' ? 0 : countedCash - expectedCash;
  const isClosed = Boolean(summary?.isClosed);

  const handleCloseRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (actualCash === '' || isNaN(Number(actualCash)) || Number(actualCash) < 0) {
      setErrorMessage('Please enter a valid actual cash amount (0 or more)');
      return;
    }

    if (
      !confirm(
        `Are you sure you want to close the register for today?\n\nExpected Cash: ${currency}${expectedCash.toFixed(
          2
        )}\nActual Counted: ${currency}${countedCash.toFixed(
          2
        )}\nDifference: ${currency}${difference.toFixed(2)}`
      )
    ) {
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await api.closeDay({
        actualCash: Number(actualCash),
        notes: notes.trim() || undefined,
      });
      setSuccessMessage('Register closed successfully! Audited closing record created.');
      await loadClosingData();
    } catch (err: any) {
      console.error('Close day error:', err);
      setErrorMessage(err.message || 'Failed to close register');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen pb-28 w-full space-y-4">
      {/* Top Header & Switcher */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
            <Lock className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-extrabold text-lg text-gray-900">Daily Cash Register Closing</h1>
              {isClosed ? (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-200 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Closed Today
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> Register Open
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Reconcile physical cash drawer with POS transaction records at end of shift/day
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 p-1 rounded-xl">
            <button
              onClick={() => setActiveView('current')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                activeView === 'current'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Today's Closing
            </button>
            <button
              onClick={() => setActiveView('history')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                activeView === 'history'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Closing History</span>
            </button>
          </div>

          <button
            onClick={loadClosingData}
            disabled={loading}
            className="p-2 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl transition"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {successMessage && (
        <div className="bg-green-50 border border-green-200 text-green-800 p-3 rounded-xl text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-xl text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {activeView === 'current' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left: Summary Metrics & Breakdown */}
          <div className="lg:col-span-7 space-y-4">
            {/* Sales Totals Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white border border-gray-200 p-3.5 rounded-2xl shadow-xs">
                <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Total Bills</div>
                <div className="text-xl font-black text-gray-900 mt-1">
                  {summary ? summary.totalBills : 0}
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5">Completed today</div>
              </div>

              <div className="bg-white border border-gray-200 p-3.5 rounded-2xl shadow-xs">
                <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Gross Sales</div>
                <div className="text-xl font-black text-gray-900 mt-1">
                  {currency}{summary ? Number(summary.grossSales).toFixed(2) : '0.00'}
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5">Before discounts</div>
              </div>

              <div className="bg-white border border-gray-200 p-3.5 rounded-2xl shadow-xs">
                <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Discounts</div>
                <div className="text-xl font-black text-amber-600 mt-1">
                  {currency}{summary ? Number(summary.discounts).toFixed(2) : '0.00'}
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5">Total discounts given</div>
              </div>

              <div className="bg-white border border-gray-200 p-3.5 rounded-2xl shadow-xs">
                <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Net Sales</div>
                <div className="text-xl font-black text-green-700 mt-1">
                  {currency}{summary ? Number(summary.netSales).toFixed(2) : '0.00'}
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5">Final billed value</div>
              </div>
            </div>

            {/* Payment Method Breakdown */}
            <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs space-y-3">
              <h2 className="font-bold text-sm text-gray-900">Payment Method Breakdown</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-xl border border-green-200 bg-green-50/50 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-green-100 text-green-700 flex items-center justify-center">
                      <Banknote className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-gray-800">Cash in Drawer</div>
                      <div className="text-[10px] text-gray-500">Physical currency</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-extrabold text-green-800">
                      {currency}{summary ? Number(summary.cashSales).toFixed(2) : '0.00'}
                    </div>
                    <div className="text-[10px] text-green-600 font-semibold">Expected Cash</div>
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-blue-200 bg-blue-50/50 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                      <QrCode className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-gray-800">UPI / QR</div>
                      <div className="text-[10px] text-gray-500">Direct bank transfer</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-extrabold text-blue-800">
                      {currency}{summary ? Number(summary.upiSales).toFixed(2) : '0.00'}
                    </div>
                    <div className="text-[10px] text-blue-600 font-semibold">Settled to Bank</div>
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-purple-200 bg-purple-50/50 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
                      <CreditCard className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-gray-800">Card (Debit/Credit)</div>
                      <div className="text-[10px] text-gray-500">POS machine swipe</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-extrabold text-purple-800">
                      {currency}{summary ? Number(summary.cardSales).toFixed(2) : '0.00'}
                    </div>
                    <div className="text-[10px] text-purple-600 font-semibold">Card settlement</div>
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-amber-200 bg-amber-50/50 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                      <BookOpen className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-gray-800">Store Credit (Khata)</div>
                      <div className="text-[10px] text-gray-500">Billed to customer balance</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-extrabold text-amber-800">
                      {currency}{summary ? Number(summary.creditSales).toFixed(2) : '0.00'}
                    </div>
                    <div className="text-[10px] text-amber-600 font-semibold">Added to Khata</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Audit Details if Already Closed */}
            {isClosed && summary?.closingRecord && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-sm text-emerald-900 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Closed Register Record</span>
                  </div>
                  <span className="text-[11px] font-mono text-emerald-700">
                    {new Date(summary.closingRecord.closedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="text-xs text-emerald-800 grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <span className="text-gray-500">Closed By:</span>{' '}
                    <span className="font-bold">{summary.closingRecord.user?.name || 'Cashier'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Expected:</span>{' '}
                    <span className="font-mono font-bold">{currency}{Number(summary.closingRecord.expectedCash).toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Actual Counted:</span>{' '}
                    <span className="font-mono font-bold">{currency}{Number(summary.closingRecord.actualCash).toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Difference:</span>{' '}
                    <span className={`font-mono font-bold ${Number(summary.closingRecord.cashDifference) < 0 ? 'text-red-700' : 'text-emerald-900'}`}>
                      {Number(summary.closingRecord.cashDifference) > 0 ? '+' : ''}{currency}{Number(summary.closingRecord.cashDifference).toFixed(2)}
                    </span>
                  </div>
                </div>
                {summary.closingRecord.notes && (
                  <div className="pt-2 text-[11px] text-emerald-900 border-t border-emerald-200">
                    <span className="font-semibold">Notes:</span> {summary.closingRecord.notes}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: Cash Reconciliation & Closing Action */}
          <div className="lg:col-span-5">
            <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4 sticky top-20">
              <div className="flex items-center space-x-2 pb-2 border-b border-gray-100">
                <Banknote className="w-5 h-5 text-green-600" />
                <div>
                  <h2 className="font-bold text-sm text-gray-900">Physical Cash Count</h2>
                  <p className="text-[11px] text-gray-500">Count the drawer bills & coins and enter total</p>
                </div>
              </div>

              <form onSubmit={handleCloseRegister} className="space-y-4">
                {/* Expected Cash Box */}
                <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-200 flex justify-between items-center">
                  <div>
                    <div className="text-[11px] font-semibold text-gray-500">Expected Cash In Drawer</div>
                    <div className="text-[10px] text-gray-400">Sum of cash bills made today</div>
                  </div>
                  <div className="text-lg font-black text-gray-900">
                    {currency}{expectedCash.toFixed(2)}
                  </div>
                </div>

                {/* Actual Cash Input */}
                <div>
                  <label className="font-bold text-xs text-gray-800 block mb-1">
                    Actual Cash Counted ({currency}) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={actualCash}
                    onChange={(e) => setActualCash(e.target.value)}
                    placeholder="Enter physical cash counted in drawer"
                    disabled={isClosed}
                    className="w-full bg-white border-2 border-green-500 rounded-xl px-3 py-2.5 text-base font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-600 disabled:bg-gray-100 disabled:border-gray-200"
                    required
                  />
                  <p className="text-[10px] text-gray-400 mt-1">
                    Total denomination count (e.g. ₹500×N + ₹200×N + ₹100×N + coins)
                  </p>
                </div>

                {/* Cash Difference Indicator */}
                {actualCash !== '' && !isNaN(Number(actualCash)) && (
                  <div
                    className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                      difference === 0
                        ? 'bg-green-50 border-green-200 text-green-900'
                        : difference > 0
                        ? 'bg-blue-50 border-blue-200 text-blue-900'
                        : 'bg-red-50 border-red-200 text-red-900'
                    }`}
                  >
                    <div>
                      <div className="font-bold">
                        {difference === 0
                          ? 'Perfect Match!'
                          : difference > 0
                          ? 'Cash Over (Excess)'
                          : 'Cash Short (Missing)'}
                      </div>
                      <div className="text-[10px] opacity-80">
                        {difference === 0
                          ? 'Drawer matches sales exactly'
                          : difference > 0
                          ? 'Drawer has extra money'
                          : 'Drawer has less money than sales'}
                      </div>
                    </div>
                    <div className="text-base font-black font-mono">
                      {difference > 0 ? '+' : ''}{currency}{difference.toFixed(2)}
                    </div>
                  </div>
                )}

                {/* Cashier Notes */}
                <div>
                  <label className="font-bold text-xs text-gray-700 block mb-1">
                    Closing Notes / Explanation
                  </label>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Returned ₹50 customer exchange, damaged note placed in envelope..."
                    disabled={isClosed}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-green-500 disabled:bg-gray-100"
                  />
                </div>

                {/* Action Button */}
                {!isClosed ? (
                  <button
                    type="submit"
                    disabled={submitting || actualCash === ''}
                    className="w-full bg-green-700 hover:bg-green-800 disabled:opacity-50 text-white py-3 rounded-xl font-bold text-sm shadow-md active:scale-98 transition flex items-center justify-center gap-2"
                  >
                    <Lock className="w-4 h-4" />
                    <span>{submitting ? 'Recording Closing...' : 'Close Register & Reconcile'}</span>
                  </button>
                ) : (
                  <div className="text-center p-2.5 bg-gray-50 rounded-xl border border-gray-200 text-gray-500 text-xs font-semibold">
                    Register already closed for today
                  </div>
                )}
              </form>
            </div>
          </div>
        </div>
      ) : (
        /* History View */
        <div className="bg-white border border-gray-200 rounded-2xl shadow-xs overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-bold text-sm text-gray-900 flex items-center gap-2">
              <History className="w-4 h-4 text-gray-500" />
              <span>Past Daily Closing Records</span>
            </h2>
            <span className="text-xs text-gray-500">{history.length} closings logged</span>
          </div>

          {history.length === 0 ? (
            <div className="p-12 text-center text-gray-400 text-xs">
              No previous daily closings recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 uppercase tracking-wider text-[10px] border-b border-gray-200">
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Closed By</th>
                    <th className="py-2.5 px-3 text-right">Bills</th>
                    <th className="py-2.5 px-3 text-right">Net Sales</th>
                    <th className="py-2.5 px-3 text-right">Cash</th>
                    <th className="py-2.5 px-3 text-right">UPI</th>
                    <th className="py-2.5 px-3 text-right">Card</th>
                    <th className="py-2.5 px-3 text-right">Expected</th>
                    <th className="py-2.5 px-3 text-right">Actual</th>
                    <th className="py-2.5 px-3 text-right">Diff</th>
                    <th className="py-2.5 px-3">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {history.map((c) => {
                    const diff = Number(c.cashDifference);
                    return (
                      <tr key={c.id} className="hover:bg-gray-50/80 transition">
                        <td className="py-2.5 px-3 font-semibold text-gray-900 whitespace-nowrap">
                          {new Date(c.closingDate).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </td>
                        <td className="py-2.5 px-3 text-gray-700 whitespace-nowrap">
                          {c.user?.name || c.user?.username || 'Cashier'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-medium text-gray-900">
                          {c.totalBills}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-gray-900 whitespace-nowrap">
                          {currency}{Number(c.netSales).toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-gray-600 whitespace-nowrap">
                          {currency}{Number(c.cashSales).toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-gray-600 whitespace-nowrap">
                          {currency}{Number(c.upiSales).toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-gray-600 whitespace-nowrap">
                          {currency}{Number(c.cardSales).toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-gray-600 whitespace-nowrap">
                          {currency}{Number(c.expectedCash).toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-gray-900 whitespace-nowrap">
                          {currency}{Number(c.actualCash).toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <span
                            className={`font-mono font-bold px-1.5 py-0.5 rounded text-[11px] ${
                              diff === 0
                                ? 'bg-green-100 text-green-800'
                                : diff > 0
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {diff > 0 ? '+' : ''}{currency}{diff.toFixed(2)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-gray-500 max-w-[150px] truncate" title={c.notes || ''}>
                          {c.notes || '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

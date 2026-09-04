import React, { useState, useEffect } from 'react';
import {
  X,
  Check,
  Banknote,
  QrCode,
  CreditCard,
  User,
  AlertCircle,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import QRCode from 'qrcode';
import { PaymentMethod, Sale } from '../types/index';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { db } from '../services/db';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaleComplete: (sale: Sale) => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  onSaleComplete,
}) => {
  const { items, subtotal, discount, total, clearCart } = useCart();
  const { shop, user, isOnline } = useAuth();

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('UPI');
  const [cashReceived, setCashReceived] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // UPI Dynamic QR States
  const [qrGenerated, setQrGenerated] = useState<boolean>(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [upiString, setUpiString] = useState<string>('');

  // Reset QR state if total changes
  useEffect(() => {
    setQrGenerated(false);
    setQrDataUrl(null);
    setUpiString('');
  }, [total]);

  const handleGenerateQr = async () => {
    const cleanUpi = (shop?.upiId || 'groceryshop@upi').trim();
    if (!cleanUpi) {
      setErrorMsg('Merchant UPI ID not configured. Please set it in Settings.');
      return;
    }
    setErrorMsg(null);

    const invoiceSuffix = Math.floor(1000 + Math.random() * 9000);
    const invoiceNumber = `${shop?.invoicePrefix || 'INV-'}${invoiceSuffix}`;
    const uri = `upi://pay?pa=${encodeURIComponent(cleanUpi)}&pn=${encodeURIComponent(
      shop?.name || 'Retail POS'
    )}&am=${total.toFixed(2)}&cu=INR&tn=${encodeURIComponent('Bill ' + invoiceNumber)}`;

    try {
      const dataUrl = await QRCode.toDataURL(uri, {
        width: 320,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'M',
      });
      setUpiString(uri);
      setQrDataUrl(dataUrl);
      setQrGenerated(true);
    } catch (err: any) {
      console.error('Failed to generate UPI QR code', err);
      setErrorMsg('Failed to generate QR code. Please check UPI ID format.');
    }
  };

  if (!isOpen) return null;

  const currency = shop?.currency || '₹';
  const cashGivenNumber = parseFloat(cashReceived) || 0;
  const changeToReturn = Math.max(0, cashGivenNumber - total);

  // Common quick cash buttons (e.g. ₹50, ₹100, ₹200, ₹500)
  const quickCashPresets = [
    total,
    Math.ceil(total / 50) * 50,
    Math.ceil(total / 100) * 100,
    500,
  ].filter((val, idx, self) => val >= total && self.indexOf(val) === idx).slice(0, 4);

  const handleCompleteSale = async () => {
    if (items.length === 0) return;

    if (paymentMethod === 'CASH' && cashGivenNumber > 0 && cashGivenNumber < total) {
      setErrorMsg(`Cash received (${currency}${cashGivenNumber}) is less than total amount (${currency}${total})`);
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    const idempotencyKey = `sale_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const invoiceNumber = `${shop?.invoicePrefix || 'INV-'}${Math.floor(1000 + Math.random() * 9000)}`;
    const nowIso = new Date().toISOString();

    const salePayload = {
      idempotencyKey,
      items: items.map((item) => ({
        productId: item.product.id,
        productName: item.product.name,
        quantity: item.quantity,
        unit: item.product.unit,
        unitPrice: item.unitPrice,
        purchasePrice: Number(item.product.purchasePrice) || 0,
        totalPrice: item.totalPrice,
      })),
      subtotal,
      discount,
      total,
      paymentMethod,
      payments: [
        {
          method: paymentMethod,
          amount: total,
          cashReceived: paymentMethod === 'CASH' ? cashGivenNumber || total : null,
          changeGiven: paymentMethod === 'CASH' ? changeToReturn : null,
        },
      ],
      cashReceived: paymentMethod === 'CASH' ? cashGivenNumber || total : null,
      changeGiven: paymentMethod === 'CASH' ? changeToReturn : null,
      notes: customerPhone ? `Cust: ${customerName} (${customerPhone})` : null,
    };

    try {
      if (isOnline) {
        // Try live server checkout
        const res = await api.createSale(salePayload);
        clearCart();
        onSaleComplete(res.sale);
        onClose();
      } else {
        // Handle offline sale save
        await db.pendingSales.add({
          idempotencyKey,
          items: salePayload.items,
          subtotal,
          discount,
          total,
          paymentMethod,
          payments: salePayload.payments,
          createdAt: nowIso,
          invoiceNumber,
          synced: false,
        });

        // Also update local Dexie product stocks
        for (const item of items) {
          const localProd = await db.products.get(item.product.id);
          if (localProd) {
            const newQty = Number(localProd.stockQuantity) - item.quantity;
            await db.products.update(item.product.id, { stockQuantity: newQty });
          }
        }

        const offlineSale: Sale = {
          id: idempotencyKey,
          shopId: shop?.id || 'offline-shop',
          userId: user?.id || 'offline-user',
          invoiceNumber: `${invoiceNumber} (OFFLINE)`,
          subtotal,
          discount,
          total,
          paymentMethod,
          status: 'COMPLETED',
          createdAt: nowIso,
          items: items.map((it, idx) => ({
            id: `item_${idx}`,
            saleId: idempotencyKey,
            productId: it.product.id,
            productName: it.product.name,
            quantity: it.quantity,
            unit: it.product.unit,
            unitPrice: it.unitPrice,
            totalPrice: it.totalPrice,
          })),
          payments: salePayload.payments,
          user: { id: user?.id || '', name: user?.name || 'Cashier', username: user?.username || 'user' },
          shop: shop || undefined,
        };

        clearCart();
        onSaleComplete(offlineSale);
        onClose();
      }
    } catch (err: any) {
      console.warn('Online sale failed, switching to offline fallback queue', err);
      // If network failed during online attempt, store offline as fallback
      await db.pendingSales.add({
        idempotencyKey,
        items: salePayload.items,
        subtotal,
        discount,
        total,
        paymentMethod,
        payments: salePayload.payments,
        createdAt: nowIso,
        invoiceNumber,
        synced: false,
      });

      const fallbackSale: Sale = {
        id: idempotencyKey,
        shopId: shop?.id || 'fallback-shop',
        userId: user?.id || 'fallback-user',
        invoiceNumber: `${invoiceNumber} (OFFLINE)`,
        subtotal,
        discount,
        total,
        paymentMethod,
        status: 'COMPLETED',
        createdAt: nowIso,
        items: items.map((it, idx) => ({
          id: `item_${idx}`,
          saleId: idempotencyKey,
          productId: it.product.id,
          productName: it.product.name,
          quantity: it.quantity,
          unit: it.product.unit,
          unitPrice: it.unitPrice,
          totalPrice: it.totalPrice,
        })),
        payments: salePayload.payments,
        user: { id: user?.id || '', name: user?.name || 'Cashier', username: user?.username || 'user' },
        shop: shop || undefined,
      };

      clearCart();
      onSaleComplete(fallbackSale);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full max-w-sm sm:rounded-2xl rounded-t-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-200">
        {/* Header */}
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Payment & Checkout</h2>
            <div className="text-xs text-gray-500">{items.length} items in cart</div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          {/* Amount Due Big Display */}
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
            <span className="text-xs font-semibold text-green-700 uppercase tracking-wider">Amount to Collect</span>
            <div className="text-3xl font-extrabold text-green-800 tracking-tight mt-0.5">
              {currency}{total.toFixed(2)}
            </div>
            {discount > 0 && (
              <div className="text-xs text-green-600 mt-1">
                Discount applied: {currency}{discount.toFixed(2)}
              </div>
            )}
          </div>

          {/* Payment Method Selector */}
          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-1.5">Payment Method</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod('UPI')}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition active:scale-95 ${
                  paymentMethod === 'UPI'
                    ? 'border-green-600 bg-green-50 text-green-700 font-bold'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                <QrCode className="w-6 h-6 mb-1" />
                <span className="text-xs">UPI</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPaymentMethod('CASH');
                  if (!cashReceived) setCashReceived(total.toString());
                }}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition active:scale-95 ${
                  paymentMethod === 'CASH'
                    ? 'border-green-600 bg-green-50 text-green-700 font-bold'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                <Banknote className="w-6 h-6 mb-1" />
                <span className="text-xs">Cash</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('CARD')}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition active:scale-95 ${
                  paymentMethod === 'CARD'
                    ? 'border-green-600 bg-green-50 text-green-700 font-bold'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                <CreditCard className="w-6 h-6 mb-1" />
                <span className="text-xs">Card</span>
              </button>
            </div>
          </div>

          {/* CASH: Quick Change Calculator */}
          {paymentMethod === 'CASH' && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2.5">
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">
                  Cash Received from Customer
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-gray-500 font-semibold">{currency}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={cashReceived}
                    onChange={(e) => setCashReceived(e.target.value)}
                    placeholder={total.toString()}
                    className="w-full bg-white border border-gray-300 rounded-lg pl-8 pr-3 py-2 text-base font-bold text-gray-900 focus:outline-none focus:border-green-500"
                  />
                </div>
              </div>

              {/* Quick Cash Presets */}
              <div className="flex flex-wrap gap-1.5">
                {quickCashPresets.map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setCashReceived(val.toString())}
                    className={`text-xs px-2.5 py-1 rounded-md border font-semibold ${
                      cashGivenNumber === val
                        ? 'bg-green-600 text-white border-green-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                    }`}
                  >
                    {val === total ? 'Exact' : `${currency}${val}`}
                  </button>
                ))}
              </div>

              {/* Change To Return Display */}
              <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                <span className="text-xs text-gray-600 font-medium">Change to Return:</span>
                <span className={`text-base font-extrabold ${changeToReturn > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
                  {currency}{changeToReturn.toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {/* UPI: Dynamic QR Code Generator */}
          {paymentMethod === 'UPI' && (
            <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-3.5 space-y-3">
              {/* Dynamic QR Code display OR Generate Button */}
              {qrGenerated && qrDataUrl ? (
                <div className="space-y-2.5">
                  <div className="bg-white border border-blue-200 rounded-2xl p-3 flex flex-col items-center shadow-xs">
                    {/* High-res Dynamic QR code */}
                    <div className="p-2 bg-white rounded-xl border border-gray-100 shadow-xs">
                      <img
                        src={qrDataUrl}
                        alt="UPI Dynamic Payment QR Code"
                        className="w-48 h-48 object-contain rounded-lg"
                      />
                    </div>

                    {/* Amount to pay badge */}
                    <div className="mt-2.5 flex items-center gap-1.5 bg-green-50 border border-green-200 text-green-800 px-3 py-1 rounded-full">
                      <span className="text-xs font-medium">Pay Exact:</span>
                      <span className="text-sm font-extrabold">{currency}{total.toFixed(2)}</span>
                    </div>

                    <p className="text-[11px] text-gray-600 text-center mt-2 font-medium">
                      Scan with Google Pay, PhonePe, Paytm or any UPI App
                    </p>

                    {/* App Badges */}
                    <div className="flex items-center gap-1.5 mt-1.5 opacity-85 text-[10px] font-semibold text-gray-600">
                      <span className="bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">GPay</span>
                      <span className="bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">PhonePe</span>
                      <span className="bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">Paytm</span>
                      <span className="bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">BHIM</span>
                    </div>
                  </div>

                  {/* Actions: Re-generate or Direct UPI app link */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleGenerateQr}
                      className="flex-1 bg-white border border-blue-200 hover:bg-blue-50 text-blue-700 py-2 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition shadow-xs"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Refresh QR</span>
                    </button>

                    {upiString && (
                      <a
                        href={upiString}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition shadow-xs"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Open UPI App</span>
                      </a>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-white border border-dashed border-blue-300 rounded-2xl p-4 text-center space-y-3">
                  <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mx-auto shadow-xs">
                    <QrCode className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-gray-900">
                      Dynamic UPI Payment QR
                    </div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      Generates a dynamic QR with amount <span className="font-bold text-gray-800">{currency}{total.toFixed(2)}</span> pre-filled.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleGenerateQr}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 px-4 rounded-xl text-xs font-bold shadow-md active:scale-98 transition flex items-center justify-center gap-1.5"
                  >
                    <QrCode className="w-4 h-4" />
                    <span>Click to Generate QR ({currency}{total.toFixed(2)})</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Customer info (Optional) */}
          <div className="pt-1">
            <details className="text-xs text-gray-600">
              <summary className="cursor-pointer font-medium text-gray-700 hover:text-green-600 flex items-center gap-1">
                <User className="w-3.5 h-3.5" />
                <span>Add Customer Details (Optional)</span>
              </summary>
              <div className="mt-2 space-y-2 pl-4 border-l-2 border-gray-200">
                <input
                  type="tel"
                  placeholder="Customer Phone (e.g. 9876543210)"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-900"
                />
                <input
                  type="text"
                  placeholder="Customer Name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-900"
                />
              </div>
            </details>
          </div>

          {errorMsg && (
            <div className="flex items-center space-x-1.5 bg-red-50 text-red-700 text-xs p-2.5 rounded-lg border border-red-200">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Bottom Giant Complete Checkout Button */}
        <div className="p-3 bg-gray-50 border-t border-gray-200">
          <button
            onClick={handleCompleteSale}
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-3.5 px-4 rounded-xl font-bold text-base flex items-center justify-center space-x-2 shadow-lg active:scale-98 transition"
          >
            {loading ? (
              <span className="animate-pulse">Processing Bill...</span>
            ) : paymentMethod === 'UPI' ? (
              <>
                <Check className="w-5 h-5 stroke-[3]" />
                <span>Confirm Payment Received • {currency}{total.toFixed(2)}</span>
              </>
            ) : (
              <>
                <Check className="w-5 h-5 stroke-[3]" />
                <span>Complete Sale • {currency}{total.toFixed(2)}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

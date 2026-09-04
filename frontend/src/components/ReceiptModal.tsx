import React from 'react';
import { Printer, Share2, PlusCircle, CheckCircle, X } from 'lucide-react';
import { Sale } from '../types/index';
import { useAuth } from '../context/AuthContext';

interface ReceiptModalProps {
  sale: Sale | null;
  isOpen: boolean;
  onClose: () => void;
  onNewBill: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  sale,
  isOpen,
  onClose,
  onNewBill,
}) => {
  const { shop } = useAuth();

  if (!isOpen || !sale) return null;

  const currentShop = sale.shop || shop;
  const currency = currentShop?.currency || '₹';

  const handlePrint = () => {
    window.print();
  };

  const handleShare = async () => {
    const text = `*${currentShop?.name || 'Grocery Shop'}*\n` +
      `Bill: ${sale.invoiceNumber}\n` +
      `Date: ${new Date(sale.createdAt).toLocaleString()}\n` +
      `Total: ${currency}${Number(sale.total).toFixed(2)}\n` +
      `Paid via: ${sale.paymentMethod}\n` +
      `Thank you for shopping with us!`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: `Receipt ${sale.invoiceNumber}`,
          text,
        });
      } catch {
        // user cancelled or share failed
      }
    } else {
      navigator.clipboard?.writeText(text);
      alert('Receipt summary copied to clipboard!');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full max-w-sm sm:rounded-2xl rounded-t-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-200">
        {/* Success Header Bar */}
        <div className="bg-green-600 text-white p-3.5 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-5 h-5 text-green-200" />
            <span className="font-bold text-sm">Sale Completed!</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-green-100 hover:bg-green-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Printable Thermal Receipt Card */}
        <div className="p-4 overflow-y-auto flex-1 text-gray-800 text-xs">
          <div
            id="printable-receipt"
            className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-4 font-mono shadow-inner"
          >
            {/* Header */}
            <div className="text-center pb-3 border-b border-dashed border-gray-300">
              <h2 className="text-base font-extrabold text-gray-900 uppercase tracking-tight">
                {currentShop?.name || 'GROCERY SHOP'}
              </h2>
              {currentShop?.address && (
                <p className="text-[11px] text-gray-600">{currentShop.address}</p>
              )}
              {currentShop?.phone && (
                <p className="text-[11px] text-gray-600">Ph: {currentShop.phone}</p>
              )}
              {currentShop?.gstNumber && (
                <p className="text-[11px] text-gray-600">GSTIN: {currentShop.gstNumber}</p>
              )}
            </div>

            {/* Bill Meta */}
            <div className="py-2.5 border-b border-dashed border-gray-300 text-[11px] space-y-0.5">
              <div className="flex justify-between">
                <span className="text-gray-500">Bill No:</span>
                <span className="font-bold text-gray-900">{sale.invoiceNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Date:</span>
                <span>{new Date(sale.createdAt).toLocaleDateString()} {new Date(sale.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              {sale.user?.name && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Cashier:</span>
                  <span>{sale.user.name}</span>
                </div>
              )}
              {sale.customer?.name && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Customer:</span>
                  <span>{sale.customer.name}</span>
                </div>
              )}
            </div>

            {/* Items Table */}
            <div className="py-2.5 border-b border-dashed border-gray-300">
              <div className="grid grid-cols-12 font-bold text-gray-900 pb-1.5 border-b border-gray-200 text-[11px]">
                <div className="col-span-6">ITEM</div>
                <div className="col-span-2 text-right">QTY</div>
                <div className="col-span-4 text-right">AMT</div>
              </div>
              <div className="divide-y divide-gray-100">
                {sale.items.map((item, index) => {
                  const qty = Number(item.quantity);
                  const price = Number(item.unitPrice);
                  const itemTotal = Number(item.totalPrice);
                  return (
                    <div key={item.id || index} className="py-1.5 grid grid-cols-12 text-[11px]">
                      <div className="col-span-6 font-medium text-gray-900 leading-tight">
                        {item.productName}
                        <div className="text-[10px] text-gray-400">
                          @{currency}{price.toFixed(2)} / {item.unit}
                        </div>
                      </div>
                      <div className="col-span-2 text-right self-center font-semibold text-gray-700">
                        {qty}
                      </div>
                      <div className="col-span-4 text-right self-center font-bold text-gray-900">
                        {currency}{itemTotal.toFixed(2)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Totals Calculation */}
            <div className="py-2.5 border-b border-dashed border-gray-300 space-y-1 text-xs">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal ({sale.items.length} items):</span>
                <span>{currency}{Number(sale.subtotal).toFixed(2)}</span>
              </div>
              {Number(sale.discount) > 0 && (
                <div className="flex justify-between text-red-600 font-semibold">
                  <span>Discount:</span>
                  <span>-{currency}{Number(sale.discount).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-extrabold text-gray-900 pt-1 border-t border-gray-200">
                <span>NET TOTAL:</span>
                <span>{currency}{Number(sale.total).toFixed(2)}</span>
              </div>
            </div>

            {/* Payment Summary */}
            <div className="py-2 border-b border-dashed border-gray-300 text-[11px] space-y-0.5">
              <div className="flex justify-between font-semibold text-gray-800">
                <span>Payment Mode:</span>
                <span className="uppercase text-green-700 font-bold">{sale.paymentMethod}</span>
              </div>
              {sale.payments && sale.payments[0]?.cashReceived && (
                <>
                  <div className="flex justify-between text-gray-600">
                    <span>Cash Received:</span>
                    <span>{currency}{Number(sale.payments[0].cashReceived).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-900 font-bold">
                    <span>Change Given:</span>
                    <span>{currency}{Number(sale.payments[0].changeGiven || 0).toFixed(2)}</span>
                  </div>
                </>
              )}
            </div>

            {/* Receipt Footer */}
            <div className="text-center pt-3 text-[11px] text-gray-500 italic">
              {currentShop?.receiptFooter || 'Thank You! Visit Again 😊'}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-3 bg-gray-50 border-t border-gray-200 grid grid-cols-3 gap-2">
          <button
            onClick={handlePrint}
            className="flex flex-col items-center justify-center p-2.5 bg-white border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-100 active:scale-95 font-medium transition"
          >
            <Printer className="w-5 h-5 mb-1 text-gray-600" />
            <span className="text-[11px]">Print</span>
          </button>

          <button
            onClick={handleShare}
            className="flex flex-col items-center justify-center p-2.5 bg-white border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-100 active:scale-95 font-medium transition"
          >
            <Share2 className="w-5 h-5 mb-1 text-gray-600" />
            <span className="text-[11px]">Share</span>
          </button>

          <button
            onClick={onNewBill}
            className="flex flex-col items-center justify-center p-2.5 bg-green-600 rounded-xl text-white hover:bg-green-700 active:scale-95 font-semibold shadow-sm transition"
          >
            <PlusCircle className="w-5 h-5 mb-1 text-white" />
            <span className="text-[11px]">New Bill</span>
          </button>
        </div>
      </div>
    </div>
  );
};

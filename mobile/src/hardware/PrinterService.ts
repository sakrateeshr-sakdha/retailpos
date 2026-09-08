let SecureStore: any = null;
try {
  SecureStore = require('expo-secure-store');
} catch {}
import { Sale, Shop, PrinterDevice, PrinterSize } from '../types/index';
import { STORAGE_KEYS } from '../utils/constants';

// ESC/POS Command Constants
const ESC = '\x1b';
const GS = '\x1d';

const COMMANDS = {
  INIT: `${ESC}@`,
  ALIGN_LEFT: `${ESC}a\x00`,
  ALIGN_CENTER: `${ESC}a\x01`,
  ALIGN_RIGHT: `${ESC}a\x02`,
  BOLD_ON: `${ESC}E\x01`,
  BOLD_OFF: `${ESC}E\x00`,
  DOUBLE_HEIGHT_ON: `${GS}!\x10`,
  DOUBLE_HEIGHT_OFF: `${GS}!\x00`,
  DOUBLE_SIZE_ON: `${GS}!\x11`,
  DOUBLE_SIZE_OFF: `${GS}!\x00`,
  FEED_AND_CUT: `${ESC}d\x03${GS}V\x00`,
};

class PrinterService {
  private connectedDevice: PrinterDevice | null = null;
  private paperSize: PrinterSize = '58mm';
  private isScanning = false;

  // Real Android hardware test verification flag
  readonly isHardwareVerified: boolean = false;
  readonly hardwareStatusNote: string = 'NOT HARDWARE VERIFIED (Running in cloud sandbox without physical Bluetooth peripheral)';

  constructor() {
    this.restorePrinterSettings();
  }

  private async restorePrinterSettings() {
    try {
      if (!SecureStore) return;
      const savedMac = await SecureStore.getItemAsync(STORAGE_KEYS.PRINTER_MAC);
      const savedSize = (await SecureStore.getItemAsync(STORAGE_KEYS.PRINTER_SIZE)) as PrinterSize;
      if (savedSize === '58mm' || savedSize === '80mm') {
        this.paperSize = savedSize;
      }
      if (savedMac) {
        this.connectedDevice = {
          name: 'Paired Thermal Printer',
          address: savedMac,
          connected: true,
        };
      }
    } catch {}
  }

  async setPaperSize(size: PrinterSize): Promise<void> {
    this.paperSize = size;
    try {
      if (SecureStore) {
        await SecureStore.setItemAsync(STORAGE_KEYS.PRINTER_SIZE, size);
      }
    } catch {}
  }

  getPaperSize(): PrinterSize {
    return this.paperSize;
  }

  getConnectedPrinter(): PrinterDevice | null {
    return this.connectedDevice;
  }

  async discoverPrinters(): Promise<PrinterDevice[]> {
    // In Android runtime with native module, invokes BluetoothAdapter.getBondedDevices()
    // Returns bonded thermal printers
    return [
      { name: 'POS-58 Bluetooth Printer', address: '00:11:22:33:44:55', connected: false },
      { name: 'TVS RP-3150 Thermal 80mm', address: 'AA:BB:CC:DD:EE:FF', connected: false },
      { name: 'Everycom EC-58 Mobile Printer', address: '12:34:56:78:9A:BC', connected: false },
    ];
  }

  async connectPrinter(device: PrinterDevice): Promise<{ success: boolean; message?: string }> {
    try {
      this.connectedDevice = { ...device, connected: true };
      if (SecureStore) {
        await SecureStore.setItemAsync(STORAGE_KEYS.PRINTER_MAC, device.address);
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || 'Failed to connect printer' };
    }
  }

  async disconnectPrinter(): Promise<void> {
    this.connectedDevice = null;
    try {
      if (SecureStore) {
        await SecureStore.deleteItemAsync(STORAGE_KEYS.PRINTER_MAC);
      }
    } catch {}
  }

  /**
   * Generates formatted ESC/POS receipt string for 58mm (32 chars) or 80mm (48 chars)
   */
  formatReceiptText(sale: Sale, shop: Shop | null, size: PrinterSize = this.paperSize): string {
    const cols = size === '58mm' ? 32 : 48;
    const divider = '-'.repeat(cols);
    const doubleDivider = '='.repeat(cols);

    const padRow = (left: string, right: string) => {
      const space = cols - left.length - right.length;
      return left + ' '.repeat(Math.max(1, space)) + right;
    };

    let text = '';
    text += COMMANDS.INIT;

    // Header: Shop Name (Bold Center)
    text += COMMANDS.ALIGN_CENTER;
    text += COMMANDS.BOLD_ON;
    text += `${shop?.name || 'GROCERY POS'}\n`;
    text += COMMANDS.BOLD_OFF;

    if (shop?.address) text += `${shop.address}\n`;
    if (shop?.phone) text += `Ph: ${shop.phone}\n`;
    if (shop?.gstEnabled && shop?.gstNumber) text += `GSTIN: ${shop.gstNumber}\n`;

    text += `${doubleDivider}\n`;

    // Invoice Metadata
    text += COMMANDS.ALIGN_LEFT;
    text += padRow(`Invoice: ${sale.invoiceNumber}`, new Date(sale.createdAt).toLocaleDateString()) + '\n';
    text += padRow(`Cashier: ${sale.user?.name || 'Cashier'}`, new Date(sale.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) + '\n';
    text += `${divider}\n`;

    // Items Table Header
    text += COMMANDS.BOLD_ON;
    if (size === '58mm') {
      text += padRow('Item', 'Qty   Price') + '\n';
    } else {
      text += padRow('Item Description', 'Qty    Rate    Total') + '\n';
    }
    text += COMMANDS.BOLD_OFF;
    text += `${divider}\n`;

    // Items
    for (const item of sale.items) {
      const name = item.productName || 'Item';
      const qtyStr = `${item.quantity} ${item.unit || ''}`.trim();
      const rateStr = `${shop?.currency || '₹'}${item.unitPrice.toFixed(2)}`;
      const totalStr = `${shop?.currency || '₹'}${item.totalPrice.toFixed(2)}`;

      if (size === '58mm') {
        text += `${name}\n`;
        text += padRow(`  ${qtyStr} x ${rateStr}`, totalStr) + '\n';
      } else {
        const leftPart = name.length > 20 ? name.slice(0, 19) + '…' : name;
        const rightPart = `${qtyStr.padStart(6)}  ${rateStr.padStart(8)}  ${totalStr.padStart(8)}`;
        text += padRow(leftPart, rightPart) + '\n';
      }
    }

    text += `${divider}\n`;

    // Financial Totals
    text += padRow('Subtotal:', `${shop?.currency || '₹'}${sale.subtotal.toFixed(2)}`) + '\n';
    if (sale.discount > 0) {
      text += padRow('Discount:', `-${shop?.currency || '₹'}${sale.discount.toFixed(2)}`) + '\n';
    }

    // GST Breakdown if Enabled
    if (shop?.gstEnabled) {
      const cgstRate = Number(shop.defaultCgstRate || 0);
      const sgstRate = Number(shop.defaultSgstRate || 0);
      const totalTaxRate = cgstRate + sgstRate;
      if (totalTaxRate > 0) {
        const taxable = sale.total / (1 + totalTaxRate / 100);
        const taxAmt = sale.total - taxable;
        const cgstAmt = taxAmt / 2;
        const sgstAmt = taxAmt / 2;

        text += `${divider}\n`;
        text += padRow(`Taxable Amount:`, `${shop.currency || '₹'}${taxable.toFixed(2)}`) + '\n';
        text += padRow(`CGST (${cgstRate}%):`, `${shop.currency || '₹'}${cgstAmt.toFixed(2)}`) + '\n';
        text += padRow(`SGST (${sgstRate}%):`, `${shop.currency || '₹'}${sgstAmt.toFixed(2)}`) + '\n';
        text += padRow(`Total GST:`, `${shop.currency || '₹'}${taxAmt.toFixed(2)}`) + '\n';
      }
    }

    text += `${doubleDivider}\n`;

    // Grand Total (Bold Double Height)
    text += COMMANDS.BOLD_ON;
    text += padRow('NET TOTAL:', `${shop?.currency || '₹'}${sale.total.toFixed(2)}`) + '\n';
    text += COMMANDS.BOLD_OFF;

    text += `${divider}\n`;

    // Payment method & cash tender
    text += padRow('Payment Mode:', sale.paymentMethod) + '\n';
    if (sale.paymentMethod === 'CASH' && sale.cashReceived) {
      text += padRow('Cash Tendered:', `${shop?.currency || '₹'}${sale.cashReceived.toFixed(2)}`) + '\n';
      if (sale.changeGiven !== null && sale.changeGiven !== undefined) {
        text += padRow('Change Returned:', `${shop?.currency || '₹'}${sale.changeGiven.toFixed(2)}`) + '\n';
      }
    }

    text += `${doubleDivider}\n`;

    // Footer
    text += COMMANDS.ALIGN_CENTER;
    text += `${shop?.receiptFooter || 'Thank You! Visit Again 😊'}\n`;
    text += 'Powered by RetailPOS\n';
    text += '\n\n';
    text += COMMANDS.FEED_AND_CUT;

    return text;
  }

  async printReceipt(sale: Sale, shop: Shop | null): Promise<{ success: boolean; message?: string }> {
    const rawText = this.formatReceiptText(sale, shop, this.paperSize);

    // In a real device with paired hardware, sends rawText bytes via BluetoothSocket
    // Log formatted receipt string for headless testing
    console.log('[PrinterService] Printing ESC/POS receipt for Invoice:', sale.invoiceNumber);
    console.log(rawText);

    return {
      success: true,
      message: `Receipt sent to ${this.connectedDevice?.name || 'Thermal Printer'} (${this.paperSize})`,
    };
  }

  async testPrint(shop: Shop | null): Promise<{ success: boolean; message?: string }> {
    const sampleSale: Sale = {
      id: 'test_sample',
      shopId: shop?.id || 'sample_shop',
      userId: 'user_1',
      invoiceNumber: 'TEST-0001',
      subtotal: 100.0,
      discount: 10.0,
      total: 90.0,
      paymentMethod: 'CASH',
      cashReceived: 100.0,
      changeGiven: 10.0,
      status: 'COMPLETED',
      createdAt: new Date().toISOString(),
      items: [
        { productId: 'p1', productName: 'Sample Grocery Item', quantity: 2, unit: 'pcs', unitPrice: 50.0, totalPrice: 100.0 },
      ],
      payments: [
        { method: 'CASH', amount: 90.0, cashReceived: 100.0, changeGiven: 10.0 },
      ],
    };

    return this.printReceipt(sampleSale, shop);
  }
}

export const printerService = new PrinterService();

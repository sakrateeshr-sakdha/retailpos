import React, { useState, useRef } from 'react';
import {
  X,
  UploadCloud,
  FileSpreadsheet,
  Download,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  ArrowRight,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { api } from '../services/api';

interface ProductImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

interface ParsedRow {
  productName: string;
  barcode?: string;
  sku?: string;
  category?: string;
  purchasePrice?: number;
  sellingPrice: number;
  stock?: number;
  unit?: string;
  lowStockThreshold?: number;
  hsnCode?: string;
  gstRate?: number;
  [key: string]: any;
}

export const ProductImportModal: React.FC<ProductImportModalProps> = ({
  isOpen,
  onClose,
  onImportComplete,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationErrors, setValidationErrors] = useState<
    { row: number; field: string; message: string }[]
  >([]);
  const [importSummary, setImportSummary] = useState<{
    total: number;
    imported: number;
    updated: number;
    skipped: number;
    errorsCount: number;
  } | null>(null);
  const [step, setStep] = useState<'upload' | 'preview' | 'result'>('upload');

  if (!isOpen) return null;

  const handleDownloadSample = () => {
    const csvContent =
      'productName,barcode,sku,category,purchasePrice,sellingPrice,stock,unit,lowStockThreshold\n' +
      'Basmati Rice 5kg,890123400101,BR5K,Grains & Staples,320,380,50,pcs,10\n' +
      'Aashirvaad Atta 10kg,890123400102,AA10K,Grains & Staples,410,460,40,pcs,5\n' +
      'Sunflower Cooking Oil 1L,890123400103,SFO1L,Oils & Ghee,135,160,100,litre,15\n' +
      'Toned Milk 500ml,890123400104,MLK500,Dairy,26,30,80,packet,20\n' +
      'Toor Dal Premium 1kg,890123400105,TD1K,Pulses,140,165,60,kg,10\n';

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'grocery_products_sample.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setValidating(true);
    setValidationErrors([]);
    setImportSummary(null);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rawData: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      if (rawData.length === 0) {
        setValidationErrors([
          { row: 0, field: 'file', message: 'File is empty or contains no valid rows' },
        ]);
        setStep('preview');
        setValidating(false);
        return;
      }

      // Normalize keys to support flexible casing / headers
      const mappedRows: ParsedRow[] = rawData.map((row) => {
        const getVal = (possibleKeys: string[]): any => {
          for (const k of Object.keys(row)) {
            const cleanKey = k.toLowerCase().replace(/[\s_-]/g, '');
            for (const target of possibleKeys) {
              if (cleanKey === target.toLowerCase().replace(/[\s_-]/g, '')) {
                return row[k];
              }
            }
          }
          return undefined;
        };

        const name = String(getVal(['productName', 'name', 'item', 'itemName']) || '').trim();
        const barcodeVal = getVal(['barcode', 'code', 'barcodeNumber']);
        const barcode = barcodeVal ? String(barcodeVal).trim() : undefined;
        const skuVal = getVal(['sku', 'itemCode']);
        const sku = skuVal ? String(skuVal).trim() : undefined;
        const categoryVal = getVal(['category', 'categoryName']);
        const category = categoryVal ? String(categoryVal).trim() : undefined;
        const purchasePrice = parseFloat(getVal(['purchasePrice', 'costPrice', 'buyPrice']) || '0') || 0;
        const sellingPrice = parseFloat(getVal(['sellingPrice', 'price', 'mrp', 'rate']) || '0') || 0;
        const stock = parseFloat(getVal(['stock', 'stockQuantity', 'qty', 'quantity']) || '0') || 0;
        const unit = String(getVal(['unit', 'uom']) || 'pcs').trim() || 'pcs';
        const lowStockThreshold = parseFloat(getVal(['lowStockThreshold', 'minStock']) || '5') || 5;

        return {
          productName: name,
          barcode,
          sku,
          category,
          purchasePrice,
          sellingPrice,
          stock,
          unit,
          lowStockThreshold,
        };
      });

      setParsedRows(mappedRows);

      // Perform server-side dry run validation
      const dryRunRes = await api.importProducts({
        products: mappedRows,
        updateExisting,
        dryRun: true,
      });

      if (!dryRunRes.success && dryRunRes.errors) {
        setValidationErrors(dryRunRes.errors);
      } else {
        setValidationErrors([]);
      }

      setStep('preview');
    } catch (err: any) {
      console.error('File parsing error', err);
      setValidationErrors([
        {
          row: 0,
          field: 'parse',
          message: err.message || 'Failed to read file. Please ensure valid CSV or Excel format.',
        },
      ]);
      setStep('preview');
    } finally {
      setValidating(false);
    }
  };

  const handleExecuteImport = async () => {
    if (parsedRows.length === 0 || validationErrors.length > 0) return;

    setLoading(true);
    try {
      const res = await api.importProducts({
        products: parsedRows,
        updateExisting,
        dryRun: false,
      });

      if (res.success && res.summary) {
        setImportSummary(res.summary);
        setStep('result');
        onImportComplete();
      }
    } catch (err: any) {
      alert(err.message || 'Import failed. Please check data.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFileName(null);
    setParsedRows([]);
    setValidationErrors([]);
    setImportSummary(null);
    setStep('upload');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-green-100 text-green-700 rounded-xl">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-gray-900">Bulk Product Import</h3>
              <p className="text-xs text-gray-500">Import catalog via CSV or Excel (.xlsx)</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {/* STEP 1: UPLOAD */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 hover:border-green-500 rounded-2xl p-8 text-center cursor-pointer transition bg-gray-50/50 hover:bg-green-50/30 flex flex-col items-center justify-center space-y-3"
              >
                <div className="w-14 h-14 bg-green-100 text-green-700 rounded-full flex items-center justify-center shadow-xs">
                  <UploadCloud className="w-7 h-7" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-800">
                    Click to browse or drop CSV / Excel file
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">Supports .csv, .xlsx, .xls</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              {/* Sample Template Download */}
              <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-emerald-900">Need a sample file?</p>
                  <p className="text-[11px] text-emerald-700">
                    Download our ready-made CSV template with correct headers.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadSample}
                  className="px-3 py-1.5 bg-white border border-emerald-300 text-emerald-800 rounded-xl text-xs font-bold hover:bg-emerald-100/50 transition flex items-center space-x-1.5 shadow-xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Sample CSV</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: PREVIEW & VALIDATION */}
          {step === 'preview' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-gray-50 p-3 rounded-2xl border border-gray-200">
                <div className="flex items-center space-x-2">
                  <FileSpreadsheet className="w-5 h-5 text-green-600" />
                  <div>
                    <p className="text-xs font-bold text-gray-900">{fileName}</p>
                    <p className="text-[11px] text-gray-500">{parsedRows.length} total rows parsed</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-xs text-gray-500 hover:text-gray-900 font-semibold underline"
                >
                  Change file
                </button>
              </div>

              {/* Error Banner */}
              {validationErrors.length > 0 ? (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-2 text-xs text-red-800">
                  <div className="flex items-center space-x-2 font-bold text-red-900">
                    <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                    <span>{validationErrors.length} Validation Error(s) Found</span>
                  </div>
                  <p className="text-[11px] text-red-700">
                    Please fix these errors in your file and re-upload before proceeding:
                  </p>
                  <ul className="max-h-36 overflow-y-auto space-y-1 list-disc list-inside font-mono text-[11px] bg-white/70 p-2.5 rounded-xl border border-red-100">
                    {validationErrors.map((err, i) => (
                      <li key={i}>{err.message}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="bg-green-50 border border-green-200 rounded-2xl p-3 flex items-center space-x-2 text-xs font-semibold text-green-800">
                  <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                  <span>All {parsedRows.length} rows validated successfully. Ready for import!</span>
                </div>
              )}

              {/* Update existing toggle */}
              <label className="flex items-center space-x-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={updateExisting}
                  onChange={(e) => setUpdateExisting(e.target.checked)}
                  className="rounded text-green-600 focus:ring-green-500 h-4 w-4"
                />
                <span className="text-xs font-medium text-gray-700">
                  Update existing products if barcode already exists in catalog
                </span>
              </label>

              {/* Preview Table */}
              <div className="space-y-1.5">
                <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                  Data Preview (First 10 rows):
                </p>
                <div className="border border-gray-200 rounded-2xl overflow-hidden max-h-56 overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse font-mono">
                    <thead className="bg-gray-100 text-gray-600 text-[10px] uppercase font-sans sticky top-0">
                      <tr>
                        <th className="p-2 border-b">#</th>
                        <th className="p-2 border-b">Product Name</th>
                        <th className="p-2 border-b">Barcode</th>
                        <th className="p-2 border-b">Price</th>
                        <th className="p-2 border-b">Stock</th>
                        <th className="p-2 border-b">Unit</th>
                        <th className="p-2 border-b">Category</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-[11px]">
                      {parsedRows.slice(0, 10).map((row, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="p-2 text-gray-400">{idx + 1}</td>
                          <td className="p-2 font-medium font-sans text-gray-900">{row.productName}</td>
                          <td className="p-2 text-gray-600">{row.barcode || '-'}</td>
                          <td className="p-2 font-bold text-green-700">₹{row.sellingPrice}</td>
                          <td className="p-2 text-gray-700">{row.stock}</td>
                          <td className="p-2 text-gray-500">{row.unit}</td>
                          <td className="p-2 font-sans text-gray-600">{row.category || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: RESULT SUMMARY */}
          {step === 'result' && importSummary && (
            <div className="space-y-4 text-center py-4">
              <div className="w-16 h-16 bg-green-100 text-green-700 rounded-3xl mx-auto flex items-center justify-center shadow-inner">
                <CheckCircle className="w-9 h-9" />
              </div>
              <div>
                <h4 className="text-lg font-extrabold text-gray-900">Import Completed!</h4>
                <p className="text-xs text-gray-500 mt-1">Catalog updated successfully</p>
              </div>

              <div className="grid grid-cols-4 gap-2 bg-gray-50 border border-gray-200 rounded-2xl p-4">
                <div>
                  <p className="text-[10px] text-gray-500 uppercase font-bold">Total</p>
                  <p className="text-base font-extrabold text-gray-900">{importSummary.total}</p>
                </div>
                <div>
                  <p className="text-[10px] text-green-600 uppercase font-bold">Imported</p>
                  <p className="text-base font-extrabold text-green-700">{importSummary.imported}</p>
                </div>
                <div>
                  <p className="text-[10px] text-blue-600 uppercase font-bold">Updated</p>
                  <p className="text-base font-extrabold text-blue-700">{importSummary.updated}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 uppercase font-bold">Skipped</p>
                  <p className="text-base font-extrabold text-gray-600">{importSummary.skipped}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
          {step === 'upload' && (
            <>
              <span className="text-xs text-gray-400">CSV or Excel format</span>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-xl text-xs font-semibold hover:bg-gray-100 transition"
              >
                Cancel
              </button>
            </>
          )}

          {step === 'preview' && (
            <>
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-xl text-xs font-semibold hover:bg-gray-100 transition"
              >
                Back
              </button>
              <button
                type="button"
                disabled={loading || validating || validationErrors.length > 0 || parsedRows.length === 0}
                onClick={handleExecuteImport}
                className="px-5 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center space-x-1.5"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Importing...</span>
                  </>
                ) : (
                  <>
                    <span>Confirm & Import ({parsedRows.length})</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </>
          )}

          {step === 'result' && (
            <div className="w-full flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold shadow-md transition"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

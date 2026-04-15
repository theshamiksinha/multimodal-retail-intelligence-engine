import { useState, useEffect, useRef, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { AlertTriangle, Package, TrendingDown, Clock, Upload, Trash2, Loader2, FileSpreadsheet, ShoppingCart } from 'lucide-react';
import { getInventoryStatus, getSalesSummary, getInventoryFileInfo, uploadInventoryCsv, deleteInventoryFile, getSalesFileInfo, uploadSalesCsv, deleteSalesFile } from '../api';

const PERIODS = [
  { key: 'daily',   label: 'Daily',   days: 7  },
  { key: 'weekly',  label: 'Weekly',  days: 28 },
  { key: 'monthly', label: 'Monthly', days: 90 },
];

function PeriodFilter({ period, onChange }) {
  return (
    <div className="flex gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-gray-800">
      {PERIODS.map(p => (
        <button key={p.key} onClick={() => onChange(p.key)}
          className={`period-pill px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            period === p.key
              ? 'bg-white dark:bg-gray-700 text-blue-700 dark:text-blue-300 shadow-sm'
              : 'text-slate-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400'
          }`}>
          {p.label}
        </button>
      ))}
    </div>
  );
}
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from 'react-i18next';
import VoiceInventoryAdd from './VoiceInventoryAdd';
import OCRInventoryAdd from './OCRInventoryAdd';
import { SETUP_KEY } from '../components/SetupWizard';

function getFeatures() {
  try {
    const d = JSON.parse(localStorage.getItem(SETUP_KEY)) || {};
    return d.features || { voiceEntry: false, ocrEntry: false };
  } catch { return { voiceEntry: false, ocrEntry: false }; }
}

const CARD = 'bg-white dark:bg-gray-900 rounded-2xl border border-slate-100 dark:border-gray-800 shadow-sm';

function CsvInventoryUpload({ onUploaded }) {
  const { t } = useTranslation();
  const fileRef = useRef();
  const [fileInfo, setFileInfo]   = useState(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting]   = useState(false);

  useEffect(() => {
    getInventoryFileInfo().then(r => setFileInfo(r.data)).catch(() => {});
  }, []);

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await uploadInventoryCsv(fd);
      setFileInfo({ loaded: true, filename: file.name, records: res.data.records });
      onUploaded?.();
    } catch (err) {
      alert('Upload failed: ' + (err.response?.data?.detail || err.message));
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Remove the uploaded inventory file and revert to sample data?')) return;
    setDeleting(true);
    try {
      await deleteInventoryFile();
      setFileInfo({ loaded: false, filename: null, records: 0 });
      onUploaded?.();
    } catch (err) {
      alert('Delete failed: ' + (err.response?.data?.detail || err.message));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className={`${CARD} p-5 flex flex-col`}>
      <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFile} />

      {/* Header */}
      <div className="flex items-center gap-2.5 mb-5">
        <div className="p-2 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl">
          <FileSpreadsheet size={16} className="text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-800 dark:text-gray-100 text-sm">{t('inventory.importCsv', 'CSV / Excel Import')}</h3>
          <p className="text-[11px] text-slate-400 dark:text-gray-500 mt-0.5">
            {t('inventory.importSub', 'Upload or replace your inventory file')}
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-col items-center gap-4 py-6 flex-1 justify-center">
        {fileInfo?.loaded ? (
          <div className="w-full space-y-3">
            <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40 rounded-xl">
              <Upload size={15} className="text-emerald-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400 truncate">{fileInfo.filename}</p>
                <p className="text-xs text-emerald-600/70 dark:text-emerald-500">{fileInfo.records} products loaded</p>
              </div>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors disabled:opacity-50"
                title="Remove file"
              >
                {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              </button>
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-gray-600 text-xs text-slate-400 dark:text-gray-500 hover:border-blue-400 hover:text-blue-500 transition-colors disabled:opacity-50"
            >
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              {uploading ? 'Uploading…' : 'Replace with a new file'}
            </button>
          </div>
        ) : (
          <>
            <p className="text-xs text-slate-400 dark:text-gray-500 text-center max-w-xs">
              Upload a <span className="font-medium text-slate-500 dark:text-gray-400">.csv</span> or{' '}
              <span className="font-medium text-slate-500 dark:text-gray-400">.xlsx</span> file with columns like{' '}
              <span className="italic">product_name, current_stock, unit_price, days_to_expiry…</span>
            </p>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="group relative flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-sm font-medium transition-all shadow-md hover:shadow-lg active:scale-95 disabled:opacity-50"
            >
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
              {uploading ? 'Uploading…' : 'Import CSV / Excel'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function CsvSalesUpload({ onUploaded }) {
  const { t } = useTranslation();
  const fileRef = useRef();
  const [fileInfo, setFileInfo]   = useState(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting]   = useState(false);

  useEffect(() => {
    getSalesFileInfo().then(r => setFileInfo(r.data)).catch(() => {});
  }, []);

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await uploadSalesCsv(fd);
      setFileInfo({ loaded: true, filename: file.name, records: res.data.records });
      onUploaded?.();
    } catch (err) {
      alert('Upload failed: ' + (err.response?.data?.detail || err.message));
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Remove the uploaded POS sales file and revert to sample data?')) return;
    setDeleting(true);
    try {
      await deleteSalesFile();
      setFileInfo({ loaded: false, filename: null, records: 0 });
      onUploaded?.();
    } catch (err) {
      alert('Delete failed: ' + (err.response?.data?.detail || err.message));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className={`${CARD} p-5 flex flex-col`}>
      <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFile} />

      {/* Header */}
      <div className="flex items-center gap-2.5 mb-5">
        <div className="p-2 bg-violet-50 dark:bg-violet-950/40 rounded-xl">
          <ShoppingCart size={16} className="text-violet-600 dark:text-violet-400" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-800 dark:text-gray-100 text-sm">{t('inventory.salesImport', 'POS Sales Import')}</h3>
          <p className="text-[11px] text-slate-400 dark:text-gray-500 mt-0.5">
            {t('inventory.salesImportSub', 'Upload or replace your sales transactions file')}
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-col items-center gap-4 py-6 flex-1 justify-center">
        {fileInfo?.loaded ? (
          <div className="w-full space-y-3">
            <div className="flex items-center gap-3 px-4 py-3 bg-violet-50 dark:bg-violet-950/30 border border-violet-100 dark:border-violet-900/40 rounded-xl">
              <Upload size={15} className="text-violet-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-violet-700 dark:text-violet-400 truncate">{fileInfo.filename}</p>
                <p className="text-xs text-violet-600/70 dark:text-violet-500">{fileInfo.records.toLocaleString()} transactions loaded</p>
              </div>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors disabled:opacity-50"
                title="Remove file"
              >
                {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              </button>
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-gray-600 text-xs text-slate-400 dark:text-gray-500 hover:border-violet-400 hover:text-violet-500 transition-colors disabled:opacity-50"
            >
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              {uploading ? 'Uploading…' : 'Replace with a new file'}
            </button>
          </div>
        ) : (
          <>
            <p className="text-xs text-slate-400 dark:text-gray-500 text-center max-w-xs">
              Expects columns like{' '}
              <span className="italic">date, product_name, quantity, line_total…</span>
            </p>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="group relative flex items-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-2xl text-sm font-medium transition-all shadow-md hover:shadow-lg active:scale-95 disabled:opacity-50"
            >
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <ShoppingCart size={16} />}
              {uploading ? 'Uploading…' : 'Import POS Sales'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function InventoryInsights() {
  const { t } = useTranslation();
  const { dark } = useTheme();
  const features = getFeatures();
  const [inventory, setInventory] = useState(null);
  const [sales, setSales]         = useState(null);
  const [loading, setLoading]     = useState(true);
  const [period, setPeriod]       = useState('monthly');

  const fetchData = () => {
    Promise.all([
      getInventoryStatus().catch(() => null),
      getSalesSummary().catch(() => null),
    ]).then(([i, s]) => {
      setInventory(i?.data);
      setSales(s?.data);
      setLoading(false);
    });
  };

  useEffect(() => { fetchData(); }, []);

  const periodDays = useMemo(() => PERIODS.find(p => p.key === period)?.days ?? 90, [period]);

  const filteredTrends = useMemo(() =>
    sales?.trends?.slice(-periodDays) || [], [sales, periodDays]);

  const axisColor   = dark ? '#6b7280' : '#94a3b8';
  const tooltipStyle = dark
    ? { backgroundColor: '#1f2937', border: '1px solid #374151', color: '#f3f4f6', borderRadius: 10 }
    : { backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 10 };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-80">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const showVoice = features.voiceEntry;
  const showOcr   = features.ocrEntry;
  const showAdvanced = showVoice || showOcr;

  return (
    <div className="space-y-5">
      {/* Period filter */}
      <div className="flex items-center justify-between animate-fade-in-up">
        <p className="text-sm font-semibold text-slate-700 dark:text-gray-300">
          Inventory &amp; Sales Overview
        </p>
        <PeriodFilter period={period} onChange={setPeriod} />
      </div>

      {showAdvanced && (
        <div className={`grid grid-cols-1 lg:grid-cols-2 gap-5`}>
          {showVoice && <VoiceInventoryAdd onProductsAdded={fetchData} />}
          {showOcr   && <OCRInventoryAdd  onProductsAdded={fetchData} />}
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <CsvInventoryUpload onUploaded={fetchData} />
        <CsvSalesUpload onUploaded={fetchData} />
      </div>

      {/* Summary cards — only when data exists */}
      {inventory ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className={`${CARD} p-5`}>
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 bg-blue-50 dark:bg-blue-950/40 rounded-xl">
                  <Package size={15} className="text-blue-600 dark:text-blue-400" />
                </div>
                <span className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wide">{t('inventory.totalProducts', 'Total Products')}</span>
              </div>
              <p className="text-2xl font-bold text-slate-800 dark:text-gray-100">{inventory.total_products}</p>
              <p className="text-xs text-slate-400 dark:text-gray-500 mt-1">
                Value: ₹{inventory.total_inventory_value?.toLocaleString()}
              </p>
            </div>

            <div className={`${CARD} p-5 border-amber-100 dark:border-amber-900/40`}>
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 bg-amber-50 dark:bg-amber-950/40 rounded-xl">
                  <Clock size={15} className="text-amber-600 dark:text-amber-400" />
                </div>
                <span className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wide">{t('dashboard.expiring', 'Expiring Soon')}</span>
              </div>
              <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{inventory.expiring_soon?.length ?? 0}</p>
              <p className="text-xs text-amber-500 mt-1">Within 7 days</p>
            </div>

            <div className={`${CARD} p-5 border-red-100 dark:border-red-900/40`}>
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 bg-red-50 dark:bg-red-950/40 rounded-xl">
                  <AlertTriangle size={15} className="text-red-600 dark:text-red-400" />
                </div>
                <span className="text-xs font-medium text-red-600 dark:text-red-400 uppercase tracking-wide">{t('dashboard.lowStock', 'Low Stock')}</span>
              </div>
              <p className="text-2xl font-bold text-red-700 dark:text-red-300">{inventory.low_stock?.length ?? 0}</p>
              <p className="text-xs text-red-500 mt-1">Below reorder point</p>
            </div>
          </div>

          {/* Expiry + Low stock */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className={`${CARD} p-5`}>
              <h3 className="font-semibold text-slate-800 dark:text-gray-100 text-sm mb-4 flex items-center gap-2">
                <AlertTriangle size={14} className="text-amber-500" /> {t('dashboard.expiring', 'Expiring Soon')}
              </h3>
              {inventory.expiring_soon?.length > 0 ? (
                <div className="space-y-2">
                  {inventory.expiring_soon.map((item, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-950/20 rounded-xl">
                      <div>
                        <p className="text-sm font-medium text-slate-800 dark:text-gray-100">{item.product_name}</p>
                        <p className="text-xs text-slate-500 dark:text-gray-400">{item.category} · {item.current_stock} in stock</p>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        item.days_to_expiry <= 3
                          ? 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-400'
                          : 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400'
                      }`}>
                        {item.days_to_expiry}d left
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400 dark:text-gray-500 py-6 text-center">No products expiring soon</p>
              )}
            </div>

            <div className={`${CARD} p-5`}>
              <h3 className="font-semibold text-slate-800 dark:text-gray-100 text-sm mb-4 flex items-center gap-2">
                <TrendingDown size={14} className="text-red-500" /> {t('inventory.lowStockAlert', 'Low Stock Alert')}
              </h3>
              {inventory.low_stock?.length > 0 ? (
                <div className="space-y-2">
                  {inventory.low_stock.map((item, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-950/20 rounded-xl">
                      <div>
                        <p className="text-sm font-medium text-slate-800 dark:text-gray-100">{item.product_name}</p>
                        <p className="text-xs text-slate-500 dark:text-gray-400">{item.category}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-red-600 dark:text-red-400">{item.current_stock} units</p>
                        <p className="text-xs text-slate-400 dark:text-gray-500">Reorder at {item.reorder_point}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400 dark:text-gray-500 py-6 text-center">All products adequately stocked</p>
              )}
            </div>
          </div>

          {/* Full inventory table */}
          <div className={`${CARD} p-5`}>
            <h3 className="font-semibold text-slate-800 dark:text-gray-100 text-sm mb-4">{t('inventory.fullTitle', 'Full Inventory')}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-gray-800">
                    <th className="pb-3 text-left text-xs font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wide">{t('inventory.prod', 'Product')}</th>
                    <th className="pb-3 text-left text-xs font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wide">{t('inventory.cat', 'Category')}</th>
                    <th className="pb-3 text-right text-xs font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wide">{t('inventory.stock', 'Stock')}</th>
                    <th className="pb-3 text-right text-xs font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wide">{t('inventory.price', 'Price')}</th>
                    <th className="pb-3 text-right text-xs font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wide">{t('inventory.expiry', 'Expiry')}</th>
                    <th className="pb-3 text-center text-xs font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wide">{t('inventory.status', 'Status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-gray-800">
                  {inventory.all_items?.map((item, i) => (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="py-3 text-slate-800 dark:text-gray-200 font-medium">{item.product_name}</td>
                      <td className="py-3 text-slate-500 dark:text-gray-400">{item.category}</td>
                      <td className="py-3 text-right text-slate-800 dark:text-gray-200">{item.current_stock}</td>
                      <td className="py-3 text-right text-slate-800 dark:text-gray-200">₹{item.unit_price}</td>
                      <td className="py-3 text-right text-slate-500 dark:text-gray-400">
                        {item.days_to_expiry != null ? `${item.days_to_expiry}d` : '—'}
                      </td>
                      <td className="py-3 text-center">
                        {item.current_stock <= item.reorder_point ? (
                          <span className="px-2.5 py-1 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded-full text-xs font-medium animate-pulse">{t('inventory.statusLow', 'Low')}</span>
                        ) : item.days_to_expiry != null && item.days_to_expiry <= 7 ? (
                          <span className="px-2.5 py-1 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-full text-xs font-medium">{t('inventory.statusExpiring', 'Expiring')}</span>
                        ) : (
                          <span className="px-2.5 py-1 bg-green-50 dark:bg-green-950/40 text-green-600 dark:text-green-400 rounded-full text-xs font-medium">{t('inventory.statusOk', 'OK')}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className={`${CARD} p-10 flex flex-col items-center gap-3 text-center`}>
          <Package size={32} className="text-slate-300 dark:text-gray-600" />
          <p className="text-sm font-medium text-slate-500 dark:text-gray-400">No inventory data yet</p>
          <p className="text-xs text-slate-400 dark:text-gray-500 max-w-xs">
            Upload a CSV / Excel file above, or use Voice / OCR entry to add your first products.
          </p>
        </div>
      )}

      {/* Stockout Risk */}
      {inventory?.stockout_risk?.length > 0 && (
        <div className={`${CARD} p-5`}>
          <h3 className="font-semibold text-slate-800 dark:text-gray-100 text-sm mb-1 flex items-center gap-2">
            <AlertTriangle size={14} className="text-red-500" />
            Stockout Risk
          </h3>
          <p className="text-xs text-slate-400 dark:text-gray-500 mb-4">
            Products where days of cover is less than supplier lead time — order soon
          </p>
          <div className="space-y-2">
            {inventory.stockout_risk.map((item, i) => {
              const cover = item.days_of_cover ?? 0;
              const lead  = item.supplier_lead_days ?? 1;
              const urgency = cover === 0 ? 'critical' : cover < lead / 2 ? 'high' : 'medium';
              return (
                <div key={i} className={`flex items-center justify-between p-3 rounded-xl ${
                  urgency === 'critical' ? 'bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/40'
                  : urgency === 'high'   ? 'bg-orange-50 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/40'
                  : 'bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40'
                }`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-gray-100 truncate">{item.product_name}</p>
                    <p className="text-xs text-slate-500 dark:text-gray-400">{item.category} · {item.current_stock} units left</p>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className={`text-sm font-bold ${urgency === 'critical' ? 'text-red-600 dark:text-red-400' : urgency === 'high' ? 'text-orange-600 dark:text-orange-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      {cover === 0 ? 'Out of cover' : `${cover.toFixed(1)}d cover`}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-gray-500">Lead: {lead}d</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Slow Moving Inventory */}
      {inventory?.slow_moving_inventory?.length > 0 && (
        <div className={`${CARD} p-5`}>
          <h3 className="font-semibold text-slate-800 dark:text-gray-100 text-sm mb-1 flex items-center gap-2">
            <TrendingDown size={14} className="text-amber-500" />
            Slow Moving Inventory
          </h3>
          <p className="text-xs text-slate-400 dark:text-gray-500 mb-4">
            Bottom 25th percentile by units sold — consider promotions or markdowns
          </p>
          <ResponsiveContainer width="100%" height={Math.max(160, inventory.slow_moving_inventory.length * 36)}>
            <BarChart
              data={[...inventory.slow_moving_inventory].sort((a, b) => (a.total_sold ?? 0) - (b.total_sold ?? 0))}
              layout="vertical"
              margin={{ top: 0, right: 12, bottom: 0, left: 0 }}
            >
              <XAxis type="number" tick={{ fontSize: 10, fill: axisColor }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="product_name" tick={{ fontSize: 10, fill: axisColor }}
                axisLine={false} tickLine={false} width={130}
                tickFormatter={v => v?.length > 18 ? v.slice(0, 16) + '…' : v} />
              <Tooltip contentStyle={tooltipStyle}
                formatter={(v) => [v + ' units', 'Total Sold']} />
              <Bar dataKey="total_sold" fill="#f59e0b" radius={[0, 4, 4, 0]} barSize={12} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Dead Stock */}
      {inventory?.dead_stock?.length > 0 && (
        <div className={`${CARD} p-5`}>
          <h3 className="font-semibold text-slate-800 dark:text-gray-100 text-sm mb-1 flex items-center gap-2">
            <Package size={14} className="text-slate-400 dark:text-gray-500" />
            Dead Stock
            <span className="ml-1 px-2 py-0.5 bg-slate-100 dark:bg-gray-800 text-slate-500 dark:text-gray-400 rounded-full text-xs font-normal">
              {inventory.dead_stock.length} products · zero sales
            </span>
          </h3>
          <p className="text-xs text-slate-400 dark:text-gray-500 mb-4">
            These products have never sold a single unit — review pricing or discontinue
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-gray-800">
                  <th className="pb-2 text-left text-xs font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wide">Product</th>
                  <th className="pb-2 text-left text-xs font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wide">Category</th>
                  <th className="pb-2 text-right text-xs font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wide">Stock</th>
                  <th className="pb-2 text-right text-xs font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wide">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-gray-800">
                {inventory.dead_stock.map((item, i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="py-2.5 font-medium text-slate-800 dark:text-gray-200">{item.product_name}</td>
                    <td className="py-2.5 text-slate-500 dark:text-gray-400">{item.category}</td>
                    <td className="py-2.5 text-right text-slate-700 dark:text-gray-300">{item.current_stock}</td>
                    <td className="py-2.5 text-right text-slate-700 dark:text-gray-300">₹{(item.stock_value || 0).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Overstock chart */}
      {inventory?.overstock?.length > 0 && (
        <div className={`${CARD} p-5`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-800 dark:text-gray-100 text-sm flex items-center gap-2">
              <Package size={14} className="text-violet-500" />
              Overstocked Items
              <span className="ml-1 text-xs font-normal text-slate-400 dark:text-gray-500">
                — {inventory.overstock.length} products with excess stock
              </span>
            </h3>
          </div>
          <ResponsiveContainer width="100%" height={Math.max(180, inventory.overstock.length * 36)}>
            <BarChart
              data={inventory.overstock.map(item => ({
                name: item.product_name.length > 20 ? item.product_name.slice(0, 18) + '…' : item.product_name,
                current_stock: item.current_stock,
                reorder_point: item.reorder_point,
              }))}
              layout="vertical"
              margin={{ top: 0, right: 12, bottom: 0, left: 0 }}
              barCategoryGap="25%"
            >
              <XAxis type="number" tick={{ fontSize: 10, fill: axisColor }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: axisColor }} axisLine={false} tickLine={false} width={130} />
              <Tooltip contentStyle={tooltipStyle}
                formatter={(v, name) => [v + ' units', name === 'current_stock' ? 'Current Stock' : 'Reorder Point']} />
              <Bar dataKey="current_stock" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={12} name="current_stock" />
              <Bar dataKey="reorder_point" fill="#e2e8f0" radius={[0, 4, 4, 0]} barSize={12} name="reorder_point" />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-5 mt-3 text-xs text-slate-400 dark:text-gray-500">
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 bg-violet-500 rounded-sm inline-block" /> Current Stock</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 bg-slate-200 dark:bg-gray-600 rounded-sm inline-block" /> Reorder Point</span>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { AlertTriangle, Package, TrendingDown, Clock } from 'lucide-react';
import { getInventoryStatus, getSalesSummary } from '../api';
import { useTheme } from '../context/ThemeContext';
import VoiceInventoryAdd from './VoiceInventoryAdd';
import OCRInventoryAdd from './OCRInventoryAdd';

const CARD = 'bg-white dark:bg-gray-900 rounded-2xl border border-slate-100 dark:border-gray-800 shadow-sm';

export default function InventoryInsights() {
  const { dark } = useTheme();
  const [inventory, setInventory] = useState(null);
  const [sales, setSales]         = useState(null);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    Promise.all([
      getInventoryStatus().catch(() => null),
      getSalesSummary().catch(() => null),
    ]).then(([i, s]) => {
      setInventory(i?.data);
      setSales(s?.data);
      setLoading(false);
    });
  }, []);

  const axisColor   = dark ? '#6b7280' : '#94a3b8';
  const tooltipStyle = dark
    ? { backgroundColor: '#1f2937', border: '1px solid #374151', color: '#f3f4f6', borderRadius: 10 }
    : { backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 10 };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-80">
        <div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <VoiceInventoryAdd onProductsAdded={() => {
  // re-fetch your inventory, e.g. call getInventoryStatus()
}} />
      <OCRInventoryAdd onProductsAdded={() => {
  // re-fetch your inventory, e.g. call getInventoryStatus()
}} />

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`${CARD} p-5`}>
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl">
              <Package size={15} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <span className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wide">Total Products</span>
          </div>
          <p className="text-2xl font-bold text-slate-800 dark:text-gray-100">{inventory?.total_products || 0}</p>
          <p className="text-xs text-slate-400 dark:text-gray-500 mt-1">
            Value: ${inventory?.total_inventory_value?.toLocaleString() || 0}
          </p>
        </div>

        <div className={`${CARD} p-5 border-amber-100 dark:border-amber-900/40`}>
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 bg-amber-50 dark:bg-amber-950/40 rounded-xl">
              <Clock size={15} className="text-amber-600 dark:text-amber-400" />
            </div>
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wide">Expiring Soon</span>
          </div>
          <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{inventory?.expiring_soon?.length || 0}</p>
          <p className="text-xs text-amber-500 dark:text-amber-500 mt-1">Within 7 days</p>
        </div>

        <div className={`${CARD} p-5 border-red-100 dark:border-red-900/40`}>
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 bg-red-50 dark:bg-red-950/40 rounded-xl">
              <AlertTriangle size={15} className="text-red-600 dark:text-red-400" />
            </div>
            <span className="text-xs font-medium text-red-600 dark:text-red-400 uppercase tracking-wide">Low Stock</span>
          </div>
          <p className="text-2xl font-bold text-red-700 dark:text-red-300">{inventory?.low_stock?.length || 0}</p>
          <p className="text-xs text-red-500 mt-1">Below reorder point</p>
        </div>
      </div>

      {/* Expiry + Low stock */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className={`${CARD} p-5`}>
          <h3 className="font-semibold text-slate-800 dark:text-gray-100 text-sm mb-4 flex items-center gap-2">
            <AlertTriangle size={14} className="text-amber-500" /> Expiring Soon
          </h3>
          {inventory?.expiring_soon?.length > 0 ? (
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
            <TrendingDown size={14} className="text-red-500" /> Low Stock Alert
          </h3>
          {inventory?.low_stock?.length > 0 ? (
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

      {/* Slow movers chart */}
      {sales?.slow_movers && (
        <div className={`${CARD} p-5`}>
          <h3 className="font-semibold text-slate-800 dark:text-gray-100 text-sm mb-4">Slowest Moving Products (90 Days)</h3>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={sales.slow_movers}>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: axisColor }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: axisColor }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="quantity" fill="#f59e0b" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Full inventory table */}
      <div className={`${CARD} p-5`}>
        <h3 className="font-semibold text-slate-800 dark:text-gray-100 text-sm mb-4">Full Inventory</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-gray-800">
                <th className="pb-3 text-left text-xs font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wide">Product</th>
                <th className="pb-3 text-left text-xs font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wide">Category</th>
                <th className="pb-3 text-right text-xs font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wide">Stock</th>
                <th className="pb-3 text-right text-xs font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wide">Price</th>
                <th className="pb-3 text-right text-xs font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wide">Expiry</th>
                <th className="pb-3 text-center text-xs font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-gray-800">
              {inventory?.all_items?.map((item, i) => (
                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="py-3 text-slate-800 dark:text-gray-200 font-medium">{item.product_name}</td>
                  <td className="py-3 text-slate-500 dark:text-gray-400">{item.category}</td>
                  <td className="py-3 text-right text-slate-800 dark:text-gray-200">{item.current_stock}</td>
                  <td className="py-3 text-right text-slate-800 dark:text-gray-200">${item.unit_price}</td>
                  <td className="py-3 text-right text-slate-500 dark:text-gray-400">
                    {item.days_to_expiry != null ? `${item.days_to_expiry}d` : '—'}
                  </td>
                  <td className="py-3 text-center">
                    {item.current_stock <= item.reorder_point ? (
                      <span className="px-2.5 py-1 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded-full text-xs font-medium">Low</span>
                    ) : item.days_to_expiry != null && item.days_to_expiry <= 7 ? (
                      <span className="px-2.5 py-1 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-full text-xs font-medium">Expiring</span>
                    ) : (
                      <span className="px-2.5 py-1 bg-green-50 dark:bg-green-950/40 text-green-600 dark:text-green-400 rounded-full text-xs font-medium">OK</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

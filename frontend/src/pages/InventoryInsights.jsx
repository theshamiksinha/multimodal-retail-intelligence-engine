import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { AlertTriangle, Package, TrendingDown, Clock } from 'lucide-react';
import { getInventoryStatus, getSalesSummary } from '../api';

export default function InventoryInsights() {
  const [inventory, setInventory] = useState(null);
  const [sales, setSales] = useState(null);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-slate-800">Inventory Insights</h2>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Package size={18} className="text-indigo-600" />
            <span className="text-sm text-slate-500">Total Products</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{inventory?.total_products || 0}</p>
          <p className="text-xs text-slate-400 mt-1">
            Value: ${inventory?.total_inventory_value?.toLocaleString() || 0}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-amber-200 p-5 bg-amber-50/30">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={18} className="text-amber-600" />
            <span className="text-sm text-amber-700">Expiring Soon</span>
          </div>
          <p className="text-2xl font-bold text-amber-800">{inventory?.expiring_soon?.length || 0}</p>
          <p className="text-xs text-amber-600 mt-1">Within 7 days</p>
        </div>
        <div className="bg-white rounded-xl border border-red-200 p-5 bg-red-50/30">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={18} className="text-red-600" />
            <span className="text-sm text-red-700">Low Stock</span>
          </div>
          <p className="text-2xl font-bold text-red-800">{inventory?.low_stock?.length || 0}</p>
          <p className="text-xs text-red-600 mt-1">Below reorder point</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Expiring Products */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-500" />
            Products Expiring Soon
          </h3>
          {inventory?.expiring_soon?.length > 0 ? (
            <div className="space-y-3">
              {inventory.expiring_soon.map((item, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-amber-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{item.product_name}</p>
                    <p className="text-xs text-slate-500">{item.category} | Stock: {item.current_stock}</p>
                  </div>
                  <div className="text-right">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      item.days_to_expiry <= 3 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {item.days_to_expiry} days left
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No products expiring soon</p>
          )}
        </div>

        {/* Low Stock */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <TrendingDown size={16} className="text-red-500" />
            Low Stock Alert
          </h3>
          {inventory?.low_stock?.length > 0 ? (
            <div className="space-y-3">
              {inventory.low_stock.map((item, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{item.product_name}</p>
                    <p className="text-xs text-slate-500">{item.category}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-red-600">{item.current_stock} units</p>
                    <p className="text-xs text-slate-400">Reorder at: {item.reorder_point}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">All products adequately stocked</p>
          )}
        </div>
      </div>

      {/* Slow Movers */}
      {sales?.slow_movers && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-800 mb-4">Slowest Moving Products (90 Days)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={sales.slow_movers}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="quantity" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Full Inventory Table */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-800 mb-4">Full Inventory</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left">
                <th className="pb-2 text-slate-500 font-medium">Product</th>
                <th className="pb-2 text-slate-500 font-medium">Category</th>
                <th className="pb-2 text-slate-500 font-medium text-right">Stock</th>
                <th className="pb-2 text-slate-500 font-medium text-right">Price</th>
                <th className="pb-2 text-slate-500 font-medium text-right">Expiry</th>
                <th className="pb-2 text-slate-500 font-medium text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {inventory?.all_items?.map((item, i) => (
                <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-2.5 text-slate-800">{item.product_name}</td>
                  <td className="py-2.5 text-slate-500">{item.category}</td>
                  <td className="py-2.5 text-right text-slate-800">{item.current_stock}</td>
                  <td className="py-2.5 text-right text-slate-800">${item.unit_price}</td>
                  <td className="py-2.5 text-right text-slate-500">
                    {item.days_to_expiry != null ? `${item.days_to_expiry}d` : '—'}
                  </td>
                  <td className="py-2.5 text-center">
                    {item.current_stock <= item.reorder_point ? (
                      <span className="px-2 py-0.5 bg-red-50 text-red-600 rounded-full text-xs">Low</span>
                    ) : item.days_to_expiry != null && item.days_to_expiry <= 7 ? (
                      <span className="px-2 py-0.5 bg-amber-50 text-amber-600 rounded-full text-xs">Expiring</span>
                    ) : (
                      <span className="px-2 py-0.5 bg-green-50 text-green-600 rounded-full text-xs">OK</span>
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

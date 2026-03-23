import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, AreaChart, Area
} from 'recharts';
import { TrendingUp, Users, DollarSign, AlertTriangle, ArrowRight } from 'lucide-react';
import { getDemoAnalytics, getSalesSummary, getInventoryStatus } from '../api';

export default function Dashboard() {
  const [analytics, setAnalytics] = useState(null);
  const [sales, setSales] = useState(null);
  const [inventory, setInventory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      getDemoAnalytics().catch(() => null),
      getSalesSummary().catch(() => null),
      getInventoryStatus().catch(() => null),
    ])
      .then(([a, s, i]) => {
        setAnalytics(a?.data || null);
        setSales(s?.data || null);
        setInventory(i?.data || null);
      })
      .catch((e) => {
        console.error('Dashboard load error:', e);
        setError(e.message);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-slate-500">Loading dashboard data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center text-red-500">
          <p>Error loading data: {error}</p>
          <p className="text-sm text-slate-400 mt-2">Make sure the backend is running on port 8000</p>
        </div>
      </div>
    );
  }

  const stats = [
    {
      label: 'Total Revenue (90d)',
      value: sales ? '$' + Number(sales.total_revenue).toLocaleString() : '--',
      icon: DollarSign,
      color: 'bg-green-50 text-green-600',
    },
    {
      label: 'Items Sold',
      value: sales ? Number(sales.total_items_sold).toLocaleString() : '--',
      icon: TrendingUp,
      color: 'bg-blue-50 text-blue-600',
    },
    {
      label: 'Customers Detected',
      value: analytics ? String(analytics.total_people) : '--',
      icon: Users,
      color: 'bg-purple-50 text-purple-600',
    },
    {
      label: 'Expiring Soon',
      value: inventory?.expiring_soon ? String(inventory.expiring_soon.length) : '--',
      icon: AlertTriangle,
      color: 'bg-amber-50 text-amber-600',
    },
  ];

  const trendData = sales?.trends ? sales.trends.slice(-30) : [];
  const topProducts = sales?.top_products || [];

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => {
          const IconComp = stat.icon;
          return (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-slate-500">{stat.label}</span>
                <div className={'p-2 rounded-lg ' + stat.color}>
                  <IconComp size={16} />
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-800">{stat.value}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Heatmap Preview */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-800">Store Heatmap Analytics</h2>
            <Link to="/analytics" className="text-indigo-600 text-sm flex items-center gap-1 hover:underline">
              View Details <ArrowRight size={14} />
            </Link>
          </div>
          {analytics?.heatmap_url ? (
            <img
              src={analytics.heatmap_url}
              alt="Store heatmap"
              className="w-full rounded-lg border border-slate-100"
            />
          ) : (
            <div className="h-64 bg-slate-50 rounded-lg flex items-center justify-center text-slate-400">
              Upload a video to see heatmap
            </div>
          )}
        </div>

        {/* Revenue Trend */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-800">Revenue Trend</h2>
            <Link to="/analytics" className="text-indigo-600 text-sm flex items-center gap-1 hover:underline">
              View Details <ArrowRight size={14} />
            </Link>
          </div>
          {trendData.length > 0 ? (
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="revenue" stroke="#6366f1" fill="url(#revGrad)" />
                  <Area type="monotone" dataKey="ma7" stroke="#f59e0b" fill="none" strokeDasharray="5 5" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 bg-slate-50 rounded-lg flex items-center justify-center text-slate-400">
              No sales data available
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Zone Insights */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-800 mb-4">Retail Insights &amp; Recommendations</h2>
          {analytics?.zones ? analytics.zones.map((zone, i) => (
            <div key={i} className="flex items-start gap-3 mb-3 p-2 rounded-lg hover:bg-slate-50">
              <div className={'w-2 h-2 mt-2 rounded-full flex-shrink-0 ' + (
                zone.level.includes('High') ? 'bg-red-400' :
                zone.level.includes('Moderate') ? 'bg-amber-400' : 'bg-blue-400'
              )} />
              <div>
                <p className="text-sm font-medium text-slate-700">{zone.name}</p>
                <p className="text-xs text-slate-500">{zone.description}</p>
              </div>
            </div>
          )) : (
            <p className="text-sm text-slate-400">No analytics data</p>
          )}
        </div>

        {/* Top Products */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-800 mb-4">Top Products</h2>
          {topProducts.length > 0 ? (
            <div style={{ width: '100%', height: 250 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topProducts} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={100} />
                  <Tooltip />
                  <Bar dataKey="revenue" fill="#6366f1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-400 text-sm">No data</div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-800 mb-4">Quick Actions</h2>
          <div className="space-y-3">
            <Link to="/marketing" className="block p-3 bg-indigo-50 rounded-lg text-sm text-indigo-700 hover:bg-indigo-100 transition-colors">
              Generate Marketing Content
            </Link>
            <Link to="/assistant" className="block p-3 bg-purple-50 rounded-lg text-sm text-purple-700 hover:bg-purple-100 transition-colors">
              Ask AI Advisor a Question
            </Link>
            <Link to="/inventory" className="block p-3 bg-amber-50 rounded-lg text-sm text-amber-700 hover:bg-amber-100 transition-colors">
              Check Inventory Alerts
            </Link>
            <Link to="/analytics" className="block p-3 bg-green-50 rounded-lg text-sm text-green-700 hover:bg-green-100 transition-colors">
              View Store Analytics
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

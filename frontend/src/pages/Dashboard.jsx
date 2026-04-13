import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { TrendingUp, DollarSign, AlertTriangle, MapPin, ArrowRight, ChevronDown, RefreshCw } from 'lucide-react';
import { getSalesSummary, getInventoryStatus, listFloorPlans, processFloorPlan, getFloorPlanStatus } from '../api';
import { useTheme } from '../context/ThemeContext';
import { SETUP_KEY } from '../components/SetupWizard';

function getStoreName() {
  try { return JSON.parse(localStorage.getItem(SETUP_KEY))?.storeName || ''; } catch { return ''; }
}

const CARD = 'bg-white dark:bg-gray-900 rounded-2xl border border-slate-100 dark:border-gray-800 shadow-sm';

export default function Dashboard() {
  const { dark } = useTheme();
  const storeName = getStoreName();
  const [sales, setSales]           = useState(null);
  const [inventory, setInventory]   = useState(null);
  const [floors, setFloors]         = useState([]);
  const [selectedFloor, setSelectedFloor] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [recalibrating, setRecalibrating] = useState(false);

  useEffect(() => {
    Promise.all([
      getSalesSummary().catch(() => null),
      getInventoryStatus().catch(() => null),
      listFloorPlans().catch(() => null),
    ])
      .then(([s, i, f]) => {
        setSales(s?.data || null);
        setInventory(i?.data || null);
        const all = f?.data?.sessions || [];
        setFloors(all);
        if (all.length > 0) setSelectedFloor(all[0]);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const recalibrate = async () => {
    if (!selectedFloor || recalibrating) return;
    setRecalibrating(true);
    try {
      await processFloorPlan(selectedFloor.session_id);
      const poll = setInterval(async () => {
        try {
          const res = await getFloorPlanStatus(selectedFloor.session_id);
          if (res.data.status === 'done' || res.data.status === 'error') {
            clearInterval(poll);
            setRecalibrating(false);
            if (res.data.status === 'done') {
              listFloorPlans().then(f => {
                const all = f?.data?.sessions || [];
                setFloors(all);
                setSelectedFloor(all.find(fl => fl.session_id === selectedFloor.session_id) || all[0] || null);
              });
            }
          }
        } catch { clearInterval(poll); setRecalibrating(false); }
      }, 3000);
    } catch { setRecalibrating(false); }
  };

  const axisColor = dark ? '#6b7280' : '#94a3b8';
  const tooltipStyle = dark
    ? { backgroundColor: '#1f2937', border: '1px solid #374151', color: '#f3f4f6', borderRadius: 10 }
    : { backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 10 };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-80">
        <div className="text-center space-y-3">
          <div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto" />
          <p className="text-sm text-slate-400 dark:text-gray-500">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-80">
        <div className="text-center space-y-1">
          <p className="text-red-500 font-medium">{error}</p>
          <p className="text-sm text-slate-400 dark:text-gray-500">Make sure the backend is running on port 8000</p>
        </div>
      </div>
    );
  }

  const stats = [
    {
      label: 'Total Revenue',
      sub: '90-day window',
      value: sales ? '$' + Number(sales.total_revenue).toLocaleString() : '—',
      icon: DollarSign,
      color: 'text-green-600 dark:text-green-400',
      bg: 'bg-green-50 dark:bg-green-950/40',
    },
    {
      label: 'Items Sold',
      sub: '90-day window',
      value: sales ? Number(sales.total_items_sold).toLocaleString() : '—',
      icon: TrendingUp,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-950/40',
    },
    {
      label: 'Floor Plans',
      sub: 'configured',
      value: String(floors.length),
      icon: MapPin,
      color: 'text-violet-600 dark:text-violet-400',
      bg: 'bg-violet-50 dark:bg-violet-950/40',
    },
    {
      label: 'Expiring Soon',
      sub: 'within 7 days',
      value: inventory?.expiring_soon ? String(inventory.expiring_soon.length) : '—',
      icon: AlertTriangle,
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-950/40',
    },
  ];

  const trendData   = sales?.trends?.slice(-30) || [];
  const topProducts = sales?.top_products || [];

  return (
    <div className="space-y-5">

      {/* ── Store greeting ── */}
      {storeName && (
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-gray-100">{storeName}</h2>
          <p className="text-xs text-slate-400 dark:text-gray-500 mt-0.5">Here's what's happening in your store</p>
        </div>
      )}

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={i} className={`${CARD} p-5`}>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wide">{s.label}</span>
                <div className={`p-2 rounded-xl ${s.bg}`}>
                  <Icon size={15} className={s.color} />
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-800 dark:text-gray-100">{s.value}</p>
              <p className="text-xs text-slate-400 dark:text-gray-500 mt-1">{s.sub}</p>
            </div>
          );
        })}
      </div>

      {/* ── Heatmap + Revenue trend ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Heatmap */}
        <div className={`${CARD} p-5`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-800 dark:text-gray-100 text-sm">Store Heatmap</h2>
            <div className="flex items-center gap-2">
              {floors.length > 1 && (
                <div className="relative">
                  <select
                    value={selectedFloor?.session_id || ''}
                    onChange={e => setSelectedFloor(floors.find(f => f.session_id === e.target.value))}
                    className="pl-3 pr-7 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-gray-700
                      bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-300
                      focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none"
                  >
                    {floors.map(f => <option key={f.session_id} value={f.session_id}>{f.floor_name}</option>)}
                  </select>
                  <ChevronDown size={11} className="absolute right-2 top-2 text-slate-400 pointer-events-none" />
                </div>
              )}
              {selectedFloor?.status === 'done' && (
                <button
                  onClick={recalibrate}
                  disabled={recalibrating}
                  className="flex items-center gap-1 text-xs text-slate-500 dark:text-gray-400 hover:text-indigo-600 px-2 py-1.5 border border-slate-200 dark:border-gray-700 rounded-lg hover:bg-slate-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
                >
                  <RefreshCw size={11} className={recalibrating ? 'animate-spin' : ''} />
                  {recalibrating ? 'Running…' : 'Recalibrate'}
                </button>
              )}
              <Link to="/analytics" className="flex items-center gap-1 text-xs text-indigo-600 hover:underline">
                Details <ArrowRight size={11} />
              </Link>
            </div>
          </div>

          {floors.length === 0 ? (
            <div className="h-56 rounded-xl border-2 border-dashed border-slate-200 dark:border-gray-700 flex flex-col items-center justify-center gap-2">
              <MapPin size={24} className="text-slate-300 dark:text-gray-600" />
              <p className="text-sm font-medium text-slate-500 dark:text-gray-400">No floor plans yet</p>
              <Link to="/analytics" className="text-xs text-indigo-500 hover:underline">Set one up in Store Analytics →</Link>
            </div>
          ) : recalibrating || selectedFloor?.status === 'processing' ? (
            <div className="h-56 bg-slate-50 dark:bg-gray-800 rounded-xl flex flex-col items-center justify-center gap-2">
              <div className="animate-spin h-6 w-6 border-[3px] border-indigo-500 border-t-transparent rounded-full" />
              <p className="text-sm text-slate-500 dark:text-gray-400">Running CV pipeline…</p>
            </div>
          ) : selectedFloor?.heatmap_url ? (
            <img src={selectedFloor.heatmap_url} alt="Heatmap" className="w-full rounded-xl" />
          ) : selectedFloor?.floor_plan_url ? (
            <div className="relative">
              <img src={selectedFloor.floor_plan_url} alt="Floor plan" className="w-full rounded-xl opacity-60" />
              <div className="absolute inset-0 flex items-center justify-center">
                {selectedFloor.cameras?.some(c => c.has_video) ? (
                  <button
                    onClick={recalibrate}
                    disabled={recalibrating}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-medium shadow-lg hover:bg-indigo-700 disabled:opacity-60"
                  >
                    <RefreshCw size={13} className={recalibrating ? 'animate-spin' : ''} />
                    Generate Heatmap
                  </button>
                ) : (
                  <Link to="/analytics" className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-medium shadow-lg hover:bg-indigo-700">
                    Upload footage & generate heatmap
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <div className="h-56 bg-slate-50 dark:bg-gray-800 rounded-xl flex items-center justify-center text-slate-400 dark:text-gray-500 text-sm">
              No image available
            </div>
          )}
        </div>

        {/* Revenue trend */}
        <div className={`${CARD} p-5`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-800 dark:text-gray-100 text-sm">Revenue Trend <span className="text-slate-400 dark:text-gray-500 font-normal">(last 30 days)</span></h2>
            <Link to="/analytics" className="flex items-center gap-1 text-xs text-indigo-600 hover:underline">
              Details <ArrowRight size={11} />
            </Link>
          </div>
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: axisColor }} tickFormatter={d => d.slice(5)} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: axisColor }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2} fill="url(#revGrad)" dot={false} />
                <Area type="monotone" dataKey="ma7" stroke="#f59e0b" strokeWidth={1.5} fill="none" strokeDasharray="5 5" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-56 bg-slate-50 dark:bg-gray-800 rounded-xl flex items-center justify-center text-slate-400 dark:text-gray-500 text-sm">
              No sales data — upload your POS data in Inventory Insights
            </div>
          )}
        </div>
      </div>

      {/* ── Zone highlights + Top products ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Zone highlights */}
        <div className={`${CARD} p-5`}>
          <h2 className="font-semibold text-slate-800 dark:text-gray-100 text-sm mb-4">
            Zone Highlights
            {selectedFloor && <span className="text-xs text-slate-400 dark:text-gray-500 font-normal ml-1.5">— {selectedFloor.floor_name}</span>}
          </h2>
          {selectedFloor?.zones?.length > 0 ? (
            <div className="space-y-2">
              {selectedFloor.zones.slice(0, 4).map((zone, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-gray-800">
                  <div className={'w-2 h-2 rounded-full shrink-0 ' + (
                    zone.level.includes('High') ? 'bg-red-400' :
                    zone.level.includes('Moderate') ? 'bg-amber-400' : 'bg-blue-400'
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 dark:text-gray-200">{zone.name}</p>
                    <p className="text-xs text-slate-400 dark:text-gray-500 truncate">{zone.level}</p>
                  </div>
                  <span className="text-xs font-mono text-slate-400 dark:text-gray-500 shrink-0">{zone.density_score}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-10 text-center">
              <p className="text-sm text-slate-400 dark:text-gray-500">
                {floors.length === 0 ? 'Configure cameras to see zone insights' : 'No zone data for this floor'}
              </p>
            </div>
          )}
        </div>

        {/* Top products */}
        <div className={`${CARD} p-5`}>
          <h2 className="font-semibold text-slate-800 dark:text-gray-100 text-sm mb-4">Top Products</h2>
          {topProducts.length > 0 ? (
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={topProducts} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 10, fill: axisColor }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: axisColor }} width={95} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="revenue" fill="#6366f1" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-52 flex items-center justify-center text-slate-400 dark:text-gray-500 text-sm">
              No sales data available
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

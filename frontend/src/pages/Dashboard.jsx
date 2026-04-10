import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { TrendingUp, DollarSign, AlertTriangle, MapPin, ArrowRight, ChevronDown, RefreshCw } from 'lucide-react';
import { getSalesSummary, getInventoryStatus, listFloorPlans, processFloorPlan, getFloorPlanStatus } from '../api';

export default function Dashboard() {
  const [sales, setSales] = useState(null);
  const [inventory, setInventory] = useState(null);
  const [floors, setFloors] = useState([]);
  const [selectedFloor, setSelectedFloor] = useState(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
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
        const allFloors = f?.data?.sessions || [];
        setFloors(allFloors);
        if (allFloors.length > 0) setSelectedFloor(allFloors[0]);
      })
      .catch((e) => setError(e.message))
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
              // Refresh floor data to get updated heatmap
              listFloorPlans().then((f) => {
                const all = f?.data?.sessions || [];
                setFloors(all);
                setSelectedFloor(all.find((fl) => fl.session_id === selectedFloor.session_id) || all[0] || null);
              });
            }
          }
        } catch (e) {
          clearInterval(poll);
          setRecalibrating(false);
        }
      }, 3000);
    } catch (e) {
      setRecalibrating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-slate-500">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center text-red-500">
          <p>Error: {error}</p>
          <p className="text-sm text-slate-400 mt-1">Make sure the backend is running on port 8000</p>
        </div>
      </div>
    );
  }

  const stats = [
    {
      label: 'Total Revenue (90d)',
      value: sales ? '$' + Number(sales.total_revenue).toLocaleString() : '--',
      icon: DollarSign, color: 'bg-green-50 text-green-600',
    },
    {
      label: 'Items Sold',
      value: sales ? Number(sales.total_items_sold).toLocaleString() : '--',
      icon: TrendingUp, color: 'bg-blue-50 text-blue-600',
    },
    {
      label: 'Floor Plans',
      value: String(floors.length),
      icon: MapPin, color: 'bg-purple-50 text-purple-600',
    },
    {
      label: 'Expiring Soon',
      value: inventory?.expiring_soon ? String(inventory.expiring_soon.length) : '--',
      icon: AlertTriangle, color: 'bg-amber-50 text-amber-600',
    },
  ];

  const trendData = sales?.trends ? sales.trends.slice(-30) : [];
  const topProducts = sales?.top_products || [];

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => {
          const IconComp = stat.icon;
          return (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-slate-500">{stat.label}</span>
                <div className={'p-2 rounded-lg ' + stat.color}><IconComp size={16} /></div>
              </div>
              <p className="text-2xl font-bold text-slate-800">{stat.value}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Heatmap panel */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-800">Store Heatmap</h2>
            <div className="flex items-center gap-2">
              {/* Floor selector dropdown */}
              {floors.length > 1 && (
                <div className="relative">
                  <select
                    value={selectedFloor?.session_id || ''}
                    onChange={(e) => setSelectedFloor(floors.find((f) => f.session_id === e.target.value))}
                    className="pl-3 pr-8 py-1.5 border border-slate-200 rounded-lg text-xs appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    {floors.map((f) => (
                      <option key={f.session_id} value={f.session_id}>{f.floor_name}</option>
                    ))}
                  </select>
                  <ChevronDown size={12} className="absolute right-2 top-2 text-slate-400 pointer-events-none" />
                </div>
              )}
              {floors.length === 1 && (
                <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
                  {floors[0].floor_name}
                </span>
              )}
              {selectedFloor?.status === 'done' && (
                <button
                  onClick={recalibrate}
                  disabled={recalibrating}
                  title="Re-run CV pipeline with current footage"
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-600 px-2 py-1 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  <RefreshCw size={11} className={recalibrating ? 'animate-spin' : ''} />
                  {recalibrating ? 'Running…' : 'Recalibrate'}
                </button>
              )}
              <Link to="/analytics" className="text-indigo-600 text-xs flex items-center gap-1 hover:underline">
                Details <ArrowRight size={12} />
              </Link>
            </div>
          </div>

          {floors.length === 0 ? (
            <div className="h-64 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-2 text-slate-400">
              <MapPin size={28} />
              <p className="text-sm font-medium text-slate-500">No floor plans yet</p>
              <p className="text-xs text-center">Go to <Link to="/analytics" className="text-indigo-500 hover:underline">Store Analytics</Link> to upload your floor plan and configure cameras</p>
            </div>
          ) : recalibrating || selectedFloor?.status === 'processing' ? (
            <div className="h-64 bg-slate-50 rounded-lg flex flex-col items-center justify-center gap-2 text-slate-400">
              <div className="animate-spin h-6 w-6 border-3 border-indigo-500 border-t-transparent rounded-full" />
              <p className="text-sm">Running CV pipeline…</p>
            </div>
          ) : selectedFloor?.heatmap_url ? (
            <img src={selectedFloor.heatmap_url} alt="Heatmap" className="w-full rounded-lg" />
          ) : selectedFloor?.floor_plan_url ? (
            <div className="relative">
              <img src={selectedFloor.floor_plan_url} alt="Floor plan" className="w-full rounded-lg opacity-70" />
              <div className="absolute inset-0 flex items-center justify-center">
                {selectedFloor.cameras?.some((c) => c.has_video) ? (
                  <button
                    onClick={recalibrate}
                    disabled={recalibrating}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-medium shadow-lg hover:bg-indigo-700 disabled:opacity-60"
                  >
                    <RefreshCw size={13} className={recalibrating ? 'animate-spin' : ''} />
                    {recalibrating ? 'Running…' : 'Generate Heatmap'}
                  </button>
                ) : (
                  <Link
                    to="/analytics"
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-medium shadow-lg hover:bg-indigo-700"
                  >
                    Upload footage &amp; generate heatmap
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <div className="h-64 bg-slate-50 rounded-lg flex items-center justify-center text-slate-400 text-sm">
              No image available
            </div>
          )}
        </div>

        {/* Revenue trend */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-800">Revenue Trend</h2>
            <Link to="/analytics" className="text-indigo-600 text-xs flex items-center gap-1 hover:underline">
              Details <ArrowRight size={12} />
            </Link>
          </div>
          {trendData.length > 0 ? (
            <div style={{ height: 240 }}>
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
            <div className="h-64 bg-slate-50 rounded-lg flex items-center justify-center text-slate-400 text-sm">
              No sales data — upload your POS data in Inventory Insights
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Zone highlights (from selected floor) */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-800 mb-4">
            Zone Highlights
            {selectedFloor && <span className="text-xs text-slate-400 font-normal ml-1">— {selectedFloor.floor_name}</span>}
          </h2>
          {selectedFloor?.zones?.length > 0 ? selectedFloor.zones.slice(0, 4).map((zone, i) => (
            <div key={i} className="flex items-start gap-3 mb-3 p-2 rounded-lg hover:bg-slate-50">
              <div className={'w-2 h-2 mt-1.5 rounded-full flex-shrink-0 ' + (
                zone.level.includes('High') ? 'bg-red-400' :
                zone.level.includes('Moderate') ? 'bg-amber-400' : 'bg-blue-400'
              )} />
              <div>
                <p className="text-sm font-medium text-slate-700">{zone.name}</p>
                <p className="text-xs text-slate-400">{zone.level}</p>
              </div>
            </div>
          )) : (
            <div className="py-8 text-center text-slate-400 text-sm">
              {floors.length === 0
                ? 'Configure cameras to see zone insights'
                : 'No zone data for this floor'}
            </div>
          )}
        </div>

        {/* Top products */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-800 mb-4">Top Products</h2>
          {topProducts.length > 0 ? (
            <div style={{ height: 230 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topProducts} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 9 }} width={90} />
                  <Tooltip />
                  <Bar dataKey="revenue" fill="#6366f1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-56 flex items-center justify-center text-slate-400 text-sm">
              No sales data available
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-800 mb-4">Quick Actions</h2>
          <div className="space-y-3">
            <Link to="/analytics" className="block p-3 bg-indigo-50 rounded-lg text-sm text-indigo-700 hover:bg-indigo-100 transition-colors">
              Configure Floor Plans & Cameras
            </Link>
            <Link to="/marketing" className="block p-3 bg-purple-50 rounded-lg text-sm text-purple-700 hover:bg-purple-100 transition-colors">
              Generate Marketing Content
            </Link>
            <Link to="/assistant" className="block p-3 bg-green-50 rounded-lg text-sm text-green-700 hover:bg-green-100 transition-colors">
              Ask AI Advisor
            </Link>
            <Link to="/inventory" className="block p-3 bg-amber-50 rounded-lg text-sm text-amber-700 hover:bg-amber-100 transition-colors">
              Check Inventory Alerts
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

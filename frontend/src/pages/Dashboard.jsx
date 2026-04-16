import { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  TrendingUp, TrendingDown, AlertTriangle, MapPin, ArrowRight,
  ChevronDown, ChevronLeft, ChevronRight, RefreshCw, Wind, Package, Clock, Users,
  Zap, Calendar,
} from 'lucide-react';
import {
  getSalesSummary, getInventoryStatus, listFloorPlans,
  processFloorPlan, getFloorPlanStatus, getFloorPlanTrajectories,
} from '../api';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from 'react-i18next';
import { SETUP_KEY } from '../components/SetupWizard';

function getSetupData() {
  try { return JSON.parse(localStorage.getItem(SETUP_KEY)) || {}; } catch { return {}; }
}

const CARD = 'bg-white dark:bg-gray-900 rounded-2xl border border-blue-50 dark:border-gray-800 shadow-sm card-hover';

/* ── Gradient button ────────────────────────────────────────────────────── */
function GradBtn({ to, onClick, gradient, children, size = 'sm', className = '' }) {
  const cls = `inline-flex items-center justify-center gap-1.5 font-semibold rounded-xl
    transition-all active:scale-[0.97] shrink-0
    ${size === 'xs' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-xs'}
    bg-gradient-to-r ${gradient} text-white shadow-sm hover:shadow-md hover:brightness-105 ${className}`;
  if (to) return <Link to={to} className={cls}>{children}</Link>;
  return <button onClick={onClick} className={cls}>{children}</button>;
}

/* ── Period filter ──────────────────────────────────────────────────────── */
const PERIODS = [
  { key: 'daily',   label: 'Daily',   days: 7  },
  { key: 'weekly',  label: 'Weekly',  days: 28 },
  { key: 'monthly', label: 'Monthly', days: 90 },
];

function PeriodFilter({ period, onChange, light = false }) {
  return (
    <div className={`flex gap-1.5 p-1 rounded-xl ${light ? 'bg-white/20' : 'bg-slate-100 dark:bg-gray-800'}`}>
      {PERIODS.map(p => (
        <button
          key={p.key}
          onClick={() => onChange(p.key)}
          className={`period-pill px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            period === p.key
              ? light
                ? 'bg-white text-blue-700 shadow-sm'
                : 'bg-white dark:bg-gray-700 text-blue-700 dark:text-blue-300 shadow-sm'
              : light
                ? 'text-white/80 hover:text-white hover:bg-white/20'
                : 'text-slate-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400'
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { dark } = useTheme();
  const { t }    = useTranslation();
  const { storeName = '', userName = '' } = getSetupData();

  const [sales, setSales]                 = useState(null);
  const [inventory, setInventory]         = useState(null);
  const [floors, setFloors]               = useState([]);
  const [selectedFloor, setSelectedFloor] = useState(null);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(null);
  const [recalibrating, setRecalibrating] = useState(false);
  const [trajectories, setTrajectories]   = useState(null);
  const [showHeatmap, setShowHeatmap]     = useState(true);
  const [showFlow, setShowFlow]           = useState(true);
  const [period, setPeriod]               = useState('monthly');
  const [offset, setOffset]               = useState(0); // 0 = most recent, 1 = one period back, …

  useEffect(() => {
    Promise.all([
      getSalesSummary().catch(() => null),
      getInventoryStatus().catch(() => null),
      listFloorPlans().catch(() => null),
    ]).then(([s, i, f]) => {
      setSales(s?.data?.no_data ? null : s?.data || null);
      setInventory(i?.data?.no_data ? null : i?.data || null);
      const all = f?.data?.sessions || [];
      setFloors(all);
      if (all.length > 0) setSelectedFloor(all[0]);
    }).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedFloor?.session_id || selectedFloor.status !== 'done') return;
    setTrajectories(null);
    getFloorPlanTrajectories(selectedFloor.session_id)
      .then(r => setTrajectories(r.data)).catch(() => setTrajectories(null));
  }, [selectedFloor?.session_id]);

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

  /* ── Derived ────────────────────────────────────────────────────────── */
  const periodDays = useMemo(() => {
    const p = PERIODS.find(p => p.key === period);
    return p ? p.days : 90;
  }, [period]);

  const maxOffset = useMemo(() => {
    const total = sales?.trends?.length || 0;
    return Math.max(0, Math.ceil(total / periodDays) - 1);
  }, [sales, periodDays]);

  const filteredTrends = useMemo(() => {
    const trends = sales?.trends || [];
    if (offset === 0) return trends.slice(-periodDays);
    const end   = trends.length - offset * periodDays;
    const start = Math.max(0, end - periodDays);
    return end > 0 ? trends.slice(start, end) : [];
  }, [sales, periodDays, offset]);

  const periodLabel = useMemo(() => {
    if (!filteredTrends.length) return '';
    const fmt = d => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    return `${fmt(filteredTrends[0].date)} – ${fmt(filteredTrends[filteredTrends.length - 1].date)}`;
  }, [filteredTrends]);

  const periodRevenue = useMemo(() =>
    filteredTrends.reduce((s, d) => s + (d.revenue || 0), 0), [filteredTrends]);

  const revenueChange = useMemo(() => {
    // Compare this period to the one immediately before it
    const trends = sales?.trends || [];
    if (trends.length < periodDays * 2) return null;
    const curEnd   = trends.length - offset * periodDays;
    const curStart = Math.max(0, curEnd - periodDays);
    const prevEnd  = curStart;
    const prevStart = Math.max(0, prevEnd - periodDays);
    if (prevEnd <= prevStart) return null;
    const cur  = trends.slice(curStart, curEnd).reduce((s, d) => s + (d.revenue || 0), 0);
    const prev = trends.slice(prevStart, prevEnd).reduce((s, d) => s + (d.revenue || 0), 0);
    if (!prev) return null;
    return Math.round(((cur - prev) / prev) * 100);
  }, [sales, periodDays, offset]);

  const lowStockItems = useMemo(() =>
    inventory?.low_stock || inventory?.items?.filter(i => i.status === 'Low') || [], [inventory]);

  const topProduct    = sales?.top_products?.[0];
  const expiringCount = inventory?.expiring_soon?.length || 0;

  /* ── Footfall estimate ─────────────────────────────────────────────── */
  const footfallData = useMemo(() => {
    const avg = (sales?.total_revenue && sales?.total_items_sold)
      ? sales.total_revenue / sales.total_items_sold
      : 80;
    return filteredTrends.map(d => ({
      date:     d.date,
      visitors: Math.max(0, Math.round((d.revenue || 0) / avg)),
    }));
  }, [filteredTrends, sales]);

  const totalVisitors = footfallData.reduce((s, d) => s + d.visitors, 0);
  const detectedPeople = selectedFloor?.total_people ?? null;

  /* ── Greeting ──────────────────────────────────────────────────────── */
  const hour = new Date().getHours();
  const greetingWord  = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const greetingEmoji = hour < 12 ? '☀️' : hour < 17 ? '🌤️' : '🌙';

  /* ── Chart styles ─────────────────────────────────────────────────── */
  const axisColor    = dark ? '#6b7280' : '#94a3b8';
  const tooltipStyle = dark
    ? { backgroundColor: '#1f2937', border: '1px solid #374151', color: '#f3f4f6', borderRadius: 10, fontSize: 11 }
    : { backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 11 };

  /* ── Loading / Error ──────────────────────────────────────────────── */
  if (loading) return (
    <div className="flex items-center justify-center h-80">
      <div className="text-center space-y-3">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto" />
        <p className="text-sm text-slate-400 dark:text-gray-500">Loading dashboard…</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="flex items-center justify-center h-80">
      <div className="text-center space-y-1">
        <p className="text-red-500 font-medium">{error}</p>
        <p className="text-sm text-slate-400 dark:text-gray-500">Make sure the backend is running on port 8000</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">

      {/* ══ HERO SECTION ══════════════════════════════════════════════════ */}
      <div className="relative overflow-hidden rounded-3xl animate-fade-in-up"
        style={{
          background: 'linear-gradient(135deg, #1D4ED8 0%, #2563EB 45%, #1E40AF 100%)',
        }}>
        {/* Decorative blobs */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-16 -right-16 w-72 h-72 rounded-full bg-orange-400/20 blur-3xl animate-float" />
          <div className="absolute bottom-0 left-1/4 w-56 h-56 rounded-full bg-blue-300/15 blur-2xl animate-float delay-300" />
          <div className="absolute top-1/2 right-1/3 w-32 h-32 rounded-full bg-orange-300/10 blur-xl" />
          {/* Grid dot pattern */}
          <div className="absolute inset-0 opacity-[0.04]"
            style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
        </div>

        <div className="relative px-7 py-6">
          {/* Top row: greeting + period filter */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
            <div className="animate-fade-in-up delay-100">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-orange-300 text-sm font-semibold">{greetingWord}</span>
                <span className="text-base">{greetingEmoji}</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight leading-tight">
                Hi, {userName || storeName || 'there'}!
              </h1>
              <p className="text-blue-200 text-sm mt-1 font-medium">
                {storeName
                  ? `Here's what's been happening at ${storeName} lately!`
                  : "Here's what's happening in your store"}
              </p>
            </div>
            <div className="animate-fade-in-up delay-200 shrink-0 flex flex-col items-end gap-2">
              <PeriodFilter period={period} onChange={p => { setPeriod(p); setOffset(0); }} light />
              {/* Period navigator */}
              {sales?.trends?.length > 0 && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setOffset(o => Math.min(o + 1, maxOffset))}
                    disabled={offset >= maxOffset}
                    className="w-6 h-6 rounded-lg bg-white/15 hover:bg-white/25 disabled:opacity-30
                      flex items-center justify-center text-white transition-all disabled:cursor-not-allowed"
                    title="Previous period"
                  >
                    <ChevronLeft size={13} />
                  </button>
                  <span className="text-[11px] font-medium text-blue-200 px-2 min-w-[130px] text-center tabular-nums">
                    {periodLabel}
                  </span>
                  <button
                    onClick={() => setOffset(o => Math.max(o - 1, 0))}
                    disabled={offset === 0}
                    className="w-6 h-6 rounded-lg bg-white/15 hover:bg-white/25 disabled:opacity-30
                      flex items-center justify-center text-white transition-all disabled:cursor-not-allowed"
                    title="Next period"
                  >
                    <ChevronRight size={13} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              {
                label: 'Revenue',
                value: `₹${Math.round(periodRevenue).toLocaleString('en-IN')}`,
                sub: revenueChange !== null
                  ? `${revenueChange >= 0 ? '↑' : '↓'} ${Math.abs(revenueChange)}% vs prev`
                  : 'this period',
                subColor: revenueChange !== null
                  ? (revenueChange >= 0 ? 'text-orange-300' : 'text-red-300')
                  : 'text-blue-300',
                delay: 'delay-200',
              },
              {
                label: t('dashboard.itemsSold', 'Items Sold'),
                value: Number(sales?.total_items_sold || 0).toLocaleString('en-IN'),
                sub: 'transactions',
                subColor: 'text-blue-300',
                delay: 'delay-300',
              },
              {
                label: t('dashboard.lowStock', 'Low Stock'),
                value: String(lowStockItems.length),
                sub: lowStockItems.length > 0 ? 'need reorder' : 'all good',
                subColor: lowStockItems.length > 0 ? 'text-orange-300' : 'text-green-300',
                delay: 'delay-400',
              },
              {
                label: t('dashboard.expiring', 'Expiring Soon'),
                value: String(expiringCount),
                sub: 'within 7 days',
                subColor: expiringCount > 0 ? 'text-rose-300' : 'text-blue-300',
                delay: 'delay-500',
              },
            ].map((kpi, i) => (
              <div key={i}
                className={`bg-white/15 backdrop-blur-sm rounded-2xl p-4 border border-white/10
                  hover:bg-white/20 transition-all cursor-default animate-fade-in-up ${kpi.delay}`}>
                <p className="text-blue-200 text-xs font-medium mb-1.5">{kpi.label}</p>
                <p className="text-white text-xl font-bold tracking-tight leading-none mb-1">{kpi.value}</p>
                <p className={`text-xs font-medium ${kpi.subColor}`}>{kpi.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ══ ALERT BANNERS ════════════════════════════════════════════════ */}
      {(lowStockItems.length > 0 || (revenueChange !== null && revenueChange < -5) || topProduct) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 animate-fade-in-up delay-300">

          {lowStockItems.length > 0 && (
            <div className="flex items-center gap-3 bg-amber-50 dark:bg-amber-950/30
              border border-amber-200 dark:border-amber-800/50 rounded-2xl px-4 py-3">
              <div className="w-7 h-7 bg-amber-100 dark:bg-amber-900/50 rounded-xl flex items-center justify-center shrink-0">
                <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400" />
              </div>
              <p className="text-xs text-amber-800 dark:text-amber-200 flex-1 leading-snug font-medium">
                {lowStockItems.length} {lowStockItems.length === 1 ? 'product' : 'products'} low on stock
              </p>
              <GradBtn to="/inventory" gradient="from-amber-500 to-orange-500" size="xs">Reorder</GradBtn>
            </div>
          )}

          {revenueChange !== null && revenueChange < -5 && (
            <div className="flex items-center gap-3 bg-red-50 dark:bg-red-950/30
              border border-red-200 dark:border-red-800/50 rounded-2xl px-4 py-3">
              <div className="w-7 h-7 bg-red-100 dark:bg-red-900/50 rounded-xl flex items-center justify-center shrink-0">
                <TrendingDown size={14} className="text-red-500 dark:text-red-400" />
              </div>
              <p className="text-xs text-red-800 dark:text-red-200 flex-1 leading-snug font-medium">
                Revenue dropped {Math.abs(revenueChange)}% this period
              </p>
              <GradBtn to="/analytics" gradient="from-red-500 to-rose-600" size="xs">Analyse</GradBtn>
            </div>
          )}

          {topProduct && (
            <div className="flex items-center gap-3 bg-blue-50 dark:bg-blue-950/30
              border border-blue-200 dark:border-blue-800/50 rounded-2xl px-4 py-3">
              <div className="w-7 h-7 bg-blue-100 dark:bg-blue-900/50 rounded-xl flex items-center justify-center shrink-0">
                <Zap size={14} className="text-blue-600 dark:text-blue-400" />
              </div>
              <p className="text-xs text-blue-800 dark:text-blue-200 flex-1 leading-snug font-medium truncate">
                {topProduct.name} is trending
              </p>
              <GradBtn to="/inventory" gradient="from-blue-600 to-blue-700" size="xs">Stock Up</GradBtn>
            </div>
          )}
        </div>
      )}

      {/* ══ MAIN 3-COLUMN GRID ══════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── LEFT (2-col): Revenue Chart + Heatmap ── */}
        <div className="lg:col-span-2 flex flex-col gap-5">

          {/* ── Revenue Trend Chart ── */}
          <div className={`${CARD} p-5 animate-fade-in-up delay-200`}>
            <div className="flex items-center justify-between mb-1">
              <div>
                <h2 className="font-bold text-slate-800 dark:text-gray-100 text-sm flex items-center gap-2">
                  <div className="w-5 h-5 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center">
                    <TrendingUp size={11} className="text-white" />
                  </div>
                  {t('dashboard.revenueTrend', 'Revenue Trend')}
                </h2>
                <p className="text-xs text-slate-400 dark:text-gray-500 mt-0.5 ml-7">
                  {period === 'daily' ? 'Last 7 days' : period === 'weekly' ? 'Last 4 weeks' : 'Last 90 days'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {revenueChange !== null && (
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-xl ${
                    revenueChange >= 0
                      ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                      : 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300'
                  }`}>
                    {revenueChange >= 0 ? '+' : ''}{revenueChange}%
                  </span>
                )}
                <Link to="/analytics"
                  className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-medium hover:underline">
                  Details <ArrowRight size={11} />
                </Link>
              </div>
            </div>

            {/* Big revenue number */}
            <p className="text-3xl font-bold text-slate-800 dark:text-gray-100 tracking-tight ml-7 mb-4 animate-count-reveal delay-300">
              ₹{Math.round(periodRevenue).toLocaleString('en-IN')}
            </p>

            {filteredTrends.length > 0 ? (
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={filteredTrends} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#2563EB" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: axisColor }} tickLine={false}
                    tickFormatter={v => v ? v.slice(5) : ''} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: axisColor }} tickLine={false} axisLine={false}
                    tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={tooltipStyle}
                    formatter={v => [`₹${Number(v).toLocaleString('en-IN')}`, 'Revenue']} />
                  <Area type="monotone" dataKey="revenue" stroke="#2563EB" strokeWidth={2.5}
                    fill="url(#revGrad)" dot={false} activeDot={{ r: 4, fill: '#2563EB', strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-40 flex items-center justify-center">
                <p className="text-sm text-slate-400 dark:text-gray-500">No trend data yet</p>
              </div>
            )}
          </div>

          {/* ── Store Activity Heatmap ── */}
          <div className={`${CARD} p-5 animate-fade-in-up delay-300`}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-slate-800 dark:text-gray-100 text-sm flex items-center gap-2">
                <div className="w-5 h-5 bg-gradient-to-br from-orange-400 to-orange-600 rounded-lg flex items-center justify-center">
                  <Wind size={11} className="text-white" />
                </div>
                {t('dashboard.activityMap', 'Store Activity Heatmap')}
              </h2>
              <div className="flex items-center gap-2">
                {floors.length > 1 && (
                  <div className="relative">
                    <select
                      value={selectedFloor?.session_id || ''}
                      onChange={e => setSelectedFloor(floors.find(f => f.session_id === e.target.value))}
                      className="pl-3 pr-7 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-gray-700
                        bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-300
                        focus:outline-none appearance-none focus:border-blue-400"
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
                    className="flex items-center gap-1 text-xs text-slate-500 dark:text-gray-400 hover:text-blue-600
                      px-2.5 py-1.5 border border-slate-200 dark:border-gray-700 rounded-lg
                      hover:bg-blue-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-all"
                  >
                    <RefreshCw size={11} className={recalibrating ? 'animate-spin' : ''} />
                    {recalibrating ? t('dashboard.running', 'Running…') : t('dashboard.recalibrate', 'Recalibrate')}
                  </button>
                )}
                <Link to="/analytics"
                  className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-medium hover:underline">
                  View Details <ArrowRight size={11} />
                </Link>
              </div>
            </div>

            {/* Layer toggles */}
            {selectedFloor?.status === 'done' && (
              <div className="flex items-center gap-4 mb-3">
                {[
                  { label: t('dashboard.heatmap', 'Heatmap'),      checked: showHeatmap, set: setShowHeatmap, color: '#F97316' },
                  { label: t('dashboard.trafficFlow', 'Traffic Flow'), checked: showFlow, set: setShowFlow,   color: '#2563EB' },
                ].map(l => (
                  <label key={l.label} className="flex items-center gap-1.5 cursor-pointer select-none group">
                    <span
                      className={`w-4 h-4 rounded flex items-center justify-center border transition-all group-hover:scale-110 ${
                        l.checked ? 'border-transparent' : 'border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-800'
                      }`}
                      style={l.checked ? { background: l.color } : {}}
                      onClick={() => l.set(p => !p)}
                    >
                      {l.checked && (
                        <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                          <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-gray-400" onClick={() => l.set(p => !p)}>{l.label}</span>
                  </label>
                ))}
              </div>
            )}

            {floors.length === 0 ? (
              <div className="h-52 rounded-xl border-2 border-dashed border-blue-100 dark:border-gray-700
                flex flex-col items-center justify-center gap-2">
                <MapPin size={24} className="text-blue-200 dark:text-gray-600" />
                <p className="text-sm font-medium text-slate-500 dark:text-gray-400">
                  {t('dashboard.noFloorPlans', 'No floor plans yet')}
                </p>
                <Link to="/analytics" className="text-xs text-blue-500 hover:underline font-medium">
                  {t('dashboard.setupFloor', 'Set one up in Store Analytics →')}
                </Link>
              </div>
            ) : recalibrating || selectedFloor?.status === 'processing' ? (
              <div className="h-52 bg-blue-50 dark:bg-gray-800 rounded-xl flex flex-col items-center justify-center gap-2">
                <div className="animate-spin h-6 w-6 border-[3px] border-blue-500 border-t-transparent rounded-full" />
                <p className="text-sm text-slate-500 dark:text-gray-400">
                  {t('dashboard.runningCv', 'Running CV pipeline…')}
                </p>
              </div>
            ) : (
              <TrafficFlowCanvas
                floorPlanUrl={selectedFloor?.floor_plan_url}
                heatmapUrl={selectedFloor?.heatmap_url}
                trajectories={trajectories}
                showHeatmap={showHeatmap}
                showFlow={showFlow}
              />
            )}

            {selectedFloor && !selectedFloor.heatmap_url && selectedFloor.status !== 'processing' && (
              <p className="text-xs text-slate-400 dark:text-gray-500 text-center mt-2">
                {selectedFloor.cameras?.some(c => c.has_video)
                  ? <button onClick={recalibrate} className="text-blue-500 hover:underline font-medium">Generate Heatmap</button>
                  : <Link to="/analytics" className="text-blue-500 hover:underline font-medium">Upload footage & generate heatmap →</Link>
                }
              </p>
            )}
          </div>

          {/* ── Zone Insights ── */}
          {selectedFloor?.zones?.length > 0 && (
            <div className={`${CARD} p-5 animate-fade-in-up delay-400`}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-slate-800 dark:text-gray-100 text-sm">
                  {t('dashboard.zones', 'Zone Insights')}
                  <span className="ml-1.5 text-xs text-slate-400 font-normal">— {selectedFloor.floor_name}</span>
                </h2>
                <Link to="/analytics" className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-medium hover:underline">
                  View All <ArrowRight size={11} />
                </Link>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {selectedFloor.zones.slice(0, 3).map((zone, i) => {
                  const isHigh = zone.level?.includes('High');
                  const isMod  = zone.level?.includes('Moderate') || zone.level?.includes('Medium');
                  return (
                    <div key={i} className={`rounded-xl p-3.5 border transition-all hover:scale-[1.02] ${
                      isHigh ? 'bg-red-50 dark:bg-red-950/30 border-red-100 dark:border-red-900/50' :
                      isMod  ? 'bg-orange-50 dark:bg-orange-950/30 border-orange-100 dark:border-orange-900/50' :
                               'bg-blue-50 dark:bg-blue-950/30 border-blue-100 dark:border-blue-900/50'
                    }`}>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <div className={`w-2 h-2 rounded-full ${isHigh ? 'bg-red-400' : isMod ? 'bg-orange-400' : 'bg-blue-400'}`} />
                        <p className="text-xs font-semibold text-slate-700 dark:text-gray-200 truncate">{zone.name}</p>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-gray-400 leading-snug truncate">{zone.description || zone.level}</p>
                      <p className={`text-lg font-bold mt-1.5 ${isHigh ? 'text-red-600 dark:text-red-400' : isMod ? 'text-orange-600 dark:text-orange-400' : 'text-blue-600 dark:text-blue-400'}`}>
                        {zone.people_count ?? Math.round((zone.density_score || 0) * 100)}
                        <span className="text-xs font-normal text-slate-400 dark:text-gray-500 ml-1">visits</span>
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT (1-col): Footfall + AI Insights ── */}
        <div className="flex flex-col gap-5">

          {/* ── Footfall Graph ── */}
          <div className={`${CARD} p-5 animate-slide-right delay-200`}>
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-bold text-slate-800 dark:text-gray-100 text-sm flex items-center gap-2">
                <div className="w-5 h-5 bg-gradient-to-br from-orange-400 to-orange-600 rounded-lg flex items-center justify-center">
                  <Users size={11} className="text-white" />
                </div>
                Customer Footfall
              </h2>
              <Calendar size={14} className="text-slate-300 dark:text-gray-600" />
            </div>
            <p className="text-xs text-slate-400 dark:text-gray-500 ml-7 mb-3">
              {period === 'daily' ? 'Last 7 days' : period === 'weekly' ? 'Last 28 days' : 'Last 90 days'}
            </p>

            {/* Big number */}
            <div className="flex items-end gap-3 mb-4">
              <p className="text-3xl font-bold text-slate-800 dark:text-gray-100 tracking-tight animate-count-reveal delay-400">
                {detectedPeople !== null
                  ? detectedPeople.toLocaleString('en-IN')
                  : totalVisitors.toLocaleString('en-IN')}
              </p>
              <div className="mb-0.5">
                <p className="text-xs font-medium text-slate-500 dark:text-gray-400 leading-tight">
                  {detectedPeople !== null ? 'people detected' : 'est. visitors'}
                </p>
                {detectedPeople !== null && (
                  <p className="text-[10px] text-blue-500 font-medium">from heatmap session</p>
                )}
              </div>
            </div>

            {footfallData.length > 0 ? (
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={footfallData} margin={{ top: 0, right: 0, left: -28, bottom: 0 }} barSize={8}>
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: axisColor }} tickLine={false}
                    tickFormatter={v => v ? v.slice(5) : ''} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 9, fill: axisColor }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle}
                    formatter={v => [v.toLocaleString('en-IN'), 'Visitors']} />
                  <Bar dataKey="visitors" fill="#F97316" radius={[3, 3, 0, 0]}
                    className="transition-all" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-28 flex items-center justify-center">
                <p className="text-xs text-slate-400 dark:text-gray-500">Upload sales data to see footfall</p>
              </div>
            )}

            {/* Store configured footfall vs detected */}
            <div className="mt-3 pt-3 border-t border-blue-50 dark:border-gray-800 flex items-center justify-between">
              <p className="text-[11px] text-slate-400 dark:text-gray-500">Avg per day</p>
              <p className="text-xs font-bold text-orange-500">
                {footfallData.length > 0
                  ? Math.round(totalVisitors / footfallData.length).toLocaleString('en-IN')
                  : '—'} visitors
              </p>
            </div>
          </div>

          {/* ── AI Insights ── */}
          <div className={`${CARD} p-5 animate-slide-right delay-300`}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-slate-800 dark:text-gray-100 text-sm flex items-center gap-2">
                <div className="w-5 h-5 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center">
                  <Zap size={11} className="text-white" />
                </div>
                AI Insights
              </h2>
            </div>

            <div className="space-y-3">
              {lowStockItems.length > 0 && (() => {
                const item = lowStockItems[0];
                return (
                  <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40
                    rounded-xl p-3.5 transition-all hover:shadow-sm">
                    <div className="flex items-start gap-2 mb-2">
                      <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-slate-700 dark:text-gray-200">Low stock alert</p>
                        <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5 leading-snug">
                          {item?.name || 'Product'} is running critically low
                          {item?.stock != null ? ` — only ${item.stock} units left` : ''}.
                        </p>
                      </div>
                    </div>
                    <GradBtn to="/inventory" gradient="from-blue-600 to-blue-700" className="w-full !justify-center">
                      Reorder Now
                    </GradBtn>
                  </div>
                );
              })()}

              {expiringCount > 0 && (
                <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/40
                  rounded-xl p-3.5 transition-all hover:shadow-sm">
                  <div className="flex items-start gap-2 mb-2">
                    <Clock size={13} className="text-rose-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-slate-700 dark:text-gray-200">Expiry alert</p>
                      <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5 leading-snug">
                        {expiringCount} item{expiringCount !== 1 ? 's expire' : ' expires'} within 7 days.
                      </p>
                    </div>
                  </div>
                  <GradBtn to="/marketing" gradient="from-orange-500 to-orange-600" className="w-full !justify-center">
                    Create Campaign
                  </GradBtn>
                </div>
              )}

              {topProduct && !lowStockItems.length && !expiringCount && (
                <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40
                  rounded-xl p-3.5 transition-all hover:shadow-sm">
                  <div className="flex items-start gap-2 mb-2">
                    <TrendingUp size={13} className="text-blue-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-slate-700 dark:text-gray-200">Trending product</p>
                      <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5 leading-snug">
                        "{topProduct.name}" is your top seller right now.
                      </p>
                    </div>
                  </div>
                  <GradBtn to="/marketing" gradient="from-blue-500 to-blue-700" className="w-full !justify-center">
                    Boost with Campaign
                  </GradBtn>
                </div>
              )}

              {!lowStockItems.length && !expiringCount && !topProduct && (
                <div className="py-6 text-center">
                  <Package size={24} className="text-slate-200 dark:text-gray-700 mx-auto mb-2" />
                  <p className="text-xs text-slate-400 dark:text-gray-500 leading-relaxed">
                    Upload sales and inventory data to see AI-powered insights.
                  </p>
                </div>
              )}
            </div>

            {/* Open Munim Ji hint */}
            <div className="mt-4 pt-3 border-t border-blue-50 dark:border-gray-800">
              <p className="text-[11px] text-slate-400 dark:text-gray-500 text-center">
                💬 Chat with{' '}
                <span className="text-blue-600 dark:text-blue-400 font-semibold">Munim Ji</span>
                {' '}for deeper insights
                <span className="ml-1 text-[10px] bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-300 px-1.5 py-0.5 rounded-full font-bold">AI</span>
              </p>
            </div>
          </div>

          {/* ── Top Products mini list ── */}
          {sales?.top_products?.length > 0 && (
            <div className={`${CARD} p-5 animate-slide-right delay-400`}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-slate-800 dark:text-gray-100 text-sm">
                  {t('dashboard.products', 'Top Products')}
                </h2>
                <Link to="/inventory" className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-medium hover:underline">
                  View All <ArrowRight size={11} />
                </Link>
              </div>
              <div className="space-y-2.5">
                {sales.top_products.slice(0, 4).map((p, i) => (
                  <div key={i} className="flex items-center gap-3 group">
                    <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/40 dark:to-blue-900/40
                      flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                      <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{i + 1}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-700 dark:text-gray-200 truncate">{p.name}</p>
                      <p className="text-[10px] text-slate-400 dark:text-gray-500">{p.category || 'Product'}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-bold text-slate-700 dark:text-gray-200">
                        {p.units_sold?.toLocaleString('en-IN') || '—'}
                      </p>
                      <p className="text-[10px] text-slate-400 dark:text-gray-500">units</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Traffic Flow Canvas ─────────────────────────────────────────────────────
const GRID_W = 9;
const GRID_H = 6;

function computeFlowField(customers) {
  const grid = Array.from({ length: GRID_H }, () =>
    Array.from({ length: GRID_W }, () => ({ dx: 0, dy: 0, count: 0 }))
  );
  for (const customer of customers) {
    const path = customer.path;
    for (let i = 0; i < path.length - 1; i++) {
      const p1 = path[i], p2 = path[i + 1];
      const dx = p2.x_pct - p1.x_pct;
      const dy = p2.y_pct - p1.y_pct;
      if (Math.hypot(dx, dy) < 0.3) continue;
      const gx = Math.min(GRID_W - 1, Math.floor(p1.x_pct / 100 * GRID_W));
      const gy = Math.min(GRID_H - 1, Math.floor(p1.y_pct / 100 * GRID_H));
      grid[gy][gx].dx    += dx;
      grid[gy][gx].dy    += dy;
      grid[gy][gx].count += 1;
    }
  }
  const cells = [];
  let maxCount = 1;
  for (let gy = 0; gy < GRID_H; gy++)
    for (let gx = 0; gx < GRID_W; gx++)
      if (grid[gy][gx].count > maxCount) maxCount = grid[gy][gx].count;
  for (let gy = 0; gy < GRID_H; gy++) {
    for (let gx = 0; gx < GRID_W; gx++) {
      const { dx, dy, count } = grid[gy][gx];
      if (count === 0) continue;
      const mag = Math.hypot(dx, dy);
      cells.push({
        gx, gy,
        cx: (gx + 0.5) / GRID_W,
        cy: (gy + 0.5) / GRID_H,
        ndx: dx / mag,
        ndy: dy / mag,
        strength: Math.min(1, count / maxCount),
      });
    }
  }
  return cells;
}

function TrafficFlowCanvas({ floorPlanUrl, heatmapUrl, trajectories, showHeatmap, showFlow }) {
  const canvasRef       = useRef(null);
  const animRef         = useRef(null);
  const imgRef          = useRef(null);
  const imgReady        = useRef(false);
  const heatmapImgRef   = useRef(null);
  const heatmapImgReady = useRef(false);
  const tRef            = useRef(0);

  const flow = useMemo(() =>
    trajectories?.customers?.length ? computeFlowField(trajectories.customers) : [],
  [trajectories]);

  useEffect(() => {
    imgReady.current = false; imgRef.current = null;
    if (!floorPlanUrl) return;
    const img = new Image();
    img.src = floorPlanUrl;
    img.onload = () => { imgRef.current = img; imgReady.current = true; };
  }, [floorPlanUrl]);

  useEffect(() => {
    heatmapImgReady.current = false; heatmapImgRef.current = null;
    if (!heatmapUrl) return;
    const img = new Image();
    img.src = heatmapUrl;
    img.onload = () => { heatmapImgRef.current = img; heatmapImgReady.current = true; };
  }, [heatmapUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = (ts) => {
      tRef.current = ts / 1000;
      const t = tRef.current;
      const ctx = canvas.getContext('2d');
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      if (imgReady.current && imgRef.current) {
        ctx.globalAlpha = 1;
        ctx.drawImage(imgRef.current, 0, 0, W, H);
      } else {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, W, H);
      }
      if (showHeatmap && heatmapImgReady.current && heatmapImgRef.current) {
        ctx.globalAlpha = 0.92;
        ctx.drawImage(heatmapImgRef.current, 0, 0, W, H);
        ctx.globalAlpha = 1;
      } else if (!showHeatmap && imgReady.current) {
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(0, 0, W, H);
      }
      ctx.globalAlpha = 1;
      if (!showFlow || !flow.length) {
        if (!flow.length) {
          ctx.font = '11px system-ui';
          ctx.fillStyle = 'rgba(148,163,184,0.8)';
          ctx.textAlign = 'center';
          ctx.fillText('Reprocess to enable traffic flow', W / 2, H - 12);
        }
        animRef.current = requestAnimationFrame(draw);
        return;
      }
      const cellW = W / GRID_W;
      const cellH = H / GRID_H;
      for (const f of flow) {
        const cx = f.cx * W, cy = f.cy * H;
        const arrowHalf = Math.min(cellW, cellH) * 0.38 * (0.5 + f.strength * 0.5);
        const sx = cx - f.ndx * arrowHalf, sy = cy - f.ndy * arrowHalf;
        const ex = cx + f.ndx * arrowHalf, ey = cy + f.ndy * arrowHalf;
        const shaftAlpha = 0.72 + f.strength * 0.25;
        const ang = Math.atan2(f.ndy, f.ndx);
        const headLen = 8 * f.strength + 5;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.shadowColor = 'rgba(0,0,0,0.65)'; ctx.shadowBlur = 5;
        ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 1.5;
        ctx.beginPath();
        ctx.strokeStyle = `rgba(255,255,255,${shaftAlpha})`;
        ctx.lineWidth = 2;
        ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.beginPath();
        ctx.fillStyle = `rgba(255,255,255,${shaftAlpha})`;
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - headLen * Math.cos(ang - Math.PI / 5.5), ey - headLen * Math.sin(ang - Math.PI / 5.5));
        ctx.lineTo(ex - headLen * Math.cos(ang + Math.PI / 5.5), ey - headLen * Math.sin(ang + Math.PI / 5.5));
        ctx.closePath(); ctx.fill();
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
        const phase = ((f.gx * 1.618 + f.gy * 2.414) % 1);
        const progress = ((t * 0.45 + phase) % 1);
        const dotX = sx + (ex - sx) * progress;
        const dotY = sy + (ey - sy) * progress;
        const dotAlpha = Math.sin(progress * Math.PI) * (0.5 + f.strength * 0.5);
        const dotR = 3.5 * f.strength + 2;
        ctx.shadowColor = `rgba(255,255,255,${dotAlpha * 0.6})`; ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${dotAlpha})`; ctx.fill();
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
      }
      animRef.current = requestAnimationFrame(draw);
    };
    animRef.current = requestAnimationFrame(draw);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [flow, floorPlanUrl, heatmapUrl, showHeatmap, showFlow]);

  return (
    <canvas
      ref={canvasRef}
      width={700}
      height={400}
      className="w-full rounded-xl"
    />
  );
}

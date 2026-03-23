import { useState, useEffect, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
import { Upload, MapPin, Clock } from 'lucide-react';
import { getDemoAnalytics, uploadVideo, getSalesSummary } from '../api';

const COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899'];

export default function StoreAnalytics() {
  const [analytics, setAnalytics] = useState(null);
  const [sales, setSales] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState('heatmap');
  const fileRef = useRef();

  useEffect(() => {
    Promise.all([
      getDemoAnalytics().catch(() => null),
      getSalesSummary().catch(() => null),
    ]).then(([a, s]) => {
      setAnalytics(a?.data);
      setSales(s?.data);
      setLoading(false);
    });
  }, []);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await uploadVideo(formData);
      // Reload with new session
      const heatmap = await getDemoAnalytics();
      setAnalytics(heatmap.data);
    } catch (err) {
      alert('Video upload failed: ' + (err.response?.data?.detail || err.message));
    }
    setUploading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800">Store Analytics</h2>
        <div className="flex gap-2">
          <input type="file" ref={fileRef} accept="video/*" onChange={handleUpload} className="hidden" />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            <Upload size={16} />
            {uploading ? 'Processing...' : 'Upload CCTV Video'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        {['heatmap', 'zones', 'trends'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-md text-sm capitalize transition-colors ${
              activeTab === tab ? 'bg-white text-slate-800 shadow-sm font-medium' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'heatmap' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-800 mb-3">Store Heatmap Analytics</h3>
            {analytics?.heatmap_url ? (
              <img src={analytics.heatmap_url} alt="Heatmap" className="w-full rounded-lg" />
            ) : (
              <div className="h-80 bg-slate-50 rounded-lg flex items-center justify-center text-slate-400">
                Upload a CCTV video to generate heatmap
              </div>
            )}
            <div className="flex gap-4 mt-4 text-xs text-slate-500">
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-500 rounded-sm inline-block" /> High Traffic</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-yellow-500 rounded-sm inline-block" /> Medium Traffic</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-500 rounded-sm inline-block" /> Low Traffic</span>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-800 mb-3">Dwell Time by Zone</h3>
            {analytics?.dwell_times?.map((dt, i) => (
              <div key={i} className="mb-3">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-600">{dt.zone}</span>
                  <span className="font-medium text-slate-800">{dt.avg_dwell_seconds}s</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full">
                  <div
                    className="h-2 bg-indigo-500 rounded-full"
                    style={{ width: `${Math.min(100, (dt.avg_dwell_seconds / 60) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'zones' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {analytics?.zones?.map((zone, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-2 mb-2">
                <MapPin size={16} className={
                  zone.level.includes('High') ? 'text-red-500' :
                  zone.level.includes('Moderate') ? 'text-amber-500' : 'text-blue-500'
                } />
                <h4 className="font-medium text-slate-800">{zone.name}</h4>
              </div>
              <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium mb-2 ${
                zone.level.includes('High') ? 'bg-red-50 text-red-600' :
                zone.level.includes('Moderate') ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'
              }`}>
                {zone.level}
              </span>
              <p className="text-sm text-slate-500">{zone.description}</p>
              <div className="mt-3 flex items-center gap-1 text-xs text-slate-400">
                <Clock size={12} />
                Density Score: {zone.density_score}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'trends' && sales && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-800 mb-3">Daily Revenue (Last 30 Days)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={sales.trends.slice(-30)}>
                <defs>
                  <linearGradient id="revGrad2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Area type="monotone" dataKey="revenue" stroke="#6366f1" fill="url(#revGrad2)" />
                <Area type="monotone" dataKey="ma7" stroke="#f59e0b" fill="none" strokeDasharray="5 5" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-800 mb-3">Sales by Category</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={sales.categories}
                  dataKey="revenue"
                  nameKey="category"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ category, percent }) => `${category} ${(percent * 100).toFixed(0)}%`}
                >
                  {sales.categories.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

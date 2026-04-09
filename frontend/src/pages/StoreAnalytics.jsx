import { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Plus, MapPin, Clock, RefreshCw } from 'lucide-react';
import { getSalesSummary, listFloorPlans } from '../api';
import FloorPlanSetup from './FloorPlanSetup';

const COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899'];

export default function StoreAnalytics() {
  const [sales, setSales] = useState(null);
  const [floors, setFloors] = useState([]);         // completed floor plan sessions
  const [selectedFloor, setSelectedFloor] = useState(null);
  const [showSetup, setShowSetup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('heatmap');

  const loadData = async () => {
    setLoading(true);
    const [s, f] = await Promise.all([
      getSalesSummary().catch(() => null),
      listFloorPlans().catch(() => null),
    ]);
    setSales(s?.data || null);
    const doneFloors = (f?.data?.sessions || []).filter((fl) => fl.status === 'done');
    setFloors(doneFloors);
    if (doneFloors.length > 0 && !selectedFloor) {
      setSelectedFloor(doneFloors[0]);
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleSetupComplete = (data) => {
    loadData(); // refresh floor list
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800">Store Analytics</h2>
        <div className="flex items-center gap-2">
          <button onClick={loadData} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
            <RefreshCw size={16} />
          </button>
          <button
            onClick={() => setShowSetup(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
          >
            <Plus size={16} />
            Add Floor / Configure Cameras
          </button>
        </div>
      </div>

      {/* Floor selector tabs (only if more than one floor) */}
      {floors.length > 1 && (
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit flex-wrap">
          {floors.map((floor) => (
            <button
              key={floor.session_id}
              onClick={() => setSelectedFloor(floor)}
              className={`px-4 py-2 rounded-md text-sm transition-colors ${
                selectedFloor?.session_id === floor.session_id
                  ? 'bg-white text-slate-800 shadow-sm font-medium'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {floor.floor_name}
            </button>
          ))}
        </div>
      )}

      {/* Section tabs */}
      {floors.length > 0 && (
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
          {['heatmap', 'zones', 'sales trends'].map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-md text-sm capitalize transition-colors ${
                activeTab === tab ? 'bg-white text-slate-800 shadow-sm font-medium' : 'text-slate-500 hover:text-slate-700'
              }`}>
              {tab}
            </button>
          ))}
        </div>
      )}

      {/* ── No floors yet ── */}
      {!loading && floors.length === 0 && (
        <div className="bg-white rounded-xl border-2 border-dashed border-slate-200 p-16 text-center">
          <MapPin size={40} className="text-slate-300 mx-auto mb-3" />
          <h3 className="font-semibold text-slate-600 mb-1">No floor plans configured yet</h3>
          <p className="text-sm text-slate-400 mb-5">
            Upload your store layout and place cameras to generate real heatmap analytics.
          </p>
          <button
            onClick={() => setShowSetup(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
          >
            <Plus size={16} /> Add Your First Floor
          </button>
        </div>
      )}

      {/* ── Heatmap tab ── */}
      {activeTab === 'heatmap' && selectedFloor && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-800 mb-3">
              {selectedFloor.floor_name} — Unified Heatmap
            </h3>
            {selectedFloor.heatmap_url ? (
              <>
                <img src={selectedFloor.heatmap_url} alt="Heatmap" className="w-full rounded-lg" />
                <div className="flex gap-4 mt-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-500 rounded-sm inline-block" /> High Traffic</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 bg-yellow-400 rounded-sm inline-block" /> Medium</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-500 rounded-sm inline-block" /> Low</span>
                </div>
              </>
            ) : (
              <div className="h-64 bg-slate-50 rounded-lg flex items-center justify-center text-slate-400 text-sm">
                Heatmap not available
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Clock size={15} /> Camera Zone Summary
            </h3>
            {selectedFloor.zones?.length > 0 ? selectedFloor.zones.map((zone, i) => (
              <div key={i} className="mb-4">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-700 font-medium">{zone.name}</span>
                  <span className={
                    zone.level.includes('High') ? 'text-red-500' :
                    zone.level.includes('Moderate') ? 'text-amber-500' : 'text-blue-500'
                  }>{zone.density_score}</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full">
                  <div className={`h-1.5 rounded-full ${
                    zone.level.includes('High') ? 'bg-red-400' :
                    zone.level.includes('Moderate') ? 'bg-amber-400' : 'bg-blue-400'
                  }`} style={{ width: `${zone.density_score * 100}%` }} />
                </div>
                <p className="text-xs text-slate-400 mt-1">{zone.description}</p>
              </div>
            )) : (
              <p className="text-sm text-slate-400">No zone data</p>
            )}
            <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
              Total people detected: <strong className="text-slate-700">{selectedFloor.total_people}</strong>
            </div>
          </div>
        </div>
      )}

      {/* ── Zones tab ── */}
      {activeTab === 'zones' && selectedFloor && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {selectedFloor.zones?.length > 0 ? selectedFloor.zones.map((zone, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-2 mb-2">
                <MapPin size={15} className={
                  zone.level.includes('High') ? 'text-red-500' :
                  zone.level.includes('Moderate') ? 'text-amber-500' : 'text-blue-500'
                } />
                <h4 className="font-medium text-slate-800 text-sm">{zone.name}</h4>
              </div>
              <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium mb-2 ${
                zone.level.includes('High') ? 'bg-red-50 text-red-600' :
                zone.level.includes('Moderate') ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'
              }`}>
                {zone.level}
              </span>
              <p className="text-xs text-slate-500">{zone.description}</p>
              <p className="text-xs text-slate-400 mt-2">People: {zone.people_count} | Score: {zone.density_score}</p>
            </div>
          )) : (
            <div className="col-span-3 text-center py-12 text-slate-400">No zone data available</div>
          )}
        </div>
      )}

      {/* ── Sales trends tab ── */}
      {activeTab === 'sales trends' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-800 mb-3">Daily Revenue (Last 30 Days)</h3>
            {sales?.trends ? (
              <div style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={sales.trends.slice(-30)}>
                    <defs>
                      <linearGradient id="rg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Area type="monotone" dataKey="revenue" stroke="#6366f1" fill="url(#rg)" />
                    <Area type="monotone" dataKey="ma7" stroke="#f59e0b" fill="none" strokeDasharray="4 4" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 bg-slate-50 rounded-lg flex items-center justify-center text-slate-400 text-sm">
                Upload sales data to see trends
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-800 mb-3">Revenue by Category</h3>
            {sales?.categories ? (
              <div style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={sales.categories} dataKey="revenue" nameKey="category"
                      cx="50%" cy="50%" outerRadius={100}
                      label={({ category, percent }) => `${category} ${(percent * 100).toFixed(0)}%`}>
                      {sales.categories.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 bg-slate-50 rounded-lg flex items-center justify-center text-slate-400 text-sm">
                No sales data available
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floor plan setup modal */}
      {showSetup && (
        <FloorPlanSetup
          onClose={() => setShowSetup(false)}
          onComplete={handleSetupComplete}
        />
      )}
    </div>
  );
}

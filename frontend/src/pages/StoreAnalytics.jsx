import { useState, useEffect, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import {
  Plus, MapPin, Clock, RefreshCw, Edit2, Trash2, AlertTriangle,
  Camera, Upload, Play, Loader2, CheckCircle,
} from 'lucide-react';
import {
  getSalesSummary, listFloorPlans, deleteFloorPlan,
  uploadCameraVideo, processFloorPlan, getFloorPlanStatus,
} from '../api';
import FloorPlanSetup from './FloorPlanSetup';
import { useTheme } from '../context/ThemeContext';

const COLORS     = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899'];
const CAM_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

const CARD = 'bg-white dark:bg-gray-900 rounded-2xl border border-slate-100 dark:border-gray-800 shadow-sm';

export default function StoreAnalytics() {
  const { dark } = useTheme();
  const [sales, setSales]               = useState(null);
  const [floors, setFloors]             = useState([]);
  const [selectedFloor, setSelectedFloor] = useState(null);
  const [showSetup, setShowSetup]       = useState(false);
  const [editingFloor, setEditingFloor] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting]         = useState(false);
  const [loading, setLoading]           = useState(true);
  const [activeTab, setActiveTab]       = useState('heatmap');
  const [videoUploads, setVideoUploads] = useState({});
  const [processing, setProcessing]     = useState(false);
  const pollRef                         = useRef(null);

  const axisColor   = dark ? '#6b7280' : '#94a3b8';
  const tooltipStyle = dark
    ? { backgroundColor: '#1f2937', border: '1px solid #374151', color: '#f3f4f6', borderRadius: 10 }
    : { backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 10 };

  const loadData = async () => {
    setLoading(true);
    const [s, f] = await Promise.all([
      getSalesSummary().catch(() => null),
      listFloorPlans().catch(() => null),
    ]);
    setSales(s?.data || null);
    const all = f?.data?.sessions || [];
    setFloors(all);
    setSelectedFloor(prev => {
      if (!prev && all.length > 0) return all[0];
      if (prev) return all.find(fl => fl.session_id === prev.session_id) || all[0] || null;
      return null;
    });
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    setVideoUploads({});
    setActiveTab('heatmap');
    if (selectedFloor?.status === 'processing' && !processing) {
      setProcessing(true);
      startPolling(selectedFloor.session_id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFloor?.session_id]);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const startPolling = (sessionId) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await getFloorPlanStatus(sessionId);
        if (res.data.status === 'done' || res.data.status === 'error') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setProcessing(false);
          if (res.data.status === 'error') alert('Processing error: ' + res.data.error);
          loadData();
        }
      } catch (e) { console.error('Poll error', e); }
    }, 3000);
  };

  const handleVideoUpload = async (camId, file) => {
    if (!file || !selectedFloor) return;
    setVideoUploads(prev => ({ ...prev, [camId]: { status: 'uploading', filename: file.name } }));
    try {
      const fd = new FormData();
      fd.append('file', file);
      await uploadCameraVideo(selectedFloor.session_id, camId, fd);
      setVideoUploads(prev => ({ ...prev, [camId]: { status: 'done', filename: file.name } }));
    } catch (e) {
      setVideoUploads(prev => ({ ...prev, [camId]: { status: 'error', filename: file.name } }));
      alert('Upload failed: ' + (e.response?.data?.detail || e.message));
    }
  };

  const handleRecalibrate = async () => {
    if (!selectedFloor || processing) return;
    setProcessing(true);
    try {
      await processFloorPlan(selectedFloor.session_id);
      startPolling(selectedFloor.session_id);
    } catch (e) {
      setProcessing(false);
      alert('Failed to start processing: ' + (e.response?.data?.detail || e.message));
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await deleteFloorPlan(confirmDelete);
      setConfirmDelete(null);
      const updated = floors.filter(f => f.session_id !== confirmDelete);
      setFloors(updated);
      if (selectedFloor?.session_id === confirmDelete) setSelectedFloor(updated[0] || null);
    } catch (e) {
      alert('Delete failed: ' + (e.response?.data?.detail || e.message));
    } finally { setDeleting(false); }
  };

  const isProcessing = processing || selectedFloor?.status === 'processing';

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            className="p-2 text-slate-400 dark:text-gray-500 hover:text-slate-600 dark:hover:text-gray-300 rounded-xl hover:bg-slate-100 dark:hover:bg-gray-800 transition-colors"
          >
            <RefreshCw size={15} />
          </button>
          {/* Floor tabs */}
          {floors.length > 0 && (
            <div className="flex gap-1 bg-slate-100 dark:bg-gray-800 p-1 rounded-xl">
              {floors.map(floor => (
                <button
                  key={floor.session_id}
                  onClick={() => setSelectedFloor(floor)}
                  className={`px-4 py-2 rounded-lg text-sm transition-colors flex items-center gap-1.5 ${
                    selectedFloor?.session_id === floor.session_id
                      ? 'bg-white dark:bg-gray-700 text-slate-800 dark:text-gray-100 shadow-sm font-medium'
                      : 'text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200'
                  }`}
                >
                  {floor.floor_name}
                  {floor.status !== 'done' && (
                    <span className="text-xs bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-full font-normal">
                      {floor.status}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => setShowSetup(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          <Plus size={15} />
          Add Floor
        </button>
      </div>

      {/* Floor action bar */}
      {selectedFloor && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditingFloor(selectedFloor)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 dark:border-gray-700 text-slate-600 dark:text-gray-400 rounded-lg hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors"
          >
            <Edit2 size={12} /> Edit Camera Layout
          </button>

          {confirmDelete === selectedFloor.session_id ? (
            <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg px-3 py-1.5">
              <AlertTriangle size={13} className="text-red-500 shrink-0" />
              <span className="text-xs text-red-700 dark:text-red-400">Delete "{selectedFloor.floor_name}"?</span>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-800 disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Confirm'}
              </button>
              <button onClick={() => setConfirmDelete(null)} className="text-xs text-slate-400 dark:text-gray-500 hover:text-slate-600">
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(selectedFloor.session_id)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-red-200 dark:border-red-900 text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
            >
              <Trash2 size={12} /> Delete Floor
            </button>
          )}
        </div>
      )}

      {/* Section tabs */}
      {selectedFloor?.status === 'done' && (
        <div className="flex gap-1 bg-slate-100 dark:bg-gray-800 p-1 rounded-xl w-fit">
          {['heatmap', 'zones', 'sales trends'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm capitalize transition-colors ${
                activeTab === tab
                  ? 'bg-white dark:bg-gray-700 text-slate-800 dark:text-gray-100 shadow-sm font-medium'
                  : 'text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      )}

      {/* No floors */}
      {!loading && floors.length === 0 && (
        <div className={`${CARD} p-16 text-center`}>
          <MapPin size={36} className="text-slate-300 dark:text-gray-600 mx-auto mb-3" />
          <h3 className="font-semibold text-slate-600 dark:text-gray-300 mb-1">No floor plans configured yet</h3>
          <p className="text-sm text-slate-400 dark:text-gray-500 mb-5">
            Upload your store layout and place cameras to generate heatmap analytics.
          </p>
          <button
            onClick={() => setShowSetup(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <Plus size={15} /> Add Your First Floor
          </button>
        </div>
      )}

      {/* Heatmap tab */}
      {selectedFloor && (activeTab === 'heatmap' || selectedFloor.status !== 'done') && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Floor plan / heatmap */}
          <div className={`${CARD} p-5 lg:col-span-2`}>
            <h3 className="font-semibold text-slate-800 dark:text-gray-100 text-sm mb-3">
              {selectedFloor.floor_name} —{' '}
              <span className="font-normal text-slate-400 dark:text-gray-500">
                {selectedFloor.status === 'done' ? 'Unified Heatmap' : 'Floor Plan Preview'}
              </span>
            </h3>

            {isProcessing ? (
              <div className="h-64 bg-slate-50 dark:bg-gray-800 rounded-xl flex flex-col items-center justify-center gap-3">
                <Loader2 size={28} className="animate-spin text-indigo-500" />
                <p className="text-sm text-slate-600 dark:text-gray-300 font-medium">Running CV pipeline…</p>
                <p className="text-xs text-slate-400 dark:text-gray-500">YOLOv8 detection · polling every 3 s</p>
              </div>
            ) : selectedFloor.status === 'error' ? (
              <div className="h-48 bg-red-50 dark:bg-red-950/30 rounded-xl flex flex-col items-center justify-center gap-2 border border-red-100 dark:border-red-900">
                <AlertTriangle size={22} className="text-red-400" />
                <p className="text-sm text-red-600 dark:text-red-400 font-medium">Processing failed</p>
                <p className="text-xs text-red-400 dark:text-red-500">Upload videos and click "Generate Heatmap" to retry</p>
              </div>
            ) : selectedFloor.status === 'done' && selectedFloor.heatmap_url ? (
              <>
                <img src={selectedFloor.heatmap_url} alt="Heatmap" className="w-full rounded-xl" />
                <div className="flex gap-4 mt-3 text-xs text-slate-500 dark:text-gray-400">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-red-500 rounded-sm" /> High</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-yellow-400 rounded-sm" /> Medium</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-blue-500 rounded-sm" /> Low</span>
                </div>
              </>
            ) : selectedFloor.floor_plan_url ? (
              <>
                <img src={selectedFloor.floor_plan_url} alt="Floor plan" className="w-full rounded-xl opacity-60" />
                <p className="text-xs text-slate-400 dark:text-gray-500 mt-2 text-center">
                  Upload CCTV footage and generate a heatmap to see customer traffic
                </p>
              </>
            ) : (
              <div className="h-64 bg-slate-50 dark:bg-gray-800 rounded-xl flex items-center justify-center text-slate-400 dark:text-gray-500 text-sm">
                No image available
              </div>
            )}
          </div>

          {/* Camera feeds */}
          <div className={`${CARD} p-5 flex flex-col gap-4`}>
            <h3 className="font-semibold text-slate-800 dark:text-gray-100 text-sm flex items-center gap-2 shrink-0">
              <Camera size={14} className="text-indigo-500" /> Camera Feeds
            </h3>

            {!selectedFloor.cameras?.length ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-slate-400 dark:text-gray-500 text-center leading-relaxed">
                  No cameras placed yet.<br />
                  Click <strong>Edit Camera Layout</strong> to add cameras.
                </p>
              </div>
            ) : (
              <>
                <div className="flex-1 space-y-2 overflow-y-auto">
                  {selectedFloor.cameras.map((cam, i) => {
                    const upload      = videoUploads[cam.id];
                    const isUploading = upload?.status === 'uploading';
                    const uploadDone  = upload?.status === 'done';
                    const uploadError = upload?.status === 'error';
                    const hasExisting = cam.has_video && !upload;

                    return (
                      <div key={cam.id} className="flex items-center gap-2.5 p-2.5 bg-slate-50 dark:bg-gray-800 rounded-xl">
                        <div
                          style={{ background: CAM_COLORS[i % CAM_COLORS.length] }}
                          className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                        >
                          <Camera size={11} className="text-white" />
                        </div>
                        <span className="text-xs font-medium text-slate-700 dark:text-gray-300 flex-1 min-w-0 truncate">{cam.name}</span>
                        {isUploading ? (
                          <span className="flex items-center gap-1 text-xs text-indigo-500 shrink-0">
                            <Loader2 size={11} className="animate-spin" /> Uploading
                          </span>
                        ) : (uploadDone || hasExisting) ? (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <CheckCircle size={11} className="text-green-500" />
                            <label className="text-xs text-slate-400 dark:text-gray-500 cursor-pointer hover:text-indigo-500 underline underline-offset-2">
                              Replace<input type="file" accept="video/*" className="hidden" onChange={e => handleVideoUpload(cam.id, e.target.files[0])} />
                            </label>
                          </div>
                        ) : uploadError ? (
                          <label className="flex items-center gap-1 text-xs text-red-500 cursor-pointer hover:text-red-700 shrink-0">
                            <Upload size={11} /> Retry<input type="file" accept="video/*" className="hidden" onChange={e => handleVideoUpload(cam.id, e.target.files[0])} />
                          </label>
                        ) : (
                          <label className="flex items-center gap-1 text-xs text-indigo-600 cursor-pointer hover:text-indigo-800 shrink-0">
                            <Upload size={11} /> Upload<input type="file" accept="video/*" className="hidden" onChange={e => handleVideoUpload(cam.id, e.target.files[0])} />
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-gray-800 shrink-0">
                  {(() => {
                    const hasAnyVideo = selectedFloor.cameras.some(c => c.has_video || videoUploads[c.id]?.status === 'done');
                    if (isProcessing) return (
                      <div className="flex items-center justify-center gap-2 py-2 text-sm text-indigo-500">
                        <Loader2 size={14} className="animate-spin" /> Pipeline running…
                      </div>
                    );
                    if (hasAnyVideo) return (
                      <button
                        onClick={handleRecalibrate}
                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
                      >
                        <Play size={14} />
                        {selectedFloor.status === 'done' ? 'Recalibrate Heatmap' : 'Generate Heatmap'}
                      </button>
                    );
                    return <p className="text-xs text-slate-400 dark:text-gray-500 text-center py-2">Upload at least one camera feed.</p>;
                  })()}
                </div>

                {selectedFloor.status === 'done' && (
                  <p className="text-xs text-slate-500 dark:text-gray-400 border-t border-slate-100 dark:border-gray-800 pt-2 shrink-0">
                    Total detected: <strong className="text-slate-700 dark:text-gray-200">{selectedFloor.total_people}</strong>
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Zone summary under heatmap tab */}
      {activeTab === 'heatmap' && selectedFloor?.status === 'done' && selectedFloor.zones?.length > 0 && (
        <div className={`${CARD} p-5`}>
          <h3 className="font-semibold text-slate-800 dark:text-gray-100 text-sm mb-4 flex items-center gap-2">
            <Clock size={14} className="text-indigo-500" /> Camera Zone Summary
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {selectedFloor.zones.map((zone, i) => (
              <div key={i}>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-slate-700 dark:text-gray-300 font-medium">{zone.name}</span>
                  <span className={zone.level.includes('High') ? 'text-red-500' : zone.level.includes('Moderate') ? 'text-amber-500' : 'text-blue-500'}>
                    {zone.density_score}
                  </span>
                </div>
                <div className="h-1.5 bg-slate-100 dark:bg-gray-800 rounded-full">
                  <div
                    className={`h-1.5 rounded-full ${zone.level.includes('High') ? 'bg-red-400' : zone.level.includes('Moderate') ? 'bg-amber-400' : 'bg-blue-400'}`}
                    style={{ width: `${zone.density_score * 100}%` }}
                  />
                </div>
                <p className="text-xs text-slate-400 dark:text-gray-500 mt-1">{zone.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Zones tab */}
      {activeTab === 'zones' && selectedFloor?.status === 'done' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {selectedFloor.zones?.length > 0 ? selectedFloor.zones.map((zone, i) => (
            <div key={i} className={`${CARD} p-5`}>
              <div className="flex items-center gap-2 mb-2">
                <MapPin size={14} className={zone.level.includes('High') ? 'text-red-500' : zone.level.includes('Moderate') ? 'text-amber-500' : 'text-blue-500'} />
                <h4 className="font-medium text-slate-800 dark:text-gray-100 text-sm">{zone.name}</h4>
              </div>
              <span className={`inline-block px-2 py-0.5 rounded-lg text-xs font-medium mb-2 ${
                zone.level.includes('High') ? 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400' :
                zone.level.includes('Moderate') ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400' :
                'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'
              }`}>
                {zone.level}
              </span>
              <p className="text-xs text-slate-500 dark:text-gray-400">{zone.description}</p>
              <p className="text-xs text-slate-400 dark:text-gray-500 mt-2">People: {zone.people_count} · Score: {zone.density_score}</p>
            </div>
          )) : (
            <div className="col-span-3 text-center py-12 text-slate-400 dark:text-gray-500">No zone data available</div>
          )}
        </div>
      )}

      {/* Sales trends tab */}
      {activeTab === 'sales trends' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className={`${CARD} p-5`}>
            <h3 className="font-semibold text-slate-800 dark:text-gray-100 text-sm mb-3">Daily Revenue — Last 30 Days</h3>
            {sales?.trends ? (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={sales.trends.slice(-30)}>
                  <defs>
                    <linearGradient id="rg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: axisColor }} tickFormatter={d => d.slice(5)} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: axisColor }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2} fill="url(#rg)" dot={false} />
                  <Area type="monotone" dataKey="ma7" stroke="#f59e0b" strokeWidth={1.5} fill="none" strokeDasharray="5 5" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 bg-slate-50 dark:bg-gray-800 rounded-xl flex items-center justify-center text-slate-400 dark:text-gray-500 text-sm">
                Upload sales data to see trends
              </div>
            )}
          </div>

          <div className={`${CARD} p-5`}>
            <h3 className="font-semibold text-slate-800 dark:text-gray-100 text-sm mb-3">Revenue by Category</h3>
            {sales?.categories ? (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={sales.categories}
                    dataKey="revenue"
                    nameKey="category"
                    cx="50%" cy="50%"
                    outerRadius={95}
                    label={({ category, percent }) => `${category} ${(percent * 100).toFixed(0)}%`}
                  >
                    {sales.categories.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 bg-slate-50 dark:bg-gray-800 rounded-xl flex items-center justify-center text-slate-400 dark:text-gray-500 text-sm">
                No sales data available
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {showSetup && <FloorPlanSetup onClose={() => setShowSetup(false)} onComplete={() => loadData()} />}
      {editingFloor && <FloorPlanSetup editSession={editingFloor} onClose={() => setEditingFloor(null)} onComplete={() => { setEditingFloor(null); loadData(); }} />}
    </div>
  );
}

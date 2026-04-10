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

const COLORS     = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899'];
const CAM_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

export default function StoreAnalytics() {
  const [sales, setSales]               = useState(null);
  const [floors, setFloors]             = useState([]);
  const [selectedFloor, setSelectedFloor] = useState(null);
  const [showSetup, setShowSetup]       = useState(false);
  const [editingFloor, setEditingFloor] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting]         = useState(false);
  const [loading, setLoading]           = useState(true);
  const [activeTab, setActiveTab]       = useState('heatmap');

  // Per-floor video upload tracking (resets when floor changes)
  const [videoUploads, setVideoUploads] = useState({});
  const [processing, setProcessing]     = useState(false);
  const pollRef                         = useRef(null);

  const loadData = async () => {
    setLoading(true);
    const [s, f] = await Promise.all([
      getSalesSummary().catch(() => null),
      listFloorPlans().catch(() => null),
    ]);
    setSales(s?.data || null);
    const allFloors = f?.data?.sessions || [];
    setFloors(allFloors);
    setSelectedFloor((prev) => {
      if (!prev && allFloors.length > 0) return allFloors[0];
      if (prev) return allFloors.find((fl) => fl.session_id === prev.session_id) || allFloors[0] || null;
      return null;
    });
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  // Reset upload state when switching floors; auto-poll if already processing
  useEffect(() => {
    setVideoUploads({});
    setActiveTab('heatmap');
    if (selectedFloor?.status === 'processing' && !processing) {
      setProcessing(true);
      startPolling(selectedFloor.session_id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFloor?.session_id]);

  // Cleanup poll on unmount
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
          if (res.data.status === 'error') {
            alert('Processing error: ' + res.data.error);
          }
          loadData();
        }
      } catch (e) {
        console.error('Poll error', e);
      }
    }, 3000);
  };

  const handleVideoUpload = async (camId, file) => {
    if (!file || !selectedFloor) return;
    setVideoUploads((prev) => ({ ...prev, [camId]: { status: 'uploading', filename: file.name } }));
    try {
      const fd = new FormData();
      fd.append('file', file);
      await uploadCameraVideo(selectedFloor.session_id, camId, fd);
      setVideoUploads((prev) => ({ ...prev, [camId]: { status: 'done', filename: file.name } }));
    } catch (e) {
      setVideoUploads((prev) => ({ ...prev, [camId]: { status: 'error', filename: file.name } }));
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

  const handleSetupComplete = () => loadData();

  const handleEditComplete = () => {
    setEditingFloor(null);
    loadData();
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await deleteFloorPlan(confirmDelete);
      setConfirmDelete(null);
      const updated = floors.filter((f) => f.session_id !== confirmDelete);
      setFloors(updated);
      if (selectedFloor?.session_id === confirmDelete) {
        setSelectedFloor(updated[0] || null);
      }
    } catch (e) {
      alert('Delete failed: ' + (e.response?.data?.detail || e.message));
    } finally {
      setDeleting(false);
    }
  };

  // Derived: is any camera pipeline running?
  const isProcessing = processing || selectedFloor?.status === 'processing';

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

      {/* Floor selector tabs */}
      {floors.length > 0 && (
        <div className="flex flex-wrap gap-1 bg-slate-100 p-1 rounded-lg w-fit">
          {floors.map((floor) => (
            <button
              key={floor.session_id}
              onClick={() => setSelectedFloor(floor)}
              className={`px-4 py-2 rounded-md text-sm transition-colors flex items-center gap-1.5 ${
                selectedFloor?.session_id === floor.session_id
                  ? 'bg-white text-slate-800 shadow-sm font-medium'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {floor.floor_name}
              {floor.status !== 'done' && (
                <span className="text-xs bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full font-normal">
                  {floor.status}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Floor actions bar */}
      {selectedFloor && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditingFloor(selectedFloor)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 hover:border-slate-300"
          >
            <Edit2 size={12} /> Edit Camera Layout
          </button>
          {confirmDelete === selectedFloor.session_id ? (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
              <AlertTriangle size={13} className="text-red-500 shrink-0" />
              <span className="text-xs text-red-700">Delete "{selectedFloor.floor_name}"?</span>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Confirm'}
              </button>
              <button
                onClick={() => setConfirmDelete(null)}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(selectedFloor.session_id)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-red-200 text-red-500 rounded-lg hover:bg-red-50"
            >
              <Trash2 size={12} /> Delete Floor
            </button>
          )}
        </div>
      )}

      {/* Section tabs (zones + sales trends only shown for done floors) */}
      {selectedFloor?.status === 'done' && (
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
          {['heatmap', 'zones', 'sales trends'].map((tab) => (
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

      {/* ── Heatmap tab: shown for any selected floor ── */}
      {selectedFloor && (activeTab === 'heatmap' || selectedFloor.status !== 'done') && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Left: floor plan / heatmap image */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-800 mb-3">
              {selectedFloor.floor_name} —{' '}
              {selectedFloor.status === 'done' ? 'Unified Heatmap' : 'Floor Plan Preview'}
            </h3>

            {isProcessing ? (
              <div className="h-64 bg-slate-50 rounded-xl flex flex-col items-center justify-center gap-3">
                <Loader2 size={32} className="animate-spin text-indigo-500" />
                <p className="text-sm text-slate-700 font-medium">Running CV pipeline...</p>
                <p className="text-xs text-slate-400">YOLOv8 detection · polling every 3 s</p>
              </div>
            ) : selectedFloor.status === 'error' ? (
              <div className="h-48 bg-red-50 rounded-xl flex flex-col items-center justify-center gap-2 border border-red-100">
                <AlertTriangle size={24} className="text-red-400" />
                <p className="text-sm text-red-600 font-medium">Processing failed</p>
                <p className="text-xs text-red-400">Upload videos and click "Generate Heatmap" to retry</p>
              </div>
            ) : selectedFloor.status === 'done' && selectedFloor.heatmap_url ? (
              <>
                <img src={selectedFloor.heatmap_url} alt="Heatmap" className="w-full rounded-lg" />
                <div className="flex gap-4 mt-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-red-500 rounded-sm inline-block" /> High Traffic
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-yellow-400 rounded-sm inline-block" /> Medium
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-blue-500 rounded-sm inline-block" /> Low
                  </span>
                </div>
              </>
            ) : selectedFloor.floor_plan_url ? (
              <>
                <img
                  src={selectedFloor.floor_plan_url}
                  alt="Floor plan"
                  className="w-full rounded-lg opacity-70"
                />
                <p className="text-xs text-slate-400 mt-2 text-center">
                  Upload CCTV footage and generate a heatmap to see customer traffic
                </p>
              </>
            ) : (
              <div className="h-64 bg-slate-50 rounded-lg flex items-center justify-center text-slate-400 text-sm">
                No image available
              </div>
            )}
          </div>

          {/* Right: camera feeds panel */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-3">
            <h3 className="font-semibold text-slate-800 flex items-center gap-2">
              <Camera size={15} className="text-indigo-500" /> Camera Feeds
            </h3>

            {!selectedFloor.cameras?.length ? (
              <div className="flex-1 flex items-center justify-center py-8">
                <p className="text-sm text-slate-400 text-center leading-relaxed">
                  No cameras placed yet.<br />
                  Click <strong>Edit Camera Layout</strong> to add cameras.
                </p>
              </div>
            ) : (
              <>
                {/* Camera list */}
                <div className="flex-1 space-y-2 overflow-y-auto">
                  {selectedFloor.cameras.map((cam, i) => {
                    const upload      = videoUploads[cam.id];
                    const isUploading = upload?.status === 'uploading';
                    const uploadDone  = upload?.status === 'done';
                    const uploadError = upload?.status === 'error';
                    const hasExisting = cam.has_video && !upload;

                    return (
                      <div key={cam.id} className="flex items-center gap-2.5 p-2.5 bg-slate-50 rounded-lg">
                        <div
                          style={{ background: CAM_COLORS[i % CAM_COLORS.length] }}
                          className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                        >
                          <Camera size={11} className="text-white" />
                        </div>
                        <span className="text-xs font-medium text-slate-700 flex-1 min-w-0 truncate">
                          {cam.name}
                        </span>

                        {isUploading ? (
                          <span className="flex items-center gap-1 text-xs text-indigo-500 shrink-0">
                            <Loader2 size={11} className="animate-spin" /> Uploading
                          </span>
                        ) : uploadDone ? (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <CheckCircle size={11} className="text-green-500" />
                            <label className="text-xs text-slate-400 cursor-pointer hover:text-indigo-500 underline underline-offset-2">
                              Replace
                              <input type="file" accept="video/*" className="hidden"
                                onChange={(e) => handleVideoUpload(cam.id, e.target.files[0])} />
                            </label>
                          </div>
                        ) : hasExisting ? (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <CheckCircle size={11} className="text-green-500" />
                            <label className="text-xs text-slate-400 cursor-pointer hover:text-indigo-500 underline underline-offset-2">
                              Replace
                              <input type="file" accept="video/*" className="hidden"
                                onChange={(e) => handleVideoUpload(cam.id, e.target.files[0])} />
                            </label>
                          </div>
                        ) : uploadError ? (
                          <label className="flex items-center gap-1 text-xs text-red-500 cursor-pointer hover:text-red-700 shrink-0">
                            <Upload size={11} /> Retry
                            <input type="file" accept="video/*" className="hidden"
                              onChange={(e) => handleVideoUpload(cam.id, e.target.files[0])} />
                          </label>
                        ) : (
                          <label className="flex items-center gap-1 text-xs text-indigo-600 cursor-pointer hover:text-indigo-800 shrink-0">
                            <Upload size={11} /> Upload
                            <input type="file" accept="video/*" className="hidden"
                              onChange={(e) => handleVideoUpload(cam.id, e.target.files[0])} />
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Generate / recalibrate */}
                <div className="pt-3 border-t border-slate-100">
                  {(() => {
                    const hasAnyVideo = selectedFloor.cameras.some(
                      (cam) => cam.has_video || videoUploads[cam.id]?.status === 'done'
                    );

                    if (isProcessing) {
                      return (
                        <div className="flex items-center justify-center gap-2 py-2 text-sm text-indigo-500">
                          <Loader2 size={14} className="animate-spin" />
                          <span>Pipeline running...</span>
                        </div>
                      );
                    }
                    if (hasAnyVideo) {
                      return (
                        <button
                          onClick={handleRecalibrate}
                          className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
                        >
                          <Play size={14} />
                          {selectedFloor.status === 'done' ? 'Recalibrate Heatmap' : 'Generate Heatmap'}
                        </button>
                      );
                    }
                    return (
                      <p className="text-xs text-slate-400 text-center py-2 leading-relaxed">
                        Upload at least one camera feed<br />to generate a heatmap.
                      </p>
                    );
                  })()}
                </div>

                {/* Total detected (done floors) */}
                {selectedFloor.status === 'done' && (
                  <div className="text-xs text-slate-500 border-t border-slate-100 pt-2">
                    Total people detected:{' '}
                    <strong className="text-slate-700">{selectedFloor.total_people}</strong>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Zones tab ── */}
      {activeTab === 'zones' && selectedFloor?.status === 'done' && (
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

      {/* ── Zones summary within heatmap tab ── */}
      {activeTab === 'heatmap' && selectedFloor?.status === 'done' && selectedFloor.zones?.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Clock size={15} /> Camera Zone Summary
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {selectedFloor.zones.map((zone, i) => (
              <div key={i}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-700 font-medium">{zone.name}</span>
                  <span className={
                    zone.level.includes('High') ? 'text-red-500' :
                    zone.level.includes('Moderate') ? 'text-amber-500' : 'text-blue-500'
                  }>{zone.density_score}</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full">
                  <div
                    className={`h-1.5 rounded-full ${
                      zone.level.includes('High') ? 'bg-red-400' :
                      zone.level.includes('Moderate') ? 'bg-amber-400' : 'bg-blue-400'
                    }`}
                    style={{ width: `${zone.density_score * 100}%` }}
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1">{zone.description}</p>
              </div>
            ))}
          </div>
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
                    <Pie
                      data={sales.categories}
                      dataKey="revenue"
                      nameKey="category"
                      cx="50%" cy="50%"
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
            ) : (
              <div className="h-64 bg-slate-50 rounded-lg flex items-center justify-center text-slate-400 text-sm">
                No sales data available
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      {showSetup && (
        <FloorPlanSetup
          onClose={() => setShowSetup(false)}
          onComplete={handleSetupComplete}
        />
      )}
      {editingFloor && (
        <FloorPlanSetup
          editSession={editingFloor}
          onClose={() => setEditingFloor(null)}
          onComplete={handleEditComplete}
        />
      )}
    </div>
  );
}

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Plus, MapPin, Clock, RefreshCw, Edit2, Trash2, AlertTriangle,
  Camera, Upload, Play, Loader2, CheckCircle, Footprints,
  Pause, SkipBack, SkipForward, Users, Activity, Wind,
} from 'lucide-react';
import {
  listFloorPlans, deleteFloorPlan,
  uploadCameraVideo, processFloorPlan, getFloorPlanStatus,
  getFloorPlanTrajectories,
} from '../api';
import FloorPlanSetup from './FloorPlanSetup';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from 'react-i18next';

const COLORS     = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899'];
const CAM_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

const CARD = 'bg-white dark:bg-gray-900 rounded-2xl border border-slate-100 dark:border-gray-800 shadow-sm';

export default function StoreAnalytics() {
  const { dark } = useTheme();
  const { t } = useTranslation();
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
  const [trajectories, setTrajectories] = useState(null);
  const [trajLoading, setTrajLoading]   = useState(false);
  const [recordedAt, setRecordedAt]     = useState('');
  const [pendingUpload, setPendingUpload] = useState(null); // { camId, file, recordedAt }
  const pollRef                         = useRef(null);

  const loadData = async () => {
    setLoading(true);
    const f = await listFloorPlans().catch(() => null);
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
    setTrajectories(null);
    if (selectedFloor?.status === 'processing' && !processing) {
      setProcessing(true);
      startPolling(selectedFloor.session_id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFloor?.session_id]);

  useEffect(() => {
    if (activeTab !== 'journeys' || !selectedFloor || trajectories) return;
    setTrajLoading(true);
    getFloorPlanTrajectories(selectedFloor.session_id)
      .then(r => setTrajectories(r.data))
      .catch(() => setTrajectories({ customers: [], duration: 0 }))
      .finally(() => setTrajLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, selectedFloor?.session_id]);

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

  function _nowDatetimeLocal() {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  }

  // Called when a file is picked — show the timestamp popup instead of uploading immediately
  const handleFilePicked = (camId, file) => {
    if (!file) return;
    setPendingUpload({ camId, file, recordedAt: _nowDatetimeLocal() });
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

  const confirmPendingUpload = async () => {
    const { camId, file, recordedAt: ts } = pendingUpload;
    setPendingUpload(null);
    if (ts) setRecordedAt(ts);
    await handleVideoUpload(camId, file);
  };

  const handleRecalibrate = async () => {
    if (!selectedFloor || processing) return;
    setProcessing(true);
    try {
      const isoRecordedAt = recordedAt ? new Date(recordedAt).toISOString() : null;
      await processFloorPlan(selectedFloor.session_id, isoRecordedAt);
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
          {t('analytics.addFloor', 'Add Floor')}
        </button>
      </div>

      {/* Floor action bar */}
      {selectedFloor && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditingFloor(selectedFloor)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 dark:border-gray-700 text-slate-600 dark:text-gray-400 rounded-lg hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors"
          >
            <Edit2 size={12} /> {t('analytics.editCameraLayout', 'Edit Camera Layout')}
          </button>

          {confirmDelete === selectedFloor.session_id ? (
            <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg px-3 py-1.5">
              <AlertTriangle size={13} className="text-red-500 shrink-0" />
              <span className="text-xs text-red-700 dark:text-red-400">{t('analytics.confirmDelete', 'Delete "{{name}}"?', { name: selectedFloor.floor_name })}</span>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-800 disabled:opacity-50"
              >
                {deleting ? t('analytics.deleting', 'Deleting…') : t('analytics.confirm', 'Confirm')}
              </button>
              <button onClick={() => setConfirmDelete(null)} className="text-xs text-slate-400 dark:text-gray-500 hover:text-slate-600">
                {t('analytics.cancel', 'Cancel')}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(selectedFloor.session_id)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-red-200 dark:border-red-900 text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
            >
              <Trash2 size={12} /> {t('analytics.deleteFloor', 'Delete Floor')}
            </button>
          )}
        </div>
      )}

      {/* Section tabs */}
      {selectedFloor?.status === 'done' && (
        <div className="flex gap-1 bg-slate-100 dark:bg-gray-800 p-1 rounded-xl w-fit flex-wrap">
          {[
            { id: 'heatmap',  label: t('analytics.tabHeatmap', 'Heatmap') },
            { id: 'journeys', label: t('analytics.tabJourneys', 'Customer Journeys'), icon: <Footprints size={12}/> },
            { id: 'zones',    label: t('analytics.tabZones', 'Zones') },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm transition-colors ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-gray-700 text-slate-800 dark:text-gray-100 shadow-sm font-medium'
                  : 'text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200'
              }`}
            >
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>
      )}

      {/* No floors */}
      {!loading && floors.length === 0 && (
        <div className={`${CARD} p-16 text-center`}>
          <MapPin size={36} className="text-slate-300 dark:text-gray-600 mx-auto mb-3" />
          <h3 className="font-semibold text-slate-600 dark:text-gray-300 mb-1">{t('analytics.noFloors', 'No floor plans configured yet')}</h3>
          <p className="text-sm text-slate-400 dark:text-gray-500 mb-5">
            {t('analytics.noFloorsSub', 'Upload your store layout and place cameras to generate heatmap analytics.')}
          </p>
          <button
            onClick={() => setShowSetup(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <Plus size={15} /> {t('analytics.addFirst', 'Add Your First Floor')}
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
                {selectedFloor.status === 'done' ? t('analytics.unifiedHeatmap', 'Unified Heatmap') : t('analytics.floorPreview', 'Floor Plan Preview')}
              </span>
            </h3>

            {isProcessing ? (
              <div className="h-64 bg-slate-50 dark:bg-gray-800 rounded-xl flex flex-col items-center justify-center gap-3">
                <Loader2 size={28} className="animate-spin text-indigo-500" />
                <p className="text-sm text-slate-600 dark:text-gray-300 font-medium">{t('analytics.runningCv', 'Running CV pipeline…')}</p>
                <p className="text-xs text-slate-400 dark:text-gray-500">{t('analytics.yoloPoll', 'YOLOv8 detection · polling every 3 s')}</p>
              </div>
            ) : selectedFloor.status === 'error' ? (
              <div className="h-48 bg-red-50 dark:bg-red-950/30 rounded-xl flex flex-col items-center justify-center gap-2 border border-red-100 dark:border-red-900">
                <AlertTriangle size={22} className="text-red-400" />
                <p className="text-sm text-red-600 dark:text-red-400 font-medium">{t('analytics.processingFailed', 'Processing failed')}</p>
                <p className="text-xs text-red-400 dark:text-red-500">{t('analytics.processingFailedSub', 'Upload videos and click "Generate Heatmap" to retry')}</p>
              </div>
            ) : selectedFloor.status === 'done' && selectedFloor.heatmap_url ? (
              <>
                <img src={selectedFloor.heatmap_url} alt="Heatmap" className="w-full rounded-xl" />
                <div className="flex gap-4 mt-3 text-xs text-slate-500 dark:text-gray-400">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-red-500 rounded-sm" /> {t('analytics.legendHigh', 'High')}</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-yellow-400 rounded-sm" /> {t('analytics.legendMedium', 'Medium')}</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-blue-500 rounded-sm" /> {t('analytics.legendLow', 'Low')}</span>
                </div>
              </>
            ) : selectedFloor.floor_plan_url ? (
              <>
                <img src={selectedFloor.floor_plan_url} alt="Floor plan" className="w-full rounded-xl opacity-60" />
                <p className="text-xs text-slate-400 dark:text-gray-500 mt-2 text-center">
                  {t('analytics.uploadCctv', 'Upload CCTV footage and generate a heatmap to see customer traffic')}
                </p>
              </>
            ) : (
              <div className="h-64 bg-slate-50 dark:bg-gray-800 rounded-xl flex items-center justify-center text-slate-400 dark:text-gray-500 text-sm">
                {t('analytics.noImage', 'No image available')}
              </div>
            )}
          </div>

          {/* Camera feeds */}
          <div className={`${CARD} p-5 flex flex-col gap-4`}>
            <h3 className="font-semibold text-slate-800 dark:text-gray-100 text-sm flex items-center gap-2 shrink-0">
              <Camera size={14} className="text-indigo-500" /> {t('analytics.cameraFeeds', 'Camera Feeds')}
            </h3>

            {!selectedFloor.cameras?.length ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-slate-400 dark:text-gray-500 text-center leading-relaxed">
                  {t('analytics.noCameras', 'No cameras placed yet.')}<br />
                  {t('analytics.noCamerasSub', 'Click Edit Camera Layout to add cameras.')}
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
                            <Loader2 size={11} className="animate-spin" /> {t('analytics.uploading', 'Uploading')}
                          </span>
                        ) : (uploadDone || hasExisting) ? (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <CheckCircle size={11} className="text-green-500" />
                            <label className="text-xs text-slate-400 dark:text-gray-500 cursor-pointer hover:text-indigo-500 underline underline-offset-2">
                              {t('analytics.replace', 'Replace')}<input type="file" accept="video/*" className="hidden" onChange={e => handleFilePicked(cam.id, e.target.files[0])} />
                            </label>
                          </div>
                        ) : uploadError ? (
                          <label className="flex items-center gap-1 text-xs text-red-500 cursor-pointer hover:text-red-700 shrink-0">
                            <Upload size={11} /> {t('analytics.retry', 'Retry')}<input type="file" accept="video/*" className="hidden" onChange={e => handleFilePicked(cam.id, e.target.files[0])} />
                          </label>
                        ) : (
                          <label className="flex items-center gap-1 text-xs text-indigo-600 cursor-pointer hover:text-indigo-800 shrink-0">
                            <Upload size={11} /> {t('analytics.upload', 'Upload')}<input type="file" accept="video/*" className="hidden" onChange={e => handleFilePicked(cam.id, e.target.files[0])} />
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
                        <Loader2 size={14} className="animate-spin" /> {t('analytics.pipelineRunning', 'Pipeline running…')}
                      </div>
                    );
                    if (hasAnyVideo) return (
                      <button
                        onClick={handleRecalibrate}
                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
                      >
                        <Play size={14} />
                        {selectedFloor.status === 'done' ? t('analytics.recalibrateHeatmap', 'Recalibrate Heatmap') : t('analytics.generateHeatmap', 'Generate Heatmap')}
                      </button>
                    );
                    return <p className="text-xs text-slate-400 dark:text-gray-500 text-center py-2">{t('analytics.uploadAtLeastOne', 'Upload at least one camera feed.')}</p>;
                  })()}
                </div>

                {selectedFloor.status === 'done' && (
                  <p className="text-xs text-slate-500 dark:text-gray-400 border-t border-slate-100 dark:border-gray-800 pt-2 shrink-0">
                    {t('analytics.totalDetected', 'Total detected:')} <strong className="text-slate-700 dark:text-gray-200">{selectedFloor.total_people}</strong>
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
            <Clock size={14} className="text-indigo-500" /> {t('analytics.zoneSummary', 'Camera Zone Summary')}
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
              <p className="text-xs text-slate-400 dark:text-gray-500 mt-2">{t('analytics.people', 'People:')} {zone.people_count} · {t('analytics.score', 'Score:')} {zone.density_score}</p>
            </div>
          )) : (
            <div className="col-span-3 text-center py-12 text-slate-400 dark:text-gray-500">{t('analytics.noZoneData', 'No zone data available')}</div>
          )}
        </div>
      )}

      {/* Journeys tab */}
      {activeTab === 'journeys' && selectedFloor?.status === 'done' && (
        <JourneysTab
          floor={selectedFloor}
          trajectories={trajectories}
          loading={trajLoading}
        />
      )}

      {/* Modals */}
      {showSetup && <FloorPlanSetup onClose={() => setShowSetup(false)} onComplete={() => loadData()} />}
      {editingFloor && <FloorPlanSetup editSession={editingFloor} onClose={() => setEditingFloor(null)} onComplete={() => { setEditingFloor(null); loadData(); }} />}

      {/* Footage timestamp popup */}
      {pendingUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-gray-800 p-6 w-80 space-y-4">
            <div>
              <h3 className="font-semibold text-slate-800 dark:text-gray-100 text-sm">{t('analytics.whenRecorded', 'When was this recorded?')}</h3>
              <p className="text-xs text-slate-400 dark:text-gray-500 mt-0.5">
                {pendingUpload.file.name}
              </p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600 dark:text-gray-400">{t('analytics.dateTime', 'Date & Time')}</label>
              <input
                type="datetime-local"
                value={pendingUpload.recordedAt}
                onChange={e => setPendingUpload(p => ({ ...p, recordedAt: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-gray-700
                  bg-white dark:bg-gray-800 text-slate-800 dark:text-gray-100
                  focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-xs text-slate-400 dark:text-gray-500">
                {t('analytics.preFilledNow', 'Pre-filled to now — edit if the footage is from a different time.')}
              </p>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setPendingUpload(null)}
                className="flex-1 py-2 text-sm rounded-xl border border-slate-200 dark:border-gray-700
                  text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors"
              >
                {t('analytics.cancel', 'Cancel')}
              </button>
              <button
                onClick={confirmPendingUpload}
                className="flex-1 py-2 text-sm rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition-colors"
              >
                {t('analytics.upload', 'Upload')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Customer Journeys Tab ─────────────────────────────────────────────────────

function JourneysTab({ floor, trajectories, loading }) {
  const canvasRef         = useRef(null);
  const animRef           = useRef(null);
  const floorImgRef       = useRef(null);
  const floorImgLoadedRef = useRef(false);

  const [mode,        setMode]        = useState('individual'); // 'individual' | 'crowd'
  const [playhead,    setPlayhead]    = useState(0);
  const [isPlaying,   setIsPlaying]   = useState(false);
  const [speed,       setSpeed]       = useState(1);
  const [highlight,   setHighlight]   = useState(null);  // customer_id or null = all
  const [showHeatmap, setShowHeatmap] = useState(true);

  // Stop playback when switching to crowd mode
  useEffect(() => { if (mode === 'crowd') setIsPlaying(false); }, [mode]);

  const duration  = trajectories?.duration  || 0;
  const customers = trajectories?.customers || [];

  const CARD = 'bg-white dark:bg-gray-900 rounded-2xl border border-slate-100 dark:border-gray-800 shadow-sm';

  // Pre-load the floor plan image
  useEffect(() => {
    if (!floor?.floor_plan_url) return;
    const img = new Image();
    img.src = floor.floor_plan_url;
    img.onload = () => { floorImgRef.current = img; floorImgLoadedRef.current = true; drawFrame(playhead); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floor?.floor_plan_url]);

  // Animation loop
  useEffect(() => {
    if (!isPlaying) { if (animRef.current) cancelAnimationFrame(animRef.current); return; }
    let last = null;
    const tick = (ts) => {
      if (last === null) last = ts;
      const dt = ((ts - last) / 1000) * speed;
      last = ts;
      setPlayhead(prev => {
        const next = prev + dt;
        if (next >= duration) { setIsPlaying(false); return duration; }
        return next;
      });
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [isPlaying, speed, duration]);

  // Draw whenever playhead changes
  const drawFrame = useCallback((t) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Floor plan background
    if (floorImgLoadedRef.current && floorImgRef.current) {
      ctx.drawImage(floorImgRef.current, 0, 0, W, H);
    } else {
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(0, 0, W, H);
    }

    if (!customers.length) return;

    const visible = highlight ? customers.filter(c => c.customer_id === highlight) : customers;

    for (const customer of visible) {
      const { path, color } = customer;
      const pastPts = path.filter(p => p.t <= t);
      if (!pastPts.length) continue;

      // Trail — last 30 points
      const trail = pastPts.slice(-30);
      for (let i = 1; i < trail.length; i++) {
        const alpha = Math.round((i / trail.length) * 180).toString(16).padStart(2, '0');
        ctx.beginPath();
        ctx.strokeStyle = color + alpha;
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.moveTo(trail[i - 1].x_pct / 100 * W, trail[i - 1].y_pct / 100 * H);
        ctx.lineTo(trail[i].x_pct / 100 * W, trail[i].y_pct / 100 * H);
        ctx.stroke();
      }

      // Interpolate current position
      const last = pastPts[pastPts.length - 1];
      const next = path.find(p => p.t > t);
      let cx = last.x_pct / 100 * W;
      let cy = last.y_pct / 100 * H;
      if (next) {
        const a = (t - last.t) / (next.t - last.t);
        cx = ((last.x_pct + a * (next.x_pct - last.x_pct)) / 100) * W;
        cy = ((last.y_pct + a * (next.y_pct - last.y_pct)) / 100) * H;
      }

      // Dot with pulse ring
      const isHighlighted = highlight === customer.customer_id;
      if (isHighlighted) {
        ctx.beginPath();
        ctx.arc(cx, cy, 14, 0, Math.PI * 2);
        ctx.fillStyle = color + '33';
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(cx, cy, isHighlighted ? 9 : 7, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Label
      ctx.font = `bold ${isHighlighted ? 10 : 8}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText(customer.customer_id, cx, cy);
    }
  }, [customers, highlight]);

  useEffect(() => { drawFrame(playhead); }, [playhead, drawFrame, showHeatmap]);

  const fmt = (s) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${Math.floor(s % 60).toString().padStart(2, '0')}`;

  if (loading) return (
    <div className={`${CARD} p-16 flex flex-col items-center gap-3`}>
      <Loader2 size={24} className="animate-spin text-indigo-400" />
      <p className="text-sm text-slate-500 dark:text-gray-400">Loading journey data…</p>
    </div>
  );

  if (!trajectories || !customers.length) return (
    <div className={`${CARD} p-12 flex flex-col items-center gap-3 text-center`}>
      <Footprints size={36} className="text-slate-300 dark:text-gray-600" />
      <p className="text-sm font-medium text-slate-500 dark:text-gray-400">No journey data yet</p>
      <p className="text-xs text-slate-400 dark:text-gray-500 max-w-sm">
        Journey tracking requires camera videos with visible people.
        Re-process this floor plan — the updated pipeline will extract
        per-customer paths and project them onto your store map.
      </p>
    </div>
  );

  const floorUrl = floor?.heatmap_url || floor?.floor_plan_url;

  const statCards = [
    { label: 'Total Customers', value: customers.length,          icon: <Users size={14} className="text-indigo-400"/> },
    { label: 'Tracked Duration', value: fmt(duration),            icon: <Clock size={14} className="text-emerald-400"/> },
    { label: 'Cameras Used',    value: trajectories.num_cameras ?? '—', icon: <Camera size={14} className="text-amber-400"/> },
  ];

  return (
    <div className="space-y-4">

      {/* ── Mode toggle ── */}
      <div className="flex items-center gap-3">
        <div className="flex bg-slate-100 dark:bg-gray-800 p-1 rounded-xl">
          {[
            { id: 'individual', label: 'Individual Paths', icon: <Footprints size={12}/> },
            { id: 'crowd',      label: 'Crowd Flow',       icon: <Wind size={12}/> },
          ].map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm transition-colors ${
                mode === m.id
                  ? 'bg-white dark:bg-gray-700 text-slate-800 dark:text-gray-100 shadow-sm font-medium'
                  : 'text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200'
              }`}
            >
              {m.icon}{m.label}
            </button>
          ))}
        </div>
        {mode === 'crowd' && (
          <p className="text-xs text-slate-400 dark:text-gray-500">
            Auto-playing · average traffic direction across all tracked customers
          </p>
        )}
      </div>

      {/* ── Individual Paths mode ── */}
      {mode === 'individual' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">

          {/* Canvas + Controls */}
          <div className="lg:col-span-3 space-y-3">
            <div className={`${CARD} overflow-hidden`}>
              <canvas
                ref={canvasRef}
                width={900}
                height={540}
                className="w-full rounded-t-2xl bg-slate-50 dark:bg-gray-800"
              />
              <div className="px-4 py-3 border-t border-slate-100 dark:border-gray-800 flex items-center gap-3">
                <button onClick={() => { setIsPlaying(false); setPlayhead(0); }}
                  className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-gray-200 transition-colors">
                  <SkipBack size={16}/>
                </button>
                <button
                  onClick={() => { if (playhead >= duration) setPlayhead(0); setIsPlaying(p => !p); }}
                  className="flex items-center justify-center w-9 h-9 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shadow-sm">
                  {isPlaying ? <Pause size={16}/> : <Play size={16} className="ml-0.5"/>}
                </button>
                <button onClick={() => { setIsPlaying(false); setPlayhead(duration); }}
                  className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-gray-200 transition-colors">
                  <SkipForward size={16}/>
                </button>
                <input
                  type="range" min={0} max={duration} step={0.1} value={playhead}
                  onChange={e => { setIsPlaying(false); setPlayhead(parseFloat(e.target.value)); }}
                  className="flex-1 accent-indigo-600 cursor-pointer"
                />
                <span className="text-xs font-mono text-slate-500 dark:text-gray-400 shrink-0">
                  {fmt(playhead)} / {fmt(duration)}
                </span>
                <select
                  value={speed}
                  onChange={e => setSpeed(parseFloat(e.target.value))}
                  className="text-xs border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-200 rounded-lg px-2 py-1 shrink-0">
                  {[0.25, 0.5, 1, 2, 5, 10].map(s => <option key={s} value={s}>{s}×</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {statCards.map(s => (
                <div key={s.label} className={`${CARD} p-4 flex items-center gap-3`}>
                  <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-gray-800 flex items-center justify-center shrink-0">{s.icon}</div>
                  <div>
                    <p className="text-[11px] text-slate-400 dark:text-gray-500 uppercase tracking-wide">{s.label}</p>
                    <p className="text-lg font-bold text-slate-800 dark:text-gray-100">{s.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Customer list */}
          <div className={`${CARD} p-4 flex flex-col gap-3 overflow-y-auto max-h-[600px]`}>
            <p className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
              <Activity size={12}/> Customers
            </p>
            <button
              onClick={() => setHighlight(null)}
              className={`text-xs px-3 py-2 rounded-lg border transition-colors text-left ${
                highlight === null
                  ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-semibold'
                  : 'border-slate-200 dark:border-gray-700 text-slate-500 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800'
              }`}>
              All customers
            </button>
            {customers.map(c => {
              const firstPt  = c.path[0];
              const lastPt   = c.path[c.path.length - 1];
              const visitDur = Math.round(lastPt.t - firstPt.t);
              const isOn     = c.path.some(p => p.t <= playhead);
              return (
                <button
                  key={c.customer_id}
                  onClick={() => setHighlight(prev => prev === c.customer_id ? null : c.customer_id)}
                  className={`text-xs rounded-xl border p-3 transition-colors text-left ${
                    highlight === c.customer_id
                      ? 'border-2 shadow-sm'
                      : 'border-slate-100 dark:border-gray-800 hover:bg-slate-50 dark:hover:bg-gray-800'
                  }`}
                  style={highlight === c.customer_id ? { borderColor: c.color, background: c.color + '15' } : {}}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ background: c.color }}/>
                    <span className="font-semibold text-slate-800 dark:text-gray-100">{c.customer_id}</span>
                    {isOn && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400"/>}
                  </div>
                  <p className="text-slate-400 dark:text-gray-500">{fmt(firstPt.t)} → {fmt(lastPt.t)}</p>
                  <p className="text-slate-400 dark:text-gray-500">
                    {visitDur}s · {c.camera_ids?.length ?? 1} camera{c.camera_ids?.length !== 1 ? 's' : ''}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Crowd Flow mode ── */}
      {mode === 'crowd' && (
        <div className="space-y-4">
          <div className={`${CARD} overflow-hidden`}>
            <CrowdFlowCanvas floorPlanUrl={floorUrl} trajectories={trajectories} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            {statCards.map(s => (
              <div key={s.label} className={`${CARD} p-4 flex items-center gap-3`}>
                <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-gray-800 flex items-center justify-center shrink-0">{s.icon}</div>
                <div>
                  <p className="text-[11px] text-slate-400 dark:text-gray-500 uppercase tracking-wide">{s.label}</p>
                  <p className="text-lg font-bold text-slate-800 dark:text-gray-100">{s.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Crowd Flow Canvas (shared with Dashboard) ────────────────────────────────

const _FLOW_GRID_W = 9;
const _FLOW_GRID_H = 6;

function _computeFlowField(customers) {
  const grid = Array.from({ length: _FLOW_GRID_H }, () =>
    Array.from({ length: _FLOW_GRID_W }, () => ({ dx: 0, dy: 0, count: 0 }))
  );
  for (const c of customers) {
    for (let i = 0; i < c.path.length - 1; i++) {
      const p1 = c.path[i], p2 = c.path[i + 1];
      const dx = p2.x_pct - p1.x_pct, dy = p2.y_pct - p1.y_pct;
      if (Math.hypot(dx, dy) < 0.3) continue;
      const gx = Math.min(_FLOW_GRID_W - 1, Math.floor(p1.x_pct / 100 * _FLOW_GRID_W));
      const gy = Math.min(_FLOW_GRID_H - 1, Math.floor(p1.y_pct / 100 * _FLOW_GRID_H));
      grid[gy][gx].dx += dx; grid[gy][gx].dy += dy; grid[gy][gx].count++;
    }
  }
  let maxCount = 1;
  for (let gy = 0; gy < _FLOW_GRID_H; gy++)
    for (let gx = 0; gx < _FLOW_GRID_W; gx++)
      if (grid[gy][gx].count > maxCount) maxCount = grid[gy][gx].count;

  const cells = [];
  for (let gy = 0; gy < _FLOW_GRID_H; gy++) {
    for (let gx = 0; gx < _FLOW_GRID_W; gx++) {
      const { dx, dy, count } = grid[gy][gx];
      if (!count) continue;
      const mag = Math.hypot(dx, dy);
      cells.push({
        gx, gy,
        cx: (gx + 0.5) / _FLOW_GRID_W,
        cy: (gy + 0.5) / _FLOW_GRID_H,
        ndx: dx / mag, ndy: dy / mag,
        strength: Math.min(1, count / maxCount),
      });
    }
  }
  return cells;
}

function CrowdFlowCanvas({ floorPlanUrl, trajectories }) {
  const canvasRef = useRef(null);
  const animRef   = useRef(null);
  const imgRef    = useRef(null);
  const imgReady  = useRef(false);
  const tRef      = useRef(0);

  const flow = useMemo(() =>
    trajectories?.customers?.length ? _computeFlowField(trajectories.customers) : [],
  [trajectories]);

  useEffect(() => {
    imgReady.current = false;
    if (!floorPlanUrl) return;
    const img = new Image();
    img.src = floorPlanUrl;
    img.onload = () => { imgRef.current = img; imgReady.current = true; };
  }, [floorPlanUrl]);

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
        ctx.drawImage(imgRef.current, 0, 0, W, H);
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(0, 0, W, H);
      } else {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, W, H);
      }

      if (!flow.length) {
        ctx.font = '11px system-ui';
        ctx.fillStyle = 'rgba(148,163,184,0.8)';
        ctx.textAlign = 'center';
        ctx.fillText('No trajectory data — reprocess to enable crowd flow', W / 2, H - 12);
        animRef.current = requestAnimationFrame(draw);
        return;
      }

      const cellW = W / _FLOW_GRID_W, cellH = H / _FLOW_GRID_H;

      for (const f of flow) {
        const cx = f.cx * W, cy = f.cy * H;
        const arrowHalf = Math.min(cellW, cellH) * 0.38 * (0.5 + f.strength * 0.5);
        const sx = cx - f.ndx * arrowHalf, sy = cy - f.ndy * arrowHalf;
        const ex = cx + f.ndx * arrowHalf, ey = cy + f.ndy * arrowHalf;
        const shaftAlpha = 0.72 + f.strength * 0.25;
        const ang        = Math.atan2(f.ndy, f.ndx);
        const headLen    = 8 * f.strength + 5;

        ctx.lineCap  = 'round';
        ctx.lineJoin = 'round';

        // Soft drop-shadow separates from any heatmap color without harsh edges
        ctx.shadowColor   = 'rgba(0,0,0,0.65)';
        ctx.shadowBlur    = 5;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 1.5;

        // ── Arrow shaft ──
        ctx.beginPath();
        ctx.strokeStyle = `rgba(255,255,255,${shaftAlpha})`;
        ctx.lineWidth   = 2;
        ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();

        // ── Arrowhead ──
        ctx.beginPath();
        ctx.fillStyle = `rgba(255,255,255,${shaftAlpha})`;
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - headLen * Math.cos(ang - Math.PI / 5.5), ey - headLen * Math.sin(ang - Math.PI / 5.5));
        ctx.lineTo(ex - headLen * Math.cos(ang + Math.PI / 5.5), ey - headLen * Math.sin(ang + Math.PI / 5.5));
        ctx.closePath(); ctx.fill();

        // Reset shadow before drawing droplet (glow uses its own technique)
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur  = 0;
        ctx.shadowOffsetY = 0;

        // ── Animated droplet ──
        const phase    = ((f.gx * 1.618 + f.gy * 2.414) % 1);
        const progress = ((t * 0.45 + phase) % 1);
        const dotX     = sx + (ex - sx) * progress;
        const dotY     = sy + (ey - sy) * progress;
        const dotAlpha = Math.sin(progress * Math.PI) * (0.5 + f.strength * 0.5);
        const dotR     = 3.5 * f.strength + 2;

        // Soft glow (drawn via shadow on the core circle)
        ctx.shadowColor = `rgba(255,255,255,${dotAlpha * 0.6})`;
        ctx.shadowBlur  = 8;
        ctx.beginPath();
        ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${dotAlpha})`;
        ctx.fill();

        ctx.shadowColor = 'transparent';
        ctx.shadowBlur  = 0;
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [flow, floorPlanUrl]);

  return (
    <canvas ref={canvasRef} width={1100} height={560} className="w-full rounded-2xl" />
  );
}

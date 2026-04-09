import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Upload, Camera, Trash2, CheckCircle, Loader2, X,
  Play, Maximize2, Minimize2,
} from 'lucide-react';
import {
  createFloorPlanSession, saveCameraLayout,
  uploadCameraVideo, processFloorPlan, getFloorPlanStatus,
} from '../api';

const CAM_COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
];

function generateId() {
  return Math.random().toString(36).slice(2, 9);
}

// ── Step 0: Name & Upload Floor Plan (create mode only) ───────────────────────
function StepUploadPlan({ onDone }) {
  const [floorName, setFloorName] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef();

  const handleFile = (f) => {
    if (!f || !f.type.startsWith('image/')) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleSubmit = async () => {
    if (!floorName.trim()) { alert('Please enter a floor name'); return; }
    if (!file) { alert('Please upload a floor plan image'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('floor_name', floorName.trim());
      const res = await createFloorPlanSession(fd);
      onDone(res.data.session_id, res.data.floor_plan_url);
    } catch (e) {
      alert('Upload failed: ' + (e.response?.data?.detail || e.message));
    }
    setUploading(false);
  };

  return (
    <div className="space-y-5 max-w-xl mx-auto">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Floor Name</label>
        <input
          value={floorName}
          onChange={(e) => setFloorName(e.target.value)}
          placeholder="e.g. Ground Floor, Electronics Section, 2nd Floor..."
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Floor Plan Image</label>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
          onClick={() => !file && inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl transition-colors
            ${file ? 'border-indigo-300 bg-indigo-50/30' : dragging
              ? 'border-indigo-500 bg-indigo-50 cursor-copy'
              : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50 cursor-pointer'}`}
        >
          {preview ? (
            <div className="relative">
              <img src={preview} alt="Preview" className="w-full max-h-72 object-contain rounded-xl" />
              <button
                onClick={(e) => { e.stopPropagation(); setFile(null); setPreview(null); }}
                className="absolute top-2 right-2 bg-white rounded-full p-1 shadow text-slate-500 hover:text-red-500"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <div className="py-16 text-center">
              <Upload size={32} className="text-slate-400 mx-auto mb-2" />
              <p className="text-sm text-slate-600">Drag & drop or click to upload</p>
              <p className="text-xs text-slate-400 mt-1">PNG, JPG, WEBP — top-down store layout</p>
            </div>
          )}
        </div>
        <input ref={inputRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => handleFile(e.target.files[0])} />
      </div>

      <button
        onClick={handleSubmit}
        disabled={uploading || !file || !floorName.trim()}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
      >
        {uploading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
        {uploading ? 'Uploading...' : 'Continue to Camera Placement'}
      </button>
    </div>
  );
}

// ── Step 1: Place / Edit Cameras ──────────────────────────────────────────────
function StepPlaceCameras({ sessionId, floorPlanUrl, cameras, setCameras, onDone, onSaveClose }) {
  const containerRef = useRef();
  const [draggingCam, setDraggingCam] = useState(null);
  const [didDrag, setDidDrag] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleMapClick = (e) => {
    if (didDrag) { setDidDrag(false); return; }
    const rect = containerRef.current.getBoundingClientRect();
    const x_pct = ((e.clientX - rect.left) / rect.width) * 100;
    const y_pct = ((e.clientY - rect.top) / rect.height) * 100;
    setCameras((prev) => [...prev, {
      id: generateId(),
      name: `Camera ${prev.length + 1}`,
      x_pct: parseFloat(x_pct.toFixed(2)),
      y_pct: parseFloat(y_pct.toFixed(2)),
    }]);
  };

  const onMouseDown = (e, camId) => {
    e.stopPropagation();
    const rect = containerRef.current.getBoundingClientRect();
    const cam = cameras.find((c) => c.id === camId);
    setDraggingCam({
      id: camId,
      startMouseX: e.clientX, startMouseY: e.clientY,
      origX: cam.x_pct, origY: cam.y_pct,
      rectW: rect.width, rectH: rect.height,
    });
  };

  const onMouseMove = useCallback((e) => {
    if (!draggingCam) return;
    setDidDrag(true);
    const dx = ((e.clientX - draggingCam.startMouseX) / draggingCam.rectW) * 100;
    const dy = ((e.clientY - draggingCam.startMouseY) / draggingCam.rectH) * 100;
    setCameras((prev) => prev.map((c) => c.id === draggingCam.id
      ? {
          ...c,
          x_pct: Math.min(100, Math.max(0, draggingCam.origX + dx)),
          y_pct: Math.min(100, Math.max(0, draggingCam.origY + dy)),
        }
      : c));
  }, [draggingCam, setCameras]);

  const onMouseUp = useCallback(() => setDraggingCam(null), []);

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  const saveLayout = async () => {
    if (!cameras.length) { alert('Place at least one camera first'); return false; }
    setSaving(true);
    try {
      await saveCameraLayout(sessionId, cameras);
      return true;
    } catch (e) {
      alert('Save failed: ' + (e.response?.data?.detail || e.message));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleContinue = async () => {
    const ok = await saveLayout();
    if (ok) onDone();
  };

  const handleSaveClose = async () => {
    const ok = await saveLayout();
    if (ok) onSaveClose();
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      <p className="text-xs text-slate-500 shrink-0">
        <strong>Click</strong> on the map to add a camera. <strong>Drag</strong> an existing camera to reposition it. Rename cameras in the panel on the right. Removed cameras will lose their associated video when saved.
      </p>

      {/* Main layout: map + sidebar */}
      <div className="flex gap-3 flex-1 min-h-0" style={{ minHeight: 340 }}>
        {/* Floor plan map */}
        <div className="flex-1 min-w-0">
          <div
            ref={containerRef}
            onClick={handleMapClick}
            className="relative w-full h-full rounded-xl overflow-hidden border-2 border-indigo-200 cursor-crosshair select-none bg-slate-50"
          >
            <img
              src={floorPlanUrl}
              alt="Floor plan"
              className="w-full h-full object-contain block pointer-events-none"
              draggable={false}
            />
            {cameras.map((cam, i) => (
              <div
                key={cam.id}
                onMouseDown={(e) => onMouseDown(e, cam.id)}
                style={{
                  position: 'absolute',
                  left: `${cam.x_pct}%`,
                  top: `${cam.y_pct}%`,
                  transform: 'translate(-50%, -50%)',
                  cursor: 'grab',
                  zIndex: 10,
                }}
              >
                <div
                  style={{ background: CAM_COLORS[i % CAM_COLORS.length] }}
                  className="w-7 h-7 rounded-full flex items-center justify-center shadow-lg border-2 border-white"
                >
                  <Camera size={13} className="text-white" />
                </div>
                <div
                  style={{
                    background: CAM_COLORS[i % CAM_COLORS.length],
                    position: 'absolute',
                    top: '100%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    marginTop: 3,
                    whiteSpace: 'nowrap',
                  }}
                  className="px-1.5 py-0.5 rounded text-white text-xs font-medium shadow"
                >
                  {cam.name}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Camera list panel */}
        <div className="w-52 shrink-0 flex flex-col gap-2 overflow-y-auto">
          <p className="text-xs font-medium text-slate-500 shrink-0">
            {cameras.length} camera{cameras.length !== 1 ? 's' : ''}
          </p>
          {cameras.length === 0 && (
            <p className="text-xs text-slate-400">Click the map to add cameras</p>
          )}
          {cameras.map((cam, i) => (
            <div key={cam.id} className="flex items-center gap-1.5">
              <div
                style={{ background: CAM_COLORS[i % CAM_COLORS.length] }}
                className="w-4 h-4 rounded-full shrink-0"
              />
              <input
                value={cam.name}
                onChange={(e) =>
                  setCameras((prev) =>
                    prev.map((c) => c.id === cam.id ? { ...c, name: e.target.value } : c)
                  )
                }
                className="flex-1 min-w-0 px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button
                onClick={() => setCameras((prev) => prev.filter((c) => c.id !== cam.id))}
                className="text-slate-300 hover:text-red-400 shrink-0"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 shrink-0">
        <button
          onClick={handleContinue}
          disabled={!cameras.length || saving}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
          {saving ? 'Saving...' : 'Save & Continue to Videos'}
        </button>
        <button
          onClick={handleSaveClose}
          disabled={!cameras.length || saving}
          className="px-4 py-2.5 border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50 disabled:opacity-40"
        >
          Save & Close
        </button>
      </div>
    </div>
  );
}

// ── Step 2: Upload Footage (optional) ─────────────────────────────────────────
function StepUploadFootage({ sessionId, cameras, existingVideos, onDone, onClose }) {
  const [uploads, setUploads] = useState(() => {
    const init = {};
    cameras.forEach((cam) => {
      if (existingVideos?.[cam.id]) {
        init[cam.id] = { status: 'existing', filename: 'Previously uploaded' };
      }
    });
    return init;
  });
  const [processing, setProcessing] = useState(false);

  const handleVideoUpload = async (camId, file) => {
    if (!file) return;
    setUploads((prev) => ({ ...prev, [camId]: { status: 'uploading', filename: file.name } }));
    try {
      const fd = new FormData();
      fd.append('file', file);
      await uploadCameraVideo(sessionId, camId, fd);
      setUploads((prev) => ({ ...prev, [camId]: { status: 'done', filename: file.name } }));
    } catch (e) {
      setUploads((prev) => ({ ...prev, [camId]: { status: 'error', filename: file.name } }));
      alert('Upload failed: ' + (e.response?.data?.detail || e.message));
    }
  };

  const readyCount = cameras.filter((cam) =>
    ['done', 'existing'].includes(uploads[cam.id]?.status)
  ).length;

  const handleProcess = async () => {
    setProcessing(true);
    try {
      await processFloorPlan(sessionId);
      onDone();
    } catch (e) {
      alert('Processing failed: ' + (e.response?.data?.detail || e.message));
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
        <p className="text-xs text-amber-700">
          <strong>This step is optional.</strong> Upload CCTV footage to generate heatmaps. You can close now and upload videos later by clicking <strong>Edit</strong> on this floor in Store Analytics.
        </p>
      </div>

      <div className="space-y-2 max-h-80 overflow-auto">
        {cameras.map((cam, i) => {
          const upload = uploads[cam.id];
          return (
            <div key={cam.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
              <div
                style={{ background: CAM_COLORS[i % CAM_COLORS.length] }}
                className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
              >
                <Camera size={12} className="text-white" />
              </div>
              <span className="text-sm font-medium text-slate-700 flex-1 min-w-0 truncate">
                {cam.name}
              </span>

              {upload?.status === 'uploading' ? (
                <span className="flex items-center gap-1 text-xs text-indigo-500 shrink-0">
                  <Loader2 size={12} className="animate-spin" /> Uploading...
                </span>
              ) : upload?.status === 'done' ? (
                <span className="flex items-center gap-1 text-xs text-green-600 shrink-0">
                  <CheckCircle size={12} />
                  {upload.filename.length > 20 ? upload.filename.slice(0, 20) + '…' : upload.filename}
                </span>
              ) : upload?.status === 'existing' ? (
                <div className="flex items-center gap-2 shrink-0">
                  <span className="flex items-center gap-1 text-xs text-green-600">
                    <CheckCircle size={12} /> Uploaded
                  </span>
                  <label className="text-xs text-slate-400 cursor-pointer hover:text-indigo-500 underline underline-offset-2">
                    Replace
                    <input
                      type="file" accept="video/*" className="hidden"
                      onChange={(e) => handleVideoUpload(cam.id, e.target.files[0])}
                    />
                  </label>
                </div>
              ) : upload?.status === 'error' ? (
                <label className="flex items-center gap-1 text-xs text-red-500 cursor-pointer hover:text-red-700 shrink-0">
                  <Upload size={12} /> Retry
                  <input
                    type="file" accept="video/*" className="hidden"
                    onChange={(e) => handleVideoUpload(cam.id, e.target.files[0])}
                  />
                </label>
              ) : (
                <label className="flex items-center gap-1 text-xs text-indigo-600 cursor-pointer hover:text-indigo-800 shrink-0">
                  <Upload size={12} /> Upload video
                  <input
                    type="file" accept="video/*" className="hidden"
                    onChange={(e) => handleVideoUpload(cam.id, e.target.files[0])}
                  />
                </label>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleProcess}
          disabled={!readyCount || processing}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {processing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          {processing
            ? 'Starting pipeline...'
            : `Run CV Pipeline (${readyCount} camera${readyCount !== 1 ? 's' : ''})`}
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2.5 border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50"
        >
          Save & Close
        </button>
      </div>

      {!readyCount && (
        <p className="text-xs text-center text-slate-400">
          Upload at least one video to run the CV pipeline, or click "Save & Close" to finish now and add videos later.
        </p>
      )}
    </div>
  );
}

// ── Step 3: Processing ────────────────────────────────────────────────────────
function StepProcessing({ sessionId, onComplete }) {
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await getFloorPlanStatus(sessionId);
        if (res.data.status === 'done') {
          clearInterval(interval);
          onComplete(res.data);
        } else if (res.data.status === 'error') {
          clearInterval(interval);
          alert('Processing error: ' + res.data.error);
        }
      } catch (e) {
        console.error('Poll error', e);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [sessionId, onComplete]);

  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <Loader2 size={40} className="animate-spin text-indigo-500" />
      <p className="text-slate-700 font-medium">Running CV pipeline...</p>
      <p className="text-xs text-slate-400">YOLOv8 detection + Voronoi heatmap fusion — polling every 3s</p>
    </div>
  );
}

// ── Modal wrapper ─────────────────────────────────────────────────────────────
// editSession: { session_id, floor_name, floor_plan_url, cameras: [{id, name, x_pct, y_pct, has_video}] }
export default function FloorPlanSetup({ onClose, onComplete, editSession }) {
  const isEdit = !!editSession;

  // In create mode: step 0=upload map, 1=cameras, 2=videos, 3=processing
  // In edit mode:   step 1=cameras, 2=videos, 3=processing  (step 0 skipped)
  const [step, setStep] = useState(isEdit ? 1 : 0);
  const [expanded, setExpanded] = useState(false);
  const [sessionId, setSessionId] = useState(isEdit ? editSession.session_id : null);
  const [floorPlanUrl, setFloorPlanUrl] = useState(isEdit ? editSession.floor_plan_url : null);
  const [cameras, setCameras] = useState(
    isEdit
      ? (editSession.cameras || []).map((c) => ({ id: c.id, name: c.name, x_pct: c.x_pct, y_pct: c.y_pct }))
      : []
  );

  const STEPS = isEdit
    ? ['Edit Cameras', 'Upload / Update Footage', 'Processing']
    : ['Name & Upload Map', 'Place Cameras', 'Upload Footage', 'Processing'];

  // displayStep: 0-indexed position within STEPS array for the progress bar
  const displayStep = isEdit ? step - 1 : step;

  const existingVideos = isEdit
    ? (editSession.cameras || []).reduce((acc, c) => { acc[c.id] = c.has_video; return acc; }, {})
    : {};

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 ${expanded ? '' : 'p-4'}`}
    >
      <div
        className={`bg-white shadow-2xl flex flex-col overflow-hidden transition-all duration-200 ${
          expanded ? 'w-screen h-screen' : 'w-full max-w-5xl rounded-2xl'
        }`}
        style={!expanded ? { maxHeight: '90vh' } : {}}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <div>
            <h2 className="font-semibold text-slate-800">
              {isEdit ? `Edit Floor: ${editSession.floor_name}` : 'Add Floor & Camera Setup'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Step {displayStep + 1} of {STEPS.length} — {STEPS[displayStep]}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setExpanded((v) => !v)}
              title={expanded ? 'Exit fullscreen' : 'Expand to fullscreen'}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Step progress bar */}
        <div className="flex px-5 pt-3 gap-1 shrink-0">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= displayStep ? 'bg-indigo-500' : 'bg-slate-200'
              }`}
            />
          ))}
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-auto p-5">
          {step === 0 && !isEdit && (
            <StepUploadPlan
              onDone={(sid, url) => { setSessionId(sid); setFloorPlanUrl(url); setStep(1); }}
            />
          )}
          {step === 1 && (
            <StepPlaceCameras
              sessionId={sessionId}
              floorPlanUrl={floorPlanUrl}
              cameras={cameras}
              setCameras={setCameras}
              onDone={() => setStep(2)}
              onSaveClose={onClose}
            />
          )}
          {step === 2 && (
            <StepUploadFootage
              sessionId={sessionId}
              cameras={cameras}
              existingVideos={existingVideos}
              onDone={() => setStep(3)}
              onClose={onClose}
            />
          )}
          {step === 3 && (
            <StepProcessing
              sessionId={sessionId}
              onComplete={(data) => { onComplete(data); onClose(); }}
            />
          )}
        </div>

        {/* Back button */}
        {displayStep > 0 && step < 3 && (
          <div className="px-5 pb-4 pt-2 border-t border-slate-100 shrink-0">
            <button
              onClick={() => setStep((s) => s - 1)}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              ← Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

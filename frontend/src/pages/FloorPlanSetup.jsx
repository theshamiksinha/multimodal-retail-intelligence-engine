import { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, Camera, Trash2, CheckCircle, Loader2, X, Play } from 'lucide-react';
import {
  createFloorPlanSession, saveCameraLayout,
  uploadCameraVideo, processFloorPlan, getFloorPlanStatus,
} from '../api';

const STEPS = ['Name & Upload Map', 'Place Cameras', 'Upload Footage', 'Processing'];

const CAM_COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
];

function generateId() {
  return Math.random().toString(36).slice(2, 9);
}

// ── Step 1 ───────────────────────────────────────────────────────────────────
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
      onDone(res.data.session_id, res.data.floor_plan_url, res.data.floor_name);
    } catch (e) {
      alert('Upload failed: ' + (e.response?.data?.detail || e.message));
    }
    setUploading(false);
  };

  return (
    <div className="space-y-5">
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
              <img src={preview} alt="Preview" className="w-full max-h-64 object-contain rounded-xl" />
              <button
                onClick={(e) => { e.stopPropagation(); setFile(null); setPreview(null); }}
                className="absolute top-2 right-2 bg-white rounded-full p-1 shadow text-slate-500 hover:text-red-500"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <div className="py-12 text-center">
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

// ── Step 2 ───────────────────────────────────────────────────────────────────
function StepPlaceCameras({ sessionId, floorPlanUrl, cameras, setCameras, onDone }) {
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
    setDraggingCam({ id: camId, startMouseX: e.clientX, startMouseY: e.clientY,
      origX: cam.x_pct, origY: cam.y_pct, rectW: rect.width, rectH: rect.height });
  };

  const onMouseMove = useCallback((e) => {
    if (!draggingCam) return;
    setDidDrag(true);
    const dx = ((e.clientX - draggingCam.startMouseX) / draggingCam.rectW) * 100;
    const dy = ((e.clientY - draggingCam.startMouseY) / draggingCam.rectH) * 100;
    setCameras((prev) => prev.map((c) => c.id === draggingCam.id
      ? { ...c, x_pct: Math.min(100, Math.max(0, draggingCam.origX + dx)),
               y_pct: Math.min(100, Math.max(0, draggingCam.origY + dy)) }
      : c));
  }, [draggingCam, setCameras]);

  const onMouseUp = useCallback(() => setDraggingCam(null), []);

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp); };
  }, [onMouseMove, onMouseUp]);

  const handleSave = async () => {
    if (!cameras.length) { alert('Place at least one camera'); return; }
    setSaving(true);
    try {
      await saveCameraLayout(sessionId, cameras);
      onDone();
    } catch (e) {
      alert('Save failed: ' + (e.response?.data?.detail || e.message));
    }
    setSaving(false);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500"><strong>Click</strong> on the map to place a camera. <strong>Drag</strong> to reposition. Rename in the list.</p>
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <div ref={containerRef} onClick={handleMapClick}
            className="relative w-full rounded-xl overflow-hidden border-2 border-indigo-200 cursor-crosshair select-none">
            <img src={floorPlanUrl} alt="Floor plan" className="w-full block pointer-events-none" draggable={false} />
            {cameras.map((cam, i) => (
              <div key={cam.id} onMouseDown={(e) => onMouseDown(e, cam.id)}
                style={{ position: 'absolute', left: `${cam.x_pct}%`, top: `${cam.y_pct}%`,
                  transform: 'translate(-50%,-50%)', cursor: 'grab', zIndex: 10 }}>
                <div style={{ background: CAM_COLORS[i % CAM_COLORS.length] }}
                  className="w-7 h-7 rounded-full flex items-center justify-center shadow-lg border-2 border-white">
                  <Camera size={13} className="text-white" />
                </div>
                <div style={{ background: CAM_COLORS[i % CAM_COLORS.length], position: 'absolute',
                  top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 3, whiteSpace: 'nowrap' }}
                  className="px-1.5 py-0.5 rounded text-white text-xs font-medium shadow">
                  {cam.name}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-2 overflow-auto max-h-80">
          <p className="text-xs font-medium text-slate-500">{cameras.length} camera{cameras.length !== 1 ? 's' : ''}</p>
          {cameras.length === 0 && <p className="text-xs text-slate-400">Click map to add</p>}
          {cameras.map((cam, i) => (
            <div key={cam.id} className="flex items-center gap-1.5">
              <div style={{ background: CAM_COLORS[i % CAM_COLORS.length] }}
                className="w-4 h-4 rounded-full shrink-0" />
              <input value={cam.name}
                onChange={(e) => setCameras((prev) => prev.map((c) => c.id === cam.id ? { ...c, name: e.target.value } : c))}
                className="flex-1 px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500" />
              <button onClick={() => setCameras((prev) => prev.filter((c) => c.id !== cam.id))}
                className="text-slate-300 hover:text-red-400"><Trash2 size={12} /></button>
            </div>
          ))}
        </div>
      </div>
      <button onClick={handleSave} disabled={!cameras.length || saving}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
        {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
        {saving ? 'Saving...' : 'Save Layout & Continue'}
      </button>
    </div>
  );
}

// ── Step 3 ───────────────────────────────────────────────────────────────────
function StepUploadFootage({ sessionId, cameras, onDone }) {
  const [uploads, setUploads] = useState({});
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

  const doneCount = Object.values(uploads).filter((u) => u.status === 'done').length;

  const handleProcess = async () => {
    if (!doneCount) { alert('Upload footage for at least one camera'); return; }
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
    <div className="space-y-3">
      <p className="text-xs text-slate-500">Upload CCTV footage for each camera. Skip cameras with no footage.</p>
      <div className="space-y-2 max-h-72 overflow-auto">
        {cameras.map((cam, i) => {
          const upload = uploads[cam.id];
          return (
            <div key={cam.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
              <div style={{ background: CAM_COLORS[i % CAM_COLORS.length] }}
                className="w-6 h-6 rounded-full flex items-center justify-center shrink-0">
                <Camera size={12} className="text-white" />
              </div>
              <span className="text-sm font-medium text-slate-700 flex-1">{cam.name}</span>
              {upload?.status === 'done' ? (
                <span className="flex items-center gap-1 text-xs text-green-600">
                  <CheckCircle size={12} /> {upload.filename.slice(0, 20)}...
                </span>
              ) : upload?.status === 'uploading' ? (
                <span className="flex items-center gap-1 text-xs text-indigo-500">
                  <Loader2 size={12} className="animate-spin" /> Uploading...
                </span>
              ) : (
                <label className="flex items-center gap-1 text-xs text-indigo-600 cursor-pointer hover:text-indigo-800">
                  <Upload size={12} /> Upload video
                  <input type="file" accept="video/*" className="hidden"
                    onChange={(e) => handleVideoUpload(cam.id, e.target.files[0])} />
                </label>
              )}
            </div>
          );
        })}
      </div>
      <button onClick={handleProcess} disabled={!doneCount || processing}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
        {processing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
        {processing ? 'Starting pipeline...' : `Run CV Pipeline (${doneCount} camera${doneCount !== 1 ? 's' : ''})`}
      </button>
    </div>
  );
}

// ── Step 4 ───────────────────────────────────────────────────────────────────
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
      } catch (e) { console.error('Poll error', e); }
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
export default function FloorPlanSetup({ onClose, onComplete }) {
  const [step, setStep] = useState(0);
  const [sessionId, setSessionId] = useState(null);
  const [floorPlanUrl, setFloorPlanUrl] = useState(null);
  const [cameras, setCameras] = useState([]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <div>
            <h2 className="font-semibold text-slate-800">Add Floor & Camera Setup</h2>
            <p className="text-xs text-slate-400 mt-0.5">Step {step + 1} of {STEPS.length}: {STEPS[step]}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        {/* Step indicator */}
        <div className="flex px-5 pt-4 gap-1">
          {STEPS.map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-indigo-500' : 'bg-slate-200'}`} />
          ))}
        </div>

        {/* Content */}
        <div className="p-5">
          {step === 0 && (
            <StepUploadPlan onDone={(sid, url, name) => {
              setSessionId(sid); setFloorPlanUrl(url); setStep(1);
            }} />
          )}
          {step === 1 && (
            <StepPlaceCameras sessionId={sessionId} floorPlanUrl={floorPlanUrl}
              cameras={cameras} setCameras={setCameras} onDone={() => setStep(2)} />
          )}
          {step === 2 && (
            <StepUploadFootage sessionId={sessionId} cameras={cameras} onDone={() => setStep(3)} />
          )}
          {step === 3 && (
            <StepProcessing sessionId={sessionId} onComplete={(data) => {
              onComplete(data);
              onClose();
            }} />
          )}
        </div>

        {/* Back button */}
        {step > 0 && step < 3 && (
          <div className="px-5 pb-4">
            <button onClick={() => setStep((s) => s - 1)} className="text-xs text-slate-400 hover:text-slate-600">
              ← Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

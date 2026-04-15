import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Upload, Camera, Trash2, CheckCircle, Loader2, X,
  Maximize2, Minimize2,
} from 'lucide-react';
import { createFloorPlanSession, saveCameraLayout } from '../api';

const CAM_COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
];

const INPUT = `w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-gray-700
  bg-white dark:bg-gray-800 text-slate-800 dark:text-gray-100
  placeholder:text-slate-400 dark:placeholder:text-gray-500
  focus:outline-none focus:ring-2 focus:ring-blue-500`;

function generateId() {
  return Math.random().toString(36).slice(2, 9);
}

// ── FOV sector SVG ─────────────────────────────────────────────────────────────
function CameraFOV({ cam, color, cw, ch, onMidDown, onEdgeDown }) {
  const cx  = cam.x_pct / 100 * cw;
  const cy  = cam.y_pct / 100 * ch;
  const r   = Math.max(14, cam.fov_range / 100 * cw);
  const dir = cam.fov_direction * (Math.PI / 180);
  const hs  = (cam.fov_spread / 2) * (Math.PI / 180);

  const x1 = cx + r * Math.cos(dir - hs);
  const y1 = cy + r * Math.sin(dir - hs);
  const x2 = cx + r * Math.cos(dir + hs);
  const y2 = cy + r * Math.sin(dir + hs);
  const mx  = cx + r * Math.cos(dir);
  const my  = cy + r * Math.sin(dir);
  const largeArc = cam.fov_spread > 180 ? 1 : 0;
  const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;

  return (
    <g>
      <path d={d} fill={color} fillOpacity={0.14} stroke={color} strokeOpacity={0.5} strokeWidth={1.5} style={{ pointerEvents: 'none' }} />
      <circle cx={mx} cy={my} r={7} fill={color} stroke="white" strokeWidth={2.5}
        style={{ cursor: 'grab', pointerEvents: 'all' }}
        onMouseDown={e => { e.stopPropagation(); onMidDown(e, cam.id); }} />
      <circle cx={x1} cy={y1} r={5.5} fill="white" stroke={color} strokeWidth={2.5}
        style={{ cursor: 'crosshair', pointerEvents: 'all' }}
        onMouseDown={e => { e.stopPropagation(); onEdgeDown(e, cam.id); }} />
      <circle cx={x2} cy={y2} r={5.5} fill="white" stroke={color} strokeWidth={2.5}
        style={{ cursor: 'crosshair', pointerEvents: 'all' }}
        onMouseDown={e => { e.stopPropagation(); onEdgeDown(e, cam.id); }} />
    </g>
  );
}

// ── Step 0: Upload floor plan ───────────────────────────────────────────────────
function StepUploadPlan({ onDone }) {
  const [floorName, setFloorName] = useState('');
  const [file, setFile]           = useState(null);
  const [preview, setPreview]     = useState(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging]   = useState(false);
  const inputRef = useRef();

  const handleFile = f => {
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
      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-600 dark:text-gray-400">Floor Name</label>
        <input
          value={floorName}
          onChange={e => setFloorName(e.target.value)}
          placeholder="e.g. Ground Floor, Electronics Section…"
          className={INPUT}
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-600 dark:text-gray-400">Floor Plan Image</label>
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
          onClick={() => !file && inputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl transition-colors ${
            file ? 'border-blue-300 dark:border-blue-700 bg-blue-50/30 dark:bg-blue-950/10'
            : dragging ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20 cursor-copy'
            : 'border-slate-200 dark:border-gray-700 hover:border-blue-400 hover:bg-slate-50 dark:hover:bg-gray-800 cursor-pointer'
          }`}
        >
          {preview ? (
            <div className="relative">
              <img src={preview} alt="Preview" className="w-full max-h-64 object-contain rounded-2xl" />
              <button
                onClick={e => { e.stopPropagation(); setFile(null); setPreview(null); }}
                className="absolute top-2 right-2 bg-white dark:bg-gray-900 rounded-full p-1 shadow text-slate-500 hover:text-red-500 transition-colors"
              >
                <X size={13} />
              </button>
            </div>
          ) : (
            <div className="py-14 text-center">
              <Upload size={28} className="text-slate-400 dark:text-gray-500 mx-auto mb-2" />
              <p className="text-sm text-slate-600 dark:text-gray-300">Drag & drop or click to upload</p>
              <p className="text-xs text-slate-400 dark:text-gray-500 mt-1">PNG, JPG, WEBP — top-down store layout</p>
            </div>
          )}
        </div>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={e => handleFile(e.target.files[0])} />
      </div>

      <button
        onClick={handleSubmit}
        disabled={uploading || !file || !floorName.trim()}
        className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {uploading ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle size={15} />}
        {uploading ? 'Uploading…' : 'Continue to Camera Placement'}
      </button>
    </div>
  );
}

// ── Step 1: Place cameras ───────────────────────────────────────────────────────
function StepPlaceCameras({ sessionId, floorPlanUrl, cameras, setCameras, onDone }) {
  const containerRef = useRef();
  const [draggingCam, setDraggingCam]     = useState(null);
  const [fovDrag, setFovDrag]             = useState(null);
  const [didDrag, setDidDrag]             = useState(false);
  const [saving, setSaving]               = useState(false);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const update = () => {
      if (!containerRef.current) return;
      const r = containerRef.current.getBoundingClientRect();
      setContainerSize({ w: r.width, h: r.height });
    };
    update();
    const obs = new ResizeObserver(update);
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const handleMapClick = e => {
    if (didDrag) { setDidDrag(false); return; }
    const rect  = containerRef.current.getBoundingClientRect();
    const x_pct = ((e.clientX - rect.left)  / rect.width)  * 100;
    const y_pct = ((e.clientY - rect.top)   / rect.height) * 100;
    setCameras(prev => [...prev, {
      id: generateId(),
      name: `Camera ${prev.length + 1}`,
      x_pct: parseFloat(x_pct.toFixed(2)),
      y_pct: parseFloat(y_pct.toFixed(2)),
      fov_direction: 90,
      fov_range: 15,
      fov_spread: 60,
    }]);
  };

  const onCamMouseDown = (e, camId) => {
    e.stopPropagation();
    const rect = containerRef.current.getBoundingClientRect();
    const cam  = cameras.find(c => c.id === camId);
    setDraggingCam({ id: camId, startMouseX: e.clientX, startMouseY: e.clientY, origX: cam.x_pct, origY: cam.y_pct, rectW: rect.width, rectH: rect.height });
  };

  const onFovMidDown  = useCallback((e, camId) => {
    const cam = cameras.find(c => c.id === camId);
    if (!cam) return;
    setFovDrag({ type: 'mid', camId, cx_pct: cam.x_pct, cy_pct: cam.y_pct });
  }, [cameras]);

  const onFovEdgeDown = useCallback((e, camId) => {
    const cam = cameras.find(c => c.id === camId);
    if (!cam) return;
    setFovDrag({ type: 'edge', camId, cx_pct: cam.x_pct, cy_pct: cam.y_pct, fov_direction: cam.fov_direction });
  }, [cameras]);

  const onMouseMove = useCallback(e => {
    if (draggingCam) {
      setDidDrag(true);
      const dx = ((e.clientX - draggingCam.startMouseX) / draggingCam.rectW) * 100;
      const dy = ((e.clientY - draggingCam.startMouseY) / draggingCam.rectH) * 100;
      setCameras(prev => prev.map(c => c.id === draggingCam.id
        ? { ...c, x_pct: Math.min(100, Math.max(0, draggingCam.origX + dx)), y_pct: Math.min(100, Math.max(0, draggingCam.origY + dy)) }
        : c));
    }
    if (fovDrag && containerRef.current) {
      setDidDrag(true);
      const rect  = containerRef.current.getBoundingClientRect();
      const cx_px = fovDrag.cx_pct / 100 * rect.width;
      const cy_px = fovDrag.cy_pct / 100 * rect.height;
      const dx    = e.clientX - rect.left - cx_px;
      const dy    = e.clientY - rect.top  - cy_px;
      if (fovDrag.type === 'mid') {
        const newDir   = Math.atan2(dy, dx) * (180 / Math.PI);
        const newRange = Math.sqrt(dx * dx + dy * dy) / rect.width * 100;
        setCameras(prev => prev.map(c => c.id === fovDrag.camId
          ? { ...c, fov_direction: newDir, fov_range: Math.max(3, Math.min(65, newRange)) } : c));
      } else {
        const angleToMouse = Math.atan2(dy, dx) * (180 / Math.PI);
        let diff = angleToMouse - fovDrag.fov_direction;
        while (diff >  180) diff -= 360;
        while (diff < -180) diff += 360;
        setCameras(prev => prev.map(c => c.id === fovDrag.camId
          ? { ...c, fov_spread: Math.max(10, Math.min(340, Math.abs(diff) * 2)) } : c));
      }
    }
  }, [draggingCam, fovDrag, setCameras]);

  const onMouseUp = useCallback(() => { setDraggingCam(null); setFovDrag(null); }, []);

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup',   onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup',   onMouseUp);
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
    } finally { setSaving(false); }
  };

  const handleFinish = async () => {
    const ok = await saveLayout();
    if (ok) onDone();
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      <p className="text-xs text-slate-500 dark:text-gray-400 shrink-0 leading-relaxed">
        <strong>Click</strong> the map to add a camera &nbsp;·&nbsp;
        <strong>Drag the camera dot</strong> to reposition &nbsp;·&nbsp;
        <strong>Drag ●</strong> to aim &amp; resize range &nbsp;·&nbsp;
        <strong>Drag ○</strong> to adjust spread
      </p>

      <div className="flex gap-3 flex-1 min-h-0" style={{ minHeight: 340 }}>
        {/* Map */}
        <div className="flex-1 min-w-0">
          <div
            ref={containerRef}
            onClick={handleMapClick}
            className="relative w-full h-full rounded-2xl overflow-hidden border-2 border-blue-200 dark:border-blue-800 cursor-crosshair select-none bg-slate-50 dark:bg-gray-800"
          >
            <img src={floorPlanUrl} alt="Floor plan" className="w-full h-full object-contain block pointer-events-none" draggable={false} />
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 5, pointerEvents: 'none', overflow: 'visible' }}>
              {containerSize.w > 0 && cameras.map((cam, i) => (
                <CameraFOV key={cam.id} cam={cam} color={CAM_COLORS[i % CAM_COLORS.length]}
                  cw={containerSize.w} ch={containerSize.h}
                  onMidDown={onFovMidDown} onEdgeDown={onFovEdgeDown}
                />
              ))}
            </svg>
            {cameras.map((cam, i) => (
              <div
                key={cam.id}
                onMouseDown={e => onCamMouseDown(e, cam.id)}
                style={{ position: 'absolute', left: `${cam.x_pct}%`, top: `${cam.y_pct}%`, transform: 'translate(-50%,-50%)', cursor: 'grab', zIndex: 10 }}
              >
                <div style={{ background: CAM_COLORS[i % CAM_COLORS.length] }} className="w-7 h-7 rounded-full flex items-center justify-center shadow-lg border-2 border-white">
                  <Camera size={13} className="text-white" />
                </div>
                <div
                  style={{ background: CAM_COLORS[i % CAM_COLORS.length], position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 3, whiteSpace: 'nowrap' }}
                  className="px-1.5 py-0.5 rounded-lg text-white text-xs font-medium shadow"
                >
                  {cam.name}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Camera list */}
        <div className="w-52 shrink-0 flex flex-col gap-2 overflow-y-auto">
          <p className="text-xs font-medium text-slate-500 dark:text-gray-400 shrink-0">
            {cameras.length} camera{cameras.length !== 1 ? 's' : ''}
          </p>
          {cameras.length === 0 && (
            <p className="text-xs text-slate-400 dark:text-gray-500">Click the map to place cameras</p>
          )}
          {cameras.map((cam, i) => (
            <div key={cam.id} className="space-y-1">
              <div className="flex items-center gap-1.5">
                <div style={{ background: CAM_COLORS[i % CAM_COLORS.length] }} className="w-4 h-4 rounded-full shrink-0" />
                <input
                  value={cam.name}
                  onChange={e => setCameras(prev => prev.map(c => c.id === cam.id ? { ...c, name: e.target.value } : c))}
                  className="flex-1 min-w-0 px-2 py-1 border border-slate-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-800 text-slate-800 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button onClick={() => setCameras(prev => prev.filter(c => c.id !== cam.id))} className="text-slate-300 dark:text-gray-600 hover:text-red-400 shrink-0 transition-colors">
                  <Trash2 size={12} />
                </button>
              </div>
              <div className="ml-5 text-[10px] text-slate-400 dark:text-gray-500 leading-tight">
                {Math.round(cam.fov_spread)}° · {Math.round(cam.fov_range)}% range · {Math.round(cam.fov_direction)}°
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="shrink-0">
        <button
          onClick={handleFinish}
          disabled={!cameras.length || saving}
          className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
          {saving ? 'Saving…' : 'Save & Finish'}
        </button>
      </div>
    </div>
  );
}

// ── Modal wrapper ───────────────────────────────────────────────────────────────
export default function FloorPlanSetup({ onClose, onComplete, editSession }) {
  const isEdit = !!editSession;
  const [step,         setStep]         = useState(isEdit ? 1 : 0);
  const [expanded,     setExpanded]     = useState(false);
  const [sessionId,    setSessionId]    = useState(isEdit ? editSession.session_id    : null);
  const [floorPlanUrl, setFloorPlanUrl] = useState(isEdit ? editSession.floor_plan_url : null);
  const [cameras,      setCameras]      = useState(
    isEdit
      ? (editSession.cameras || []).map(c => ({
          id:            c.id,
          name:          c.name,
          x_pct:         c.x_pct,
          y_pct:         c.y_pct,
          fov_direction: c.fov_direction ?? 90,
          fov_range:     c.fov_range     ?? 15,
          fov_spread:    c.fov_spread    ?? 60,
        }))
      : []
  );

  const STEPS       = isEdit ? ['Edit Cameras'] : ['Upload Floor Plan', 'Place Cameras'];
  const displayStep = isEdit ? step - 1 : step;

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm ${expanded ? '' : 'p-4'}`}>
      <div className={`bg-white dark:bg-gray-900 shadow-2xl flex flex-col overflow-hidden transition-all duration-200 ${
        expanded ? 'w-screen h-screen' : 'w-full max-w-5xl rounded-2xl'
      }`} style={!expanded ? { maxHeight: '90vh' } : {}}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-gray-800 shrink-0">
          <div>
            <h2 className="font-semibold text-slate-800 dark:text-gray-100">
              {isEdit ? `Edit Floor: ${editSession.floor_name}` : 'Add Floor & Camera Setup'}
            </h2>
            <p className="text-xs text-slate-400 dark:text-gray-500 mt-0.5">
              Step {displayStep + 1} of {STEPS.length} — {STEPS[displayStep]}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setExpanded(v => !v)}
              title={expanded ? 'Exit fullscreen' : 'Expand'}
              className="p-2 text-slate-400 dark:text-gray-500 hover:text-slate-700 dark:hover:text-gray-200 hover:bg-slate-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
            >
              {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 dark:text-gray-500 hover:text-slate-700 dark:hover:text-gray-200 hover:bg-slate-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex px-6 pt-3 gap-1.5 shrink-0">
          {STEPS.map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= displayStep ? 'bg-blue-500' : 'bg-slate-200 dark:bg-gray-700'}`} />
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {step === 0 && !isEdit && (
            <StepUploadPlan onDone={(sid, url) => { setSessionId(sid); setFloorPlanUrl(url); setStep(1); }} />
          )}
          {step === 1 && (
            <StepPlaceCameras
              sessionId={sessionId}
              floorPlanUrl={floorPlanUrl}
              cameras={cameras}
              setCameras={setCameras}
              onDone={() => { onComplete?.(); onClose(); }}
            />
          )}
        </div>

        {/* Back button */}
        {displayStep > 0 && (
          <div className="px-6 pb-4 pt-2 border-t border-slate-100 dark:border-gray-800 shrink-0">
            <button onClick={() => setStep(s => s - 1)} className="text-xs text-slate-400 dark:text-gray-500 hover:text-slate-600 dark:hover:text-gray-300 transition-colors">
              ← Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

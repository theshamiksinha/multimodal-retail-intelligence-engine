/**
 * VoiceInventoryAdd.jsx
 *
 * Drop-in panel for your InventoryInsights page.
 * Records audio → POST /api/voice/transcribe-and-parse → confirm → POST /api/voice/confirm-add
 *
 * Usage inside InventoryInsights (or any parent):
 *   import VoiceInventoryAdd from './VoiceInventoryAdd';
 *   ...
 *   <VoiceInventoryAdd onProductsAdded={() => { /* refresh inventory *\/ }} />
 */

import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Check, X, Edit2, Plus, Trash2, Loader2, Volume2 } from 'lucide-react';

// ── tiny helpers ──────────────────────────────────────────────────────────────
const CARD = 'bg-white dark:bg-gray-900 rounded-2xl border border-slate-100 dark:border-gray-800 shadow-sm';

const CATEGORIES = [
  'Dairy','Bakery','Snacks','Beverages','Seasonal',
  'Produce','Frozen','Personal Care','Household','Other',
];

function Field({ label, value, onChange, type = 'text', options }) {
  const base =
    'w-full px-2.5 py-1.5 rounded-lg text-xs border border-slate-200 dark:border-gray-700 ' +
    'bg-white dark:bg-gray-800 text-slate-800 dark:text-gray-100 ' +
    'focus:outline-none focus:ring-2 focus:ring-indigo-400 transition';

  if (options) {
    return (
      <div>
        <label className="block text-[10px] font-medium text-slate-400 dark:text-gray-500 mb-1 uppercase tracking-wide">
          {label}
        </label>
        <select className={base} value={value} onChange={e => onChange(e.target.value)}>
          {options.map(o => <option key={o}>{o}</option>)}
        </select>
      </div>
    );
  }

  return (
    <div>
      <label className="block text-[10px] font-medium text-slate-400 dark:text-gray-500 mb-1 uppercase tracking-wide">
        {label}
      </label>
      <input
        className={base}
        type={type}
        value={value ?? ''}
        onChange={e => onChange(type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)}
      />
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────────
export default function VoiceInventoryAdd({ onProductsAdded }) {
  /* recording state */
  const [phase, setPhase] = useState('idle'); // idle | recording | processing | confirm | success | error
  const [audioBlob, setAudioBlob]       = useState(null);
  const [mimeType, setMimeType]         = useState('audio/webm');
  const [transcript, setTranscript]     = useState('');
  const [products, setProducts]         = useState([]);
  const [errorMsg, setErrorMsg]         = useState('');
  const [elapsed, setElapsed]           = useState(0);

  const mediaRecorderRef = useRef(null);
  const chunksRef        = useRef([]);
  const timerRef         = useRef(null);

  // clean up on unmount
  useEffect(() => () => clearInterval(timerRef.current), []);

  // ── recording ──────────────────────────────────────────────────────────────
  async function startRecording() {
    setErrorMsg('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Pick a mime type the browser supports
      const preferred = [
        'audio/webm;codecs=opus', 'audio/webm',
        'audio/ogg;codecs=opus',  'audio/ogg',
        'audio/mp4',
      ];
      const supported = preferred.find(m => MediaRecorder.isTypeSupported(m)) || '';
      setMimeType(supported || 'audio/webm');

      const mr = new MediaRecorder(stream, supported ? { mimeType: supported } : {});
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: supported || 'audio/webm' });
        setAudioBlob(blob);
        submitAudio(blob, supported || 'audio/webm');
      };

      mr.start(250);
      mediaRecorderRef.current = mr;

      setElapsed(0);
      setPhase('recording');
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
    } catch (err) {
      setErrorMsg(`Microphone access denied: ${err.message}`);
      setPhase('error');
    }
  }

  function stopRecording() {
    clearInterval(timerRef.current);
    setPhase('processing');
    mediaRecorderRef.current?.stop();
  }

  // ── API calls ──────────────────────────────────────────────────────────────
  async function submitAudio(blob, mime) {
    try {
      const form = new FormData();
      form.append('audio', blob, `recording.${mime.split('/')[1].split(';')[0]}`);

      const resp = await fetch('/api/voice/transcribe-and-parse', {
        method: 'POST',
        body: form,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: resp.statusText }));
        throw new Error(err.detail || resp.statusText);
      }

      const data = await resp.json();
      setTranscript(data.transcript || '');
      setProducts(
        (data.products || []).map((p, i) => ({ ...p, _id: i }))
      );
      setPhase('confirm');
    } catch (err) {
      setErrorMsg(err.message);
      setPhase('error');
    }
  }

  async function confirmAdd() {
    setPhase('processing');
    try {
      const resp = await fetch('/api/voice/confirm-add', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ products }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: resp.statusText }));
        throw new Error(err.detail || resp.statusText);
      }

      await resp.json();
      setPhase('success');
      onProductsAdded?.();
      setTimeout(() => setPhase('idle'), 3000);
    } catch (err) {
      setErrorMsg(err.message);
      setPhase('error');
    }
  }

  // ── product editing helpers ────────────────────────────────────────────────
  function updateProduct(id, field, value) {
    setProducts(ps => ps.map(p => p._id === id ? { ...p, [field]: value } : p));
  }

  function removeProduct(id) {
    setProducts(ps => ps.filter(p => p._id !== id));
  }

  function addBlankProduct() {
    const newId = Date.now();
    setProducts(ps => [...ps, {
      _id: newId, product_name: '', category: 'Other',
      current_stock: 0, unit_price: 0, unit_cost: null,
      days_to_expiry: null, reorder_point: 15, supplier_lead_days: 3,
    }]);
  }

  // ── render helpers ─────────────────────────────────────────────────────────
  const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className={`${CARD} p-5`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl">
            <Volume2 size={16} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-800 dark:text-gray-100 text-sm">Voice Inventory Entry</h3>
            <p className="text-[11px] text-slate-400 dark:text-gray-500 mt-0.5">
              Speak to add one or more products at once
            </p>
          </div>
        </div>

        {phase === 'confirm' && (
          <span className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-full text-xs font-medium">
            {products.length} product{products.length !== 1 ? 's' : ''} detected
          </span>
        )}
      </div>

      {/* ── IDLE ── */}
      {phase === 'idle' && (
        <div className="flex flex-col items-center gap-4 py-6">
          <p className="text-xs text-slate-400 dark:text-gray-500 text-center max-w-xs">
            Press the microphone and say something like:<br />
            <span className="italic text-slate-500 dark:text-gray-400">
              "Add 50 units of Greek Yogurt at $3.99, expires in 5 days, and 30 units of Sparkling Water at $5.49"
            </span>
          </p>
          <button
            onClick={startRecording}
            className="group relative flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-sm font-medium transition-all shadow-md hover:shadow-lg active:scale-95"
          >
            <Mic size={16} />
            Start Recording
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-400 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        </div>
      )}

      {/* ── RECORDING ── */}
      {phase === 'recording' && (
        <div className="flex flex-col items-center gap-4 py-6">
          <div className="relative">
            <div className="absolute inset-0 bg-red-400/20 rounded-full animate-ping" />
            <div className="relative flex items-center justify-center w-16 h-16 bg-red-500 rounded-full shadow-lg">
              <Mic size={24} className="text-white" />
            </div>
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-red-600 dark:text-red-400">Recording…</p>
            <p className="text-xs text-slate-400 dark:text-gray-500 font-mono mt-1">{fmt(elapsed)}</p>
          </div>
          <button
            onClick={stopRecording}
            className="flex items-center gap-2 px-6 py-2.5 bg-slate-800 dark:bg-gray-700 hover:bg-slate-700 dark:hover:bg-gray-600 text-white rounded-2xl text-sm font-medium transition-all active:scale-95"
          >
            <MicOff size={15} /> Stop &amp; Process
          </button>
        </div>
      )}

      {/* ── PROCESSING ── */}
      {phase === 'processing' && (
        <div className="flex flex-col items-center gap-3 py-8">
          <Loader2 size={28} className="text-indigo-500 animate-spin" />
          <p className="text-sm text-slate-500 dark:text-gray-400">Transcribing &amp; parsing…</p>
        </div>
      )}

      {/* ── CONFIRM ── */}
      {phase === 'confirm' && (
        <div className="space-y-4">
          {/* transcript chip */}
          {transcript && (
            <div className="px-3 py-2 bg-slate-50 dark:bg-gray-800/60 rounded-xl border border-slate-100 dark:border-gray-700">
              <p className="text-[10px] font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wide mb-1">
                Heard
              </p>
              <p className="text-xs text-slate-600 dark:text-gray-300 italic">"{transcript}"</p>
            </div>
          )}

          {/* product cards */}
          <div className="space-y-3">
            {products.map((p, i) => (
              <div
                key={p._id}
                className="rounded-xl border border-slate-100 dark:border-gray-700 bg-slate-50/50 dark:bg-gray-800/40 p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-semibold text-indigo-500 uppercase tracking-wider">
                    Product {i + 1}
                  </span>
                  <button
                    onClick={() => removeProduct(p._id)}
                    className="p-1 text-slate-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Field label="Product Name" value={p.product_name}
                      onChange={v => updateProduct(p._id, 'product_name', v)} />
                  </div>
                  <Field label="Category" value={p.category}
                    onChange={v => updateProduct(p._id, 'category', v)}
                    options={CATEGORIES} />
                  <Field label="Stock (units)" value={p.current_stock} type="number"
                    onChange={v => updateProduct(p._id, 'current_stock', v)} />
                  <Field label="Unit Price ($)" value={p.unit_price} type="number"
                    onChange={v => updateProduct(p._id, 'unit_price', v)} />
                  <Field label="Unit Cost ($)" value={p.unit_cost ?? ''} type="number"
                    onChange={v => updateProduct(p._id, 'unit_cost', v)} />
                  <Field label="Days to Expiry" value={p.days_to_expiry ?? ''} type="number"
                    onChange={v => updateProduct(p._id, 'days_to_expiry', v)} />
                  <Field label="Reorder Point" value={p.reorder_point} type="number"
                    onChange={v => updateProduct(p._id, 'reorder_point', v)} />
                </div>
              </div>
            ))}
          </div>

          {/* add another manually */}
          <button
            onClick={addBlankProduct}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-slate-300 dark:border-gray-600 text-xs text-slate-400 dark:text-gray-500 hover:border-indigo-400 hover:text-indigo-500 transition-colors"
          >
            <Plus size={13} /> Add another product manually
          </button>

          {/* action row */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => setPhase('idle')}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-slate-200 dark:border-gray-700 text-xs font-medium text-slate-500 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors"
            >
              <X size={13} /> Cancel
            </button>
            <button
              onClick={() => startRecording()}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-indigo-200 dark:border-indigo-900/50 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors"
            >
              <Mic size={13} /> Re-record
            </button>
            <button
              disabled={products.length === 0}
              onClick={confirmAdd}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-semibold transition-all active:scale-95 shadow-sm"
            >
              <Check size={14} /> Confirm &amp; Add {products.length > 0 ? `(${products.length})` : ''}
            </button>
          </div>
        </div>
      )}

      {/* ── SUCCESS ── */}
      {phase === 'success' && (
        <div className="flex flex-col items-center gap-3 py-8">
          <div className="flex items-center justify-center w-14 h-14 bg-green-100 dark:bg-green-950/40 rounded-full">
            <Check size={24} className="text-green-600 dark:text-green-400" />
          </div>
          <p className="text-sm font-semibold text-green-700 dark:text-green-400">
            {products.length} product{products.length !== 1 ? 's' : ''} added!
          </p>
          <p className="text-xs text-slate-400 dark:text-gray-500">Inventory updated successfully.</p>
        </div>
      )}

      {/* ── ERROR ── */}
      {phase === 'error' && (
        <div className="space-y-3 py-2">
          <div className="px-4 py-3 bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/50 rounded-xl">
            <p className="text-xs font-medium text-red-700 dark:text-red-400">{errorMsg}</p>
          </div>
          <button
            onClick={() => setPhase('idle')}
            className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-gray-800 text-xs font-medium text-slate-600 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-gray-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
import { useState } from 'react';
import { Upload, Loader2, Check, X, Trash2, Plus, ScanText } from 'lucide-react';

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
        onChange={e =>
          onChange(type === 'number'
            ? (e.target.value === '' ? null : Number(e.target.value))
            : e.target.value)
        }
      />
    </div>
  );
}

export default function OCRInventoryAdd({ onProductsAdded }) {
  const [phase, setPhase] = useState('idle'); // idle | processing | confirm | success | error
  const [ocrText, setOcrText] = useState('');
  const [products, setProducts] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');

  async function handleImageUpload(file) {
    if (!file) return;

    setErrorMsg('');
    setPhase('processing');
    setPreviewUrl(URL.createObjectURL(file));

    try {
      const form = new FormData();
      form.append('image', file);

      const resp = await fetch('/api/ocr/scan-and-parse', {
        method: 'POST',
        body: form,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: resp.statusText }));
        throw new Error(err.detail || resp.statusText);
      }

      const data = await resp.json();
      setOcrText(data.ocr_text || '');
      setProducts((data.products || []).map((p, i) => ({ ...p, _id: i })));
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: resp.statusText }));
        throw new Error(err.detail || resp.statusText);
      }

      await resp.json();
      setPhase('success');
      onProductsAdded?.();
      setTimeout(() => {
        setPhase('idle');
        setOcrText('');
        setProducts([]);
        setPreviewUrl('');
      }, 2500);
    } catch (err) {
      setErrorMsg(err.message);
      setPhase('error');
    }
  }

  function updateProduct(id, field, value) {
    setProducts(ps => ps.map(p => p._id === id ? { ...p, [field]: value } : p));
  }

  function removeProduct(id) {
    setProducts(ps => ps.filter(p => p._id !== id));
  }

  function addBlankProduct() {
    const newId = Date.now();
    setProducts(ps => [...ps, {
      _id: newId,
      product_name: '',
      category: 'Other',
      current_stock: 0,
      unit_price: 0,
      unit_cost: null,
      days_to_expiry: null,
      reorder_point: 15,
      supplier_lead_days: 3,
    }]);
  }

  return (
    <div className={`${CARD} p-5`}>
      <div className="flex items-center gap-2.5 mb-5">
        <div className="p-2 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl">
          <ScanText size={16} className="text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-800 dark:text-gray-100 text-sm">
            OCR Inventory Entry
          </h3>
          <p className="text-[11px] text-slate-400 dark:text-gray-500 mt-0.5">
            Upload a note, label, bill, or handwritten stock sheet
          </p>
        </div>
      </div>

      {phase === 'idle' && (
        <div className="flex flex-col items-center gap-4 py-6 flex-1 justify-center">
          <p className="text-xs text-slate-400 dark:text-gray-500 text-center max-w-xs">
            Example: &ldquo;Milk 24 pcs ₹65, Bread 12 pcs ₹40, Eggs 10 trays&rdquo;
          </p>
          <label className="cursor-pointer flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-sm font-medium transition shadow-md hover:shadow-lg active:scale-95">
            <Upload size={16} />
            Upload Image
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => handleImageUpload(e.target.files?.[0])}
            />
          </label>
        </div>
      )}

      {phase === 'processing' && (
        <div className="flex flex-col items-center gap-3 py-8">
          <Loader2 size={28} className="text-indigo-500 animate-spin" />
          <p className="text-sm text-slate-500 dark:text-gray-400">
            Reading image and extracting products…
          </p>
        </div>
      )}

      {phase === 'confirm' && (
        <div className="space-y-4">
          {previewUrl && (
            <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-gray-700">
              <img src={previewUrl} alt="Uploaded inventory scan" className="w-full max-h-72 object-contain bg-slate-50 dark:bg-gray-800" />
            </div>
          )}

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
                    <Field
                      label="Product Name"
                      value={p.product_name}
                      onChange={v => updateProduct(p._id, 'product_name', v)}
                    />
                  </div>

                  <Field
                    label="Category"
                    value={p.category}
                    onChange={v => updateProduct(p._id, 'category', v)}
                    options={CATEGORIES}
                  />
                  <Field
                    label="Stock"
                    type="number"
                    value={p.current_stock}
                    onChange={v => updateProduct(p._id, 'current_stock', v)}
                  />
                  <Field
                    label="Unit Price"
                    type="number"
                    value={p.unit_price}
                    onChange={v => updateProduct(p._id, 'unit_price', v)}
                  />
                  <Field
                    label="Unit Cost"
                    type="number"
                    value={p.unit_cost ?? ''}
                    onChange={v => updateProduct(p._id, 'unit_cost', v)}
                  />
                  <Field
                    label="Days to Expiry"
                    type="number"
                    value={p.days_to_expiry ?? ''}
                    onChange={v => updateProduct(p._id, 'days_to_expiry', v)}
                  />
                  <Field
                    label="Reorder Point"
                    type="number"
                    value={p.reorder_point}
                    onChange={v => updateProduct(p._id, 'reorder_point', v)}
                  />
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={addBlankProduct}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-slate-300 dark:border-gray-600 text-xs text-slate-400 dark:text-gray-500 hover:border-indigo-400 hover:text-indigo-500 transition-colors"
          >
            <Plus size={13} /> Add another product manually
          </button>

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => {
                setPhase('idle');
                setOcrText('');
                setProducts([]);
                setPreviewUrl('');
              }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-slate-200 dark:border-gray-700 text-xs font-medium text-slate-500 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors"
            >
              <X size={13} /> Cancel
            </button>

            <label className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-indigo-200 dark:border-indigo-900/50 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors cursor-pointer">
              <Upload size={13} /> Replace image
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => handleImageUpload(e.target.files?.[0])}
              />
            </label>

            <button
              disabled={products.length === 0}
              onClick={confirmAdd}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-gray-700 text-white text-xs font-medium transition-colors"
            >
              <Check size={13} /> Confirm & Add
            </button>
          </div>
        </div>
      )}

      {phase === 'success' && (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <Check size={28} className="text-green-500" />
          <p className="text-sm font-medium text-green-600 dark:text-green-400">
            Products added successfully
          </p>
        </div>
      )}

      {phase === 'error' && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900 p-4">
          <p className="text-sm text-red-600 dark:text-red-400 font-medium">OCR failed</p>
          <p className="text-xs text-red-500 dark:text-red-300 mt-1">{errorMsg}</p>
          <button
            onClick={() => setPhase('idle')}
            className="mt-3 px-3 py-2 rounded-lg text-xs bg-white dark:bg-gray-800 border border-red-200 dark:border-red-900"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
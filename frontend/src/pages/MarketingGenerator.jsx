import { useState } from 'react';
import { Sparkles, Image, Copy, Check, Loader2, Send } from 'lucide-react';
import { generateMarketing, postToBuffer } from '../api';

const INPUT = `w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-gray-700
  bg-white dark:bg-gray-800 text-slate-800 dark:text-gray-100
  placeholder:text-slate-400 dark:placeholder:text-gray-500
  focus:outline-none focus:ring-2 focus:ring-indigo-500`;

const CARD = 'bg-white dark:bg-gray-900 rounded-2xl border border-slate-100 dark:border-gray-800 shadow-sm';

export default function MarketingGenerator() {
  const [form, setForm] = useState({
    product_name:        '',
    product_description: '',
    campaign_type:       'social_media',
    tone:                'engaging',
    platform:            'instagram',
    generate_image:      true,
  });
  const [result, setResult]           = useState(null);
  const [loading, setLoading]         = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [copied, setCopied]           = useState(false);
  const [posting, setPosting]         = useState(false);
  const [posted, setPosted]           = useState(false);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleGenerate = async () => {
    if (!form.product_name.trim()) return;
    setLoading(true);
    setResult(null);
    setPosted(false);
    try {
      const res = await generateMarketing({ ...form, generate_image: false });
      setResult(res.data);
      setLoading(false);
      if (form.generate_image) {
        setImageLoading(true);
        try {
          const imgRes = await generateMarketing({ ...form, generate_image: true });
          setResult(prev => ({ ...prev, image_url: imgRes.data.image_url }));
        } catch (err) {
          console.error('Image generation failed:', err);
        } finally {
          setImageLoading(false);
        }
      }
    } catch (err) {
      alert('Generation failed: ' + (err.response?.data?.detail || err.message));
      setLoading(false);
    }
  };

  const handlePostToBuffer = async () => {
    if (!result) return;
    setPosting(true);
    try {
      await postToBuffer({
        channel_id:    import.meta.env.VITE_BUFFER_CHANNEL_ID,
        caption:       result.caption,
        hashtags:      result.hashtags,
        image_data_url: result.image_url || null,
      });
      setPosted(true);
    } catch (err) {
      alert('Failed to post to Buffer: ' + (err.response?.data?.detail || err.message));
    } finally {
      setPosting(false);
    }
  };

  const copyCaption = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.caption + '\n\n' + result.hashtags.join(' '));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Form */}
        <div className={`${CARD} p-6 space-y-4`}>
          <h2 className="font-semibold text-slate-800 dark:text-gray-100 text-sm">Content Settings</h2>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600 dark:text-gray-400">Product Name <span className="text-red-400">*</span></label>
            <input
              type="text"
              value={form.product_name}
              onChange={e => set('product_name', e.target.value)}
              placeholder="e.g. Archi POP's Chips 4-Pack"
              className={INPUT}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600 dark:text-gray-400">Description <span className="text-slate-400 dark:text-gray-600 font-normal">(optional)</span></label>
            <textarea
              value={form.product_description}
              onChange={e => set('product_description', e.target.value)}
              placeholder="Any extra product details…"
              rows={2}
              className={INPUT}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600 dark:text-gray-400">Campaign Type</label>
              <select value={form.campaign_type} onChange={e => set('campaign_type', e.target.value)} className={INPUT}>
                <option value="social_media">Social Media</option>
                <option value="clearance">Clearance Sale</option>
                <option value="seasonal">Seasonal</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600 dark:text-gray-400">Tone</label>
              <select value={form.tone} onChange={e => set('tone', e.target.value)} className={INPUT}>
                <option value="engaging">Engaging</option>
                <option value="urgent">Urgent</option>
                <option value="casual">Casual</option>
                <option value="professional">Professional</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600 dark:text-gray-400">Platform</label>
              <select value={form.platform} onChange={e => set('platform', e.target.value)} className={INPUT}>
                <option value="instagram">Instagram</option>
                <option value="facebook">Facebook</option>
                <option value="twitter">Twitter / X</option>
              </select>
            </div>
            <div className="flex items-end pb-0.5">
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-gray-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.generate_image}
                  onChange={e => set('generate_image', e.target.checked)}
                  className="rounded border-slate-300 dark:border-gray-600 accent-indigo-600"
                />
                Generate Image
              </label>
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={loading || imageLoading || !form.product_name.trim()}
            className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {loading ? 'Generating…' : 'Generate Content'}
          </button>
        </div>

        {/* Result */}
        <div className={`${CARD} p-6`}>
          {result ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-800 dark:text-gray-100 text-sm">Generated Content</h3>
                <button
                  onClick={copyCaption}
                  className="flex items-center gap-1 text-xs text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200 transition-colors"
                >
                  {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>

              {form.generate_image && (
                <div className="w-full aspect-square rounded-xl border border-slate-100 dark:border-gray-800 overflow-hidden bg-slate-50 dark:bg-gray-800 flex items-center justify-center">
                  {imageLoading ? (
                    <div className="flex flex-col items-center gap-2 text-slate-400 dark:text-gray-500">
                      <Loader2 size={24} className="animate-spin" />
                      <p className="text-xs">Generating image…</p>
                    </div>
                  ) : result.image_url ? (
                    <img src={result.image_url} alt="Generated marketing image" className="w-full h-full object-cover" />
                  ) : (
                    <p className="text-xs text-slate-400 dark:text-gray-500">Image unavailable</p>
                  )}
                </div>
              )}

              <div className="bg-slate-50 dark:bg-gray-800 rounded-xl p-4">
                <p className="text-sm text-slate-700 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">{result.caption}</p>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {result.hashtags?.map((tag, i) => (
                  <span key={i} className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-full text-xs font-medium">
                    {tag}
                  </span>
                ))}
              </div>

              <p className="text-xs text-slate-400 dark:text-gray-500">
                {result.platform} · {form.campaign_type.replace('_', ' ')}
              </p>

              <button
                onClick={handlePostToBuffer}
                disabled={posting || imageLoading || posted}
                className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {posting ? <Loader2 size={15} className="animate-spin" /> : posted ? <Check size={15} /> : <Send size={15} />}
                {posting ? 'Posting…' : posted ? 'Posted to Buffer!' : 'Post via Buffer'}
              </button>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-300 dark:text-gray-600 py-16 gap-3">
              <Image size={44} />
              <div className="text-center">
                <p className="text-sm text-slate-500 dark:text-gray-400">Generated content will appear here</p>
                <p className="text-xs text-slate-400 dark:text-gray-500 mt-1">Fill in the form and click Generate</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

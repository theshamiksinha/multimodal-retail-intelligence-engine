import { useState } from 'react';
import { Sparkles, Image, Copy, Check, Loader2, Send } from 'lucide-react';
import { generateMarketing, postToBuffer } from '../api';

export default function MarketingGenerator() {
  const [form, setForm] = useState({
    product_name: '',
    product_description: '',
    campaign_type: 'social_media',
    tone: 'engaging',
    platform: 'instagram',
    generate_image: true,
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);

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
          setResult((prev) => ({ ...prev, image_url: imgRes.data.image_url }));
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
        channel_id: import.meta.env.VITE_BUFFER_CHANNEL_ID,
        caption: result.caption,
        hashtags: result.hashtags,
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
    const text = result.caption + '\n\n' + result.hashtags.join(' ');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-slate-800">AI Marketing Generator</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Form */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Product Name *</label>
            <input
              type="text"
              value={form.product_name}
              onChange={(e) => setForm({ ...form, product_name: e.target.value })}
              placeholder="e.g., Archi POP's Chips 4-Pack"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea
              value={form.product_description}
              onChange={(e) => setForm({ ...form, product_description: e.target.value })}
              placeholder="Optional product details..."
              rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Campaign Type</label>
              <select
                value={form.campaign_type}
                onChange={(e) => setForm({ ...form, campaign_type: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="social_media">Social Media Post</option>
                <option value="clearance">Clearance Sale</option>
                <option value="seasonal">Seasonal Campaign</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tone</label>
              <select
                value={form.tone}
                onChange={(e) => setForm({ ...form, tone: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="engaging">Engaging</option>
                <option value="urgent">Urgent</option>
                <option value="casual">Casual</option>
                <option value="professional">Professional</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Platform</label>
              <select
                value={form.platform}
                onChange={(e) => setForm({ ...form, platform: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="instagram">Instagram</option>
                <option value="facebook">Facebook</option>
                <option value="twitter">Twitter/X</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.generate_image}
                  onChange={(e) => setForm({ ...form, generate_image: e.target.checked })}
                  className="rounded border-slate-300"
                />
                Generate Image (HuggingFace)
              </label>
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={loading || imageLoading || !form.product_name.trim()}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {loading ? 'Generating...' : 'Generate Marketing Content'}
          </button>
        </div>

        {/* Result */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          {result ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-800">Generated Content</h3>
                <button
                  onClick={copyCaption}
                  className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
                >
                  {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>

              {form.generate_image && (
                <div className="w-full aspect-square rounded-lg border border-slate-100 overflow-hidden bg-slate-50 flex items-center justify-center">
                  {imageLoading ? (
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <Loader2 size={28} className="animate-spin" />
                      <p className="text-xs">Generating image…</p>
                    </div>
                  ) : result.image_url ? (
                    <img src={result.image_url} alt="Generated marketing image" className="w-full h-full object-cover" />
                  ) : (
                    <p className="text-xs text-slate-400">Image unavailable</p>
                  )}
                </div>
              )}

              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{result.caption}</p>
              </div>

              <div className="flex flex-wrap gap-1">
                {result.hashtags?.map((tag, i) => (
                  <span key={i} className="px-2 py-1 bg-indigo-50 text-indigo-600 rounded-full text-xs">
                    {tag}
                  </span>
                ))}
              </div>

              <div className="text-xs text-slate-400">
                Platform: {result.platform} | Campaign: {form.campaign_type}
              </div>

              {/* Post to Buffer button */}
              <button
                onClick={handlePostToBuffer}
                disabled={posting || imageLoading || posted}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {posting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : posted ? (
                  <Check size={16} />
                ) : (
                  <Send size={16} />
                )}
                {posting ? 'Posting to Buffer…' : posted ? 'Posted to Buffer!' : 'Post to Instagram via Buffer'}
              </button>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 py-16">
              <Image size={48} className="mb-4" />
              <p className="text-sm">Generated content will appear here</p>
              <p className="text-xs mt-1">Fill in the form and click Generate</p>
            </div>
          )}
        </div>
      </div>

      {/* Language */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between">
        <span className="text-sm text-slate-600">Language</span>
        <select className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none">
          <option>English</option>
          <option>Hindi</option>
          <option>Spanish</option>
        </select>
      </div>
    </div>
  );
}

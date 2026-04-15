import { useState, useRef, useEffect } from 'react';
import { Send, User, Trash2, Loader2, Mic, MicOff, Volume2, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';
import mascotImg from '../assets/mascot_for_chatbot.png';
import ReactMarkdown from 'react-markdown';
import { chatWithAdvisor, clearAdvisorSession } from '../api';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useTranslation } from 'react-i18next';

const AD_GENERATE_PATTERN = /\b(generate|create|make|save|turn|convert)\b.{0,30}\b(ads?|advertisements?|campaigns?|posts?)\b/i;
const EXPIRING_PATTERN    = /\bexpir(ing|ed|es?)\b|\babout to expire\b|\bclearance\b/i;
const TOP_PRODUCTS_PATTERN = /\btop\b|\bbest.sell(ing|ers?)\b|\bpopular\b|\bslowest\b|\bslow.mov/i;

async function generateAdDrafts(text, tone = 'engaging', platform = 'instagram') {
  const r = await axios.post('/api/marketing/archive/generate', { advisor_text: text, tone, platform });
  return r.data;
}

async function generateAdDraftsFromSource(source /* 'expiring' | 'top' */) {
  // Fetch from the right endpoint and build a pseudo-advisor text the backend can parse
  const endpoint = source === 'expiring'
    ? '/api/marketing/expiring-products?limit=8'
    : '/api/marketing/top-products?limit=8';
  const r = await axios.get(endpoint);
  const products = r.data.products || [];
  if (!products.length) return { ads: [], count: 0 };
  // Build a text the advisor extractor can parse
  const lines = products.map((p, i) =>
    `${i + 1}. ${p.name}${source === 'expiring' && p.days_to_expiry != null ? ` (expires in ${p.days_to_expiry} days)` : ''}`
  ).join('\n');
  const advisorText = source === 'expiring'
    ? `Here are products that need clearance promotion:\n${lines}`
    : `Here are the top-selling products to promote:\n${lines}`;
  return generateAdDrafts(advisorText, 'engaging', 'instagram');
}

const GOOGLE_API_KEY      = import.meta.env.VITE_GOOGLE_STT_API_KEY;
const ELEVENLABS_API_KEY  = import.meta.env.VITE_ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = import.meta.env.VITE_ELEVENLABS_VOICE_ID;

const INITIAL_MESSAGE = {
  role: 'assistant',
  content: "Namaste! 🙏 I'm Munim Ji — your dedicated AI retail advisor.\n\nI've been keeping a close eye on your store's sales, inventory, and customer movement so you don't have to worry about the numbers. Think of me as your trusted munim who knows every shelf, every product, and every trend in your store.\n\nHere's what I can help you with:\n- 📊 Sales trends and product performance\n- 📦 Inventory alerts — low stock, expiring items, dead stock\n- 🗺️ Store layout and product placement tips\n- 📣 Marketing campaign ideas\n\nBas poochho — just ask!",
  suggestions: [
    'Kaun sa product sabse zyada bik raha hai?',
    'Which products are about to expire?',
    'Suggest a campaign for my slow-moving stock',
  ],
};

export default function AIAssistant() {
  const { t } = useTranslation();
  const [messages, setMessages] = useState([INITIAL_MESSAGE]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [recording, setRecording] = useState(false);
  const [ttsLoading, setTtsLoading] = useState(null);

  const chatEndRef       = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef   = useRef([]);
  const currentAudioRef  = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── STT ─────────────────────────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      audioChunksRef.current   = [];
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(t => t.stop());
        await transcribeAudio(blob);
      };
      mr.start();
      setRecording(true);
    } catch {
      alert('Microphone access denied. Please allow microphone permissions.');
    }
  };

  const stopRecording = () => { mediaRecorderRef.current?.stop(); setRecording(false); };
  const toggleRecording = () => recording ? stopRecording() : startRecording();

  const transcribeAudio = async (blob) => {
    try {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64 = reader.result.split(',')[1];
        const res = await fetch(`https://speech.googleapis.com/v1/speech:recognize?key=${GOOGLE_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            config: { encoding: 'WEBM_OPUS', sampleRateHertz: 48000, languageCode: 'en-US' },
            audio:  { content: base64 },
          }),
        });
        const data = await res.json();
        const transcript = data.results?.[0]?.alternatives?.[0]?.transcript;
        if (transcript) setInput(transcript);
        else alert('Could not understand audio. Please try again.');
      };
    } catch { alert('Speech recognition failed. Check your Google API key.'); }
  };

  // ── TTS ─────────────────────────────────────────────────────────────────────
  const playTTS = async (text, index) => {
    if (currentAudioRef.current) { currentAudioRef.current.pause(); currentAudioRef.current = null; }
    setTtsLoading(index);
    try {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
        method: 'POST',
        headers: { 'xi-api-key': ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          model_id: 'eleven_flash_v2_5',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`ElevenLabs Error ${res.status}: ${err.detail?.message || JSON.stringify(err)}`);
        return;
      }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const audio = new Audio(url);
      currentAudioRef.current = audio;
      audio.onended = () => URL.revokeObjectURL(url);
      audio.play();
    } catch (err) {
      alert(`TTS failed: ${err.message}`);
    } finally {
      setTtsLoading(null);
    }
  };

  // ── Chat ─────────────────────────────────────────────────────────────────────
  const sendMessage = async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: msg }]);

    // Intercept "generate ads" intent
    if (AD_GENERATE_PATTERN.test(msg)) {
      setLoading(true);
      setMessages(prev => [...prev, { role: 'assistant', content: '', adGenerating: true }]);
      try {
        let result;
        if (EXPIRING_PATTERN.test(msg)) {
          // User explicitly wants expiring product ads
          result = await generateAdDraftsFromSource('expiring');
        } else if (TOP_PRODUCTS_PATTERN.test(msg)) {
          // User explicitly wants top product ads
          result = await generateAdDraftsFromSource('top');
        } else {
          // Try to extract from last AI message; fall back to top products
          const lastAI = [...messages].reverse().find(m => m.role === 'assistant' && m.content);
          result = lastAI
            ? await generateAdDrafts(lastAI.content)
            : await generateAdDraftsFromSource('top');
        }
        setMessages(prev => [
          ...prev.filter(m => !m.adGenerating),
          { role: 'assistant', content: '', adResult: result },
        ]);
      } catch {
        setMessages(prev => [
          ...prev.filter(m => !m.adGenerating),
          { role: 'assistant', content: 'Sorry, could not generate ad drafts. Make sure the backend is running.' },
        ]);
      }
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await chatWithAdvisor(msg);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: res.data.response,
        suggestions: res.data.suggestions || [],
      }]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please make sure the backend is running and your API keys are configured.',
      }]);
    }
    setLoading(false);
  };

  const handleClear = async () => {
    await clearAdvisorSession('default').catch(() => {});
    setMessages([INITIAL_MESSAGE]);
  };

  return (
    <div className="h-[calc(100vh-148px)] flex flex-col gap-4">

      {/* Munim Ji header */}
      <div className="shrink-0 flex items-center justify-between
        bg-gradient-to-r from-blue-600 to-blue-700
        rounded-2xl px-5 py-3.5 shadow-md shadow-blue-500/20 animate-fade-in-up">
        <div className="flex items-center gap-3">
          {/* Mascot avatar */}
          <div className="w-11 h-11 rounded-xl overflow-hidden bg-white border-2 border-white/40 shadow-sm shrink-0 flex items-end justify-center">
            <img
              src={mascotImg}
              alt="Munim Ji"
              className="w-[120%] object-cover object-top"
              style={{ transform: 'translateY(4px)', filter: 'sepia(1) hue-rotate(200deg) saturate(6) brightness(0.55)' }}
            />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight">Munim Ji</p>
            <p className="text-blue-200 text-[11px] font-medium mt-0.5">
              {t('assistant.poweredBy', 'Powered by Mistral Large · context-aware retail advisor')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
            <span className="text-blue-200 text-[11px] font-medium">Online</span>
          </div>
          <button
            onClick={handleClear}
            className="flex items-center gap-1.5 text-xs text-blue-200 hover:text-white transition-colors px-2.5 py-1.5 rounded-lg hover:bg-white/10"
          >
            <Trash2 size={12} /> {t('assistant.clearChat', 'Clear')}
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto bg-white dark:bg-gray-900 rounded-2xl border border-slate-100 dark:border-gray-800 shadow-sm p-5 space-y-5">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>

            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-xl overflow-hidden shrink-0 mt-0.5
                bg-white border border-blue-100 flex items-end justify-center">
                <img src={mascotImg} alt="Munim Ji"
                  className="w-[120%] object-cover object-top"
                  style={{ transform: 'translateY(3px)', filter: 'sepia(1) hue-rotate(200deg) saturate(6) brightness(0.55)' }} />
              </div>
            )}

            <div className={`max-w-[76%] space-y-2 ${msg.role === 'user' ? 'order-first' : ''}`}>
              {msg.adGenerating ? (
                <div className="bg-slate-50 dark:bg-gray-800 rounded-2xl rounded-tl-sm px-4 py-4 flex items-center gap-3">
                  <Loader2 size={15} className="animate-spin text-blue-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-gray-200">{t('assistant.adGenerating', 'Generating ad drafts…')}</p>
                    <p className="text-xs text-slate-400 dark:text-gray-500 mt-0.5">{t('assistant.adGeneratingSub', 'Extracting products and writing captions')}</p>
                  </div>
                </div>
              ) : msg.adResult ? (
                <div className="bg-slate-50 dark:bg-gray-800 rounded-2xl rounded-tl-sm px-4 py-4 space-y-3">
                  {msg.adResult.count > 0 ? (
                    <>
                      <div className="flex items-center gap-2">
                        <CheckCircle size={15} className="text-emerald-500 shrink-0" />
                        <p className="text-sm font-semibold text-slate-800 dark:text-gray-100">
                          {msg.adResult.count === 1
                            ? t('assistant.adDraftsSaved', '{{count}} ad draft saved', { count: msg.adResult.count })
                            : t('assistant.adDraftsSavedPlural', '{{count}} ad drafts saved', { count: msg.adResult.count })}
                        </p>
                      </div>
                      <div className="space-y-2">
                        {msg.adResult.ads.slice(0, 3).map((ad, j) => (
                          <div key={j} className="px-3 py-2 bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-700">
                            <p className="text-xs font-semibold text-slate-700 dark:text-gray-200">{ad.product_name}</p>
                            <p className="text-[11px] text-slate-400 dark:text-gray-500 mt-0.5 line-clamp-2">{ad.caption}</p>
                          </div>
                        ))}
                        {msg.adResult.count > 3 && (
                          <p className="text-xs text-slate-400 dark:text-gray-500">+{msg.adResult.count - 3} more…</p>
                        )}
                      </div>
                      <Link
                        to="/marketing"
                        className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        <ExternalLink size={11} /> {t('assistant.viewInMarketing', 'View in Marketing → Drafts')}
                      </Link>
                    </>
                  ) : (
                    <div className="flex items-center gap-2">
                      <AlertCircle size={15} className="text-amber-500 shrink-0" />
                      <p className="text-sm text-slate-600 dark:text-gray-300">{t('assistant.noProducts', 'No products found in the previous response. Ask me for campaign suggestions first.')}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-tr-sm'
                    : 'bg-slate-50 dark:bg-gray-800 text-slate-700 dark:text-gray-200 rounded-tl-sm'
                }`}>
                  {msg.role === 'assistant' ? (
                    <div className="prose prose-sm prose-slate dark:prose-invert max-w-none">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : msg.content}
                </div>
              )}

              {msg.role === 'assistant' && (
                <button
                  onClick={() => playTTS(msg.content, i)}
                  disabled={ttsLoading === i}
                  className="flex items-center gap-1 text-xs text-slate-400 dark:text-gray-500 hover:text-blue-500 transition-colors ml-1"
                >
                  {ttsLoading === i ? <Loader2 size={11} className="animate-spin" /> : <Volume2 size={11} />}
                  {ttsLoading === i ? t('assistant.loading', 'Loading…') : t('assistant.play', 'Play')}
                </button>
              )}

              {msg.suggestions?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {msg.suggestions.map((s, j) => (
                    <button
                      key={j}
                      onClick={() => sendMessage(s)}
                      className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-full text-xs text-slate-600 dark:text-gray-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-200 dark:hover:border-blue-800 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                <User size={15} className="text-white" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-xl overflow-hidden shrink-0
              bg-white border border-blue-100 flex items-end justify-center">
              <img src={mascotImg} alt="" className="w-[120%] object-cover object-top"
                style={{ transform: 'translateY(3px)' }} />
            </div>
            <div className="bg-slate-50 dark:bg-gray-800 rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex gap-1 items-center h-4">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-gray-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-gray-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-gray-500 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 shrink-0">
        <button
          onClick={toggleRecording}
          title={recording ? 'Stop recording' : 'Start voice input'}
          className={`px-4 py-3 rounded-xl transition-colors ${
            recording
              ? 'bg-red-500 text-white animate-pulse'
              : 'bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 text-slate-500 dark:text-gray-400 hover:text-blue-600 hover:border-blue-300'
          }`}
        >
          {recording ? <MicOff size={15} /> : <Mic size={15} />}
        </button>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage()}
          placeholder={recording ? t('assistant.recordingPlaceholder', 'Recording… click mic to stop') : t('assistant.placeholder', 'Ask me anything about your store…')}
          className="flex-1 px-4 py-3 text-sm rounded-xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 placeholder:text-slate-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
        />
        <button
          onClick={() => sendMessage()}
          disabled={loading || !input.trim()}
          className="px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  );
}

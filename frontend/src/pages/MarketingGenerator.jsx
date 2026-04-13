import { useState, useEffect, useRef } from 'react';
import {
  Sparkles, Copy, Check, Loader2, Send, Clock,
  Instagram, Twitter, Film, Image as ImageIcon,
  BookOpen, CalendarDays, ChevronLeft, ChevronRight,
  Trash2, Play, AlertCircle, Plus, Music, RefreshCw, Mic,
  Zap, X, ChevronDown, ChevronUp
} from 'lucide-react';
import { generateMarketing, postToBuffer } from '../api';
import axios from 'axios';

const generateReelVideo     = (d) => axios.post('/api/marketing/generate-reel-video', d);
const addMusicToReel = (d) =>
  axios.post('/api/marketing/add-music-to-reel', d, {
    timeout: 240000,
  });
const generateVoiceoverLine = (d) => axios.post('/api/marketing/generate-voiceover-line', d);
const fetchTopProducts      = ()  => axios.get('/api/marketing/top-products?limit=30');
const runAutoCampaign       = (d) => axios.post('/api/marketing/auto-campaign', d);

// ─── Design tokens ────────────────────────────────────────────────────────────
const INPUT = `w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-gray-700
  bg-white dark:bg-gray-800 text-slate-800 dark:text-gray-100
  placeholder:text-slate-400 dark:placeholder:text-gray-500
  focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors`;
const CARD     = 'bg-white dark:bg-gray-900 rounded-2xl border border-slate-100 dark:border-gray-800 shadow-sm';
const SEG_BASE = 'flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer select-none';
const SEG_ON   = 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-300 shadow-sm';
const SEG_OFF  = 'text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200';

// ─── Storage ─────────────────────────────────────────────────────────────────
const HISTORY_KEY = 'mktg_history_v4';
const RESULT_KEY  = 'mktg_result_v2';
const FORM_KEY    = 'mktg_form_v1';
const SCHED_KEY   = 'mktg_scheduled_v1';

const ls = {
  get: (k) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} },
};

function stripFmt(t) {
  if (!t) return t;
  return t.replace(/\*\*(.*?)\*\*/g,'$1').replace(/__(.*?)__/g,'$1')
          .replace(/\*(.*?)\*/g,'$1').replace(/_(.*?)_/g,'$1');
}
function normalizeError(err) {
  const d = err?.response?.data?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.map(i => i?.msg || JSON.stringify(i)).join(', ');
  if (d?.msg) return d.msg;
  return err?.message || 'Something went wrong';
}
async function loadHistory() {
  const local = ls.get(HISTORY_KEY);
  if (Array.isArray(local) && local.length) return local;
  if (typeof window !== 'undefined' && window.storage) {
    try { const r = await window.storage.get(HISTORY_KEY); if (r?.value) return JSON.parse(r.value); } catch {}
  }
  return [];
}
async function saveHistory(posts) {
  ls.set(HISTORY_KEY, posts);
  if (typeof window !== 'undefined' && window.storage) {
    try { await window.storage.set(HISTORY_KEY, JSON.stringify(posts)); } catch {}
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const pad = n => String(n).padStart(2,'0');
function toLocalDT(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function toUTC(s) { return new Date(s).toISOString(); }
function toYMD(d) { const dt=new Date(d); return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}`; }
function ymdToDate(s) { const [y,m,d] = s.split('-').map(Number); return new Date(y,m-1,d); }
function sameDay(a,b) { return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate(); }
function daysInMonth(y,m) { return new Date(y,m+1,0).getDate(); }
function firstDay(y,m)    { return new Date(y,m,1).getDay(); }
function addDays(dateStr, n) {
  const d = ymdToDate(dateStr);
  d.setDate(d.getDate() + n);
  return toYMD(d);
}
function dateRange(startYMD, endYMD) {
  const dates = [];
  let cur = startYMD;
  while (cur <= endYMD) { dates.push(cur); cur = addDays(cur, 1); }
  return dates;
}

const TYPE_ICONS  = { post: ImageIcon, story: BookOpen, reel: Film };
const TYPE_LABELS = { post: 'Post', story: 'Story', reel: 'Reel' };
const PLATFORMS = {
  instagram: { label:'Instagram', icon:Instagram, color:'text-pink-500', dot:'bg-pink-400', types:['post','story','reel'] },
  twitter:   { label:'Twitter / X', icon:Twitter, color:'text-sky-500', dot:'bg-sky-400', types:['post'] },
};
const WEEKDAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTHS   = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const GENRES = [
  {value:'none',label:'No music'},
  {value:'pop',label:'🎵 Pop'},{value:'hip_hop',label:'🎤 Hip-Hop'},
  {value:'electronic',label:'🎧 Electronic'},{value:'acoustic',label:'🎸 Acoustic'},
  {value:'cinematic',label:'🎬 Cinematic'},{value:'upbeat',label:'⚡ Upbeat'},
  {value:'lofi',label:'🌙 Lo-Fi'},{value:'jazz',label:'🎷 Jazz'},
];

// ─── DateTimePicker ───────────────────────────────────────────────────────────
function DateTimePicker({ value, onChange }) {
  const [date, time] = value.split('T');
  const [h, m] = time.split(':');
  const minDate = toLocalDT().split('T')[0];
  const hl = hh => hh===0?'12 AM':hh<12?`${hh} AM`:hh===12?'12 PM':`${hh-12} PM`;
  return (
    <div className="space-y-2">
      <input type="date" value={date} min={minDate}
        onChange={e => onChange(`${e.target.value}T${time}`)} className={INPUT}/>
      <div className="grid grid-cols-2 gap-2">
        <select value={+h} onChange={e => onChange(`${date}T${pad(+e.target.value)}:${m}`)} className={INPUT}>
          {Array.from({length:24},(_,i)=>i).map(hh=><option key={hh} value={hh}>{hl(hh)}</option>)}
        </select>
        <select value={+m} onChange={e => onChange(`${date}T${h}:${pad(+e.target.value)}`)} className={INPUT}>
          {Array.from({length:60},(_,i)=>i).map(mm=><option key={mm} value={mm}>{pad(mm)}</option>)}
        </select>
      </div>
      <p className="text-[11px] text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/20 rounded-lg px-3 py-2">
        {new Date(value).toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})} at{' '}
        {new Date(value).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}
      </p>
    </div>
  );
}

// ─── Calendar (with optional range-select mode) ───────────────────────────────
function CalendarView({ history, selectedDay, onSelectDay, rangeStart, rangeEnd, onRangeClick, rangeMode=false }) {
  const today = new Date();
  const [yr, setYr] = useState(today.getFullYear());
  const [mo, setMo] = useState(today.getMonth());

  const prev = () => mo===0 ? (setMo(11),setYr(y=>y-1)) : setMo(m=>m-1);
  const next = () => mo===11? (setMo(0), setYr(y=>y+1)) : setMo(m=>m+1);

  const dayMap = {};
  history.forEach(e => {
    const k = e.status==='scheduled'&&e.scheduled_at ? toYMD(e.scheduled_at) : toYMD(e.created_at);
    if (!dayMap[k]) dayMap[k]=[];
    dayMap[k].push(e);
  });

  const total = daysInMonth(yr,mo);
  const start = firstDay(yr,mo);
  const cells = [...Array(start).fill(null), ...Array.from({length:total},(_,i)=>i+1)];
  while(cells.length%7) cells.push(null);

  return (
    <div className={`${CARD} p-5`}>
      <div className="flex items-center justify-between mb-4">
        <button onClick={prev} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-800 transition-colors">
          <ChevronLeft size={16} className="text-slate-500"/>
        </button>
        <span className="font-semibold text-slate-800 dark:text-gray-100 text-sm">{MONTHS[mo]} {yr}</span>
        <button onClick={next} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-800 transition-colors">
          <ChevronRight size={16} className="text-slate-500"/>
        </button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map(d=><div key={d} className="text-center text-[10px] font-semibold text-slate-400 py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day,idx) => {
          if (!day) return <div key={`b-${idx}`}/>;
          const ds     = `${yr}-${pad(mo+1)}-${pad(day)}`;
          const ens    = dayMap[ds]||[];
          const isTd   = sameDay(new Date(yr,mo,day), today);
          const isSel  = !rangeMode && selectedDay===ds;
          const isFuture = new Date(yr,mo,day) >= new Date(today.getFullYear(),today.getMonth(),today.getDate());

          // Range highlighting
          const inRange = rangeMode && rangeStart && rangeEnd && ds >= rangeStart && ds <= rangeEnd;
          const isRangeStart = rangeMode && ds === rangeStart;
          const isRangeEnd   = rangeMode && ds === rangeEnd;

          return (
            <button key={day}
              onClick={() => rangeMode ? onRangeClick(ds) : onSelectDay(isSel?null:ds)}
              className={`flex flex-col items-center pt-1 pb-1 rounded-xl min-h-[50px] transition-all
                ${isSel?'bg-indigo-100 dark:bg-indigo-900/30 ring-2 ring-indigo-400':''}
                ${inRange && !isRangeStart && !isRangeEnd ? 'bg-violet-50 dark:bg-violet-950/20' : ''}
                ${isRangeStart||isRangeEnd ? 'bg-violet-200 dark:bg-violet-800/40 ring-2 ring-violet-400' : ''}
                ${isTd&&!isSel&&!inRange?'ring-2 ring-indigo-500':''}
                ${!isSel&&!inRange&&!isRangeStart&&!isRangeEnd?'hover:bg-slate-50 dark:hover:bg-gray-800':''}`}>
              <span className={`text-xs font-semibold leading-none
                ${isTd?'text-indigo-600 dark:text-indigo-400':
                  isRangeStart||isRangeEnd?'text-violet-700 dark:text-violet-300':
                  'text-slate-700 dark:text-gray-300'}`}>{day}</span>
              {ens.length>0&&<div className="flex flex-wrap gap-0.5 mt-1 justify-center px-0.5">
                {ens.slice(0,4).map((e,i)=>{
                  const pc=PLATFORMS[e.platform];
                  return <span key={i} className={`w-1.5 h-1.5 rounded-full ${e.status==='scheduled'?'opacity-50 border border-slate-400 bg-transparent':pc?.dot||'bg-slate-400'}`}/>;
                })}
                {ens.length>4&&<span className="text-[8px] text-slate-400">+{ens.length-4}</span>}
              </div>}
              {ens.length===0&&isFuture&&!isSel&&!inRange&&(
                <span className="text-[9px] text-slate-300 dark:text-gray-700 mt-0.5">+</span>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-4 pt-3 border-t border-slate-100 dark:border-gray-800">
        <span className="flex items-center gap-1.5 text-[11px] text-slate-500"><span className="w-2 h-2 rounded-full bg-pink-400"/>Instagram</span>
        <span className="flex items-center gap-1.5 text-[11px] text-slate-500"><span className="w-2 h-2 rounded-full bg-sky-400"/>Twitter</span>
        <span className="flex items-center gap-1.5 text-[11px] text-slate-500"><span className="w-2 h-2 rounded-full border border-slate-400 opacity-60"/>Scheduled</span>
        {rangeMode && <span className="flex items-center gap-1.5 text-[11px] text-violet-500 ml-auto"><span className="w-2 h-2 rounded-full bg-violet-400"/>Auto-campaign range</span>}
      </div>
    </div>
  );
}

// ─── Day Detail ───────────────────────────────────────────────────────────────
function DayDetail({ dateStr, history, onDelete, onScheduleForDay }) {
  const [y,mo,d] = dateStr.split('-').map(Number);
  const dt = new Date(y,mo-1,d);
  const entries = history.filter(e => {
    const k = e.status==='scheduled'&&e.scheduled_at ? toYMD(e.scheduled_at) : toYMD(e.created_at);
    return k===dateStr;
  });
  const isFuture = dt >= new Date(new Date().setHours(0,0,0,0));

  return (
    <div className={`${CARD} p-5`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-800 dark:text-gray-100 text-sm">
          {dt.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})}
          {entries.length > 0 && <span className="ml-2 text-slate-400 font-normal text-xs">{entries.length} post{entries.length!==1?'s':''}</span>}
        </h3>
        {isFuture && (
          <button onClick={() => onScheduleForDay(dateStr)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-colors">
            <Plus size={12}/> Schedule post
          </button>
        )}
      </div>
      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-2">
          <CalendarDays size={28} className="text-slate-300 dark:text-gray-600"/>
          <p className="text-sm text-slate-400">No posts on this day</p>
          {isFuture && <p className="text-xs text-slate-400 text-center">Click "Schedule post" to plan content</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map(e => {
            const TIcon = TYPE_ICONS[e.post_type]||ImageIcon;
            const pc    = PLATFORMS[e.platform];
            const PI    = pc?.icon||Instagram;
            const st    = e.scheduled_at ? new Date(e.scheduled_at).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}) : null;
            return (
              <div key={e.id} className="flex gap-3 p-3 rounded-xl bg-slate-50 dark:bg-gray-800/60 border border-slate-100 dark:border-gray-700/50">
                <div className="shrink-0 w-11 h-11 rounded-lg overflow-hidden bg-slate-200 dark:bg-gray-700 flex items-center justify-center">
                  {e.image_url?<img src={e.image_url} alt="" className="w-full h-full object-cover"/>
                   :e.video_url?<Film size={16} className="text-slate-400"/>
                   :<TIcon size={16} className="text-slate-400"/>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-1">
                    <p className="text-xs font-semibold text-slate-800 dark:text-gray-100 truncate">{e.product_name}</p>
                    <button onClick={() => onDelete(e.id)} className="shrink-0 text-slate-300 hover:text-red-400 transition-colors ml-1"><Trash2 size={11}/></button>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-gray-400 mt-0.5 line-clamp-2">{e.caption}</p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className={`flex items-center gap-1 text-[10px] font-medium ${pc?.color||''}`}><PI size={9}/>{pc?.label}</span>
                    <span className="text-[10px] text-slate-400 capitalize flex items-center gap-1"><TIcon size={9}/>{e.post_type}</span>
                    {e.status==='scheduled'&&st&&<span className="text-[10px] bg-amber-100 dark:bg-amber-950/40 text-amber-600 px-1.5 py-0.5 rounded-full font-medium">⏰ {st}</span>}
                    {e.status==='sent'&&<span className="text-[10px] bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 px-1.5 py-0.5 rounded-full font-medium">✓ Sent</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Schedule-from-calendar modal ────────────────────────────────────────────
function ScheduleFromCalendarModal({ dateStr, onClose, onScheduled }) {
  const [step, setStep]     = useState('form');
  const [form, setFormState]= useState({ product_name:'', product_description:'', campaign_type:'social_media', tone:'engaging', platform:'instagram', post_type:'post' });
  const set = (k,v) => setFormState(f=>({...f,[k]:v}));
  const [schedAt, setSchedAt] = useState(`${dateStr}T12:00`);
  const [result, setResult]   = useState(null);
  const [imgLoading, setImgLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [pubState, setPubState]   = useState({});
  const [pubErrors, setPubErrors] = useState({});
  const [pubTargets, setPubTargets] = useState({ instagram:true, twitter:false });

  const handleGenerate = async () => {
    if (!form.product_name.trim()) return;
    setError(null); setStep('generating');
    try {
      const r1 = await generateMarketing({...form, generate_image:false});
      setResult({...r1.data, caption:stripFmt(r1.data.caption)});
      setStep('preview');
      if (form.post_type !== 'reel') {
        setImgLoading(true);
        try { const r2 = await generateMarketing({...form, generate_image:true}); setResult(p=>({...p, image_url:r2.data.image_url})); }
        catch(e) { console.error(e); } finally { setImgLoading(false); }
      }
    } catch(e) { setError('Generation failed: '+(e.response?.data?.detail||e.message)); setStep('form'); }
  };

  const handlePublish = async () => {
    if (!result) return;
    const platforms = Object.entries(pubTargets).filter(([,v])=>v).map(([p])=>p);
    if (!platforms.length) return;
    setStep('publishing');
    const ns = {}, ne = {};
    for (const platform of platforms) {
      const histId = `${Date.now()}_${platform}`;
      const captionText = result.caption + (platform==='instagram'&&form.post_type!=='story' ? '\n\n'+result.hashtags.join(' ') : '');
      try {
        await postToBuffer({ platform, post_type:form.post_type, caption:captionText, hashtags:result.hashtags, image_data_url:result.image_url||null, video_url:null, scheduled_at:toUTC(schedAt) });
        ns[platform]='done';
        onScheduled({ id:histId, created_at:new Date().toISOString(), product_name:form.product_name, platform, post_type:form.post_type, campaign_type:form.campaign_type, caption:result.caption, hashtags:result.hashtags, image_url:result.image_url||null, video_url:null, scheduled_at:toUTC(schedAt), status:'scheduled' });
      } catch(e) { ns[platform]='error'; ne[platform]=normalizeError(e); }
    }
    setPubState(ns); setPubErrors(ne);
    if (Object.values(ns).some(v=>v==='done')) setStep('done'); else setStep('preview');
  };

  const [y,mo,d] = dateStr.split('-').map(Number);
  const displayDate = new Date(y,mo-1,d).toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'});

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-gray-800 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-gray-800">
          <div>
            <h2 className="font-semibold text-slate-800 dark:text-gray-100">Schedule Post</h2>
            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1"><CalendarDays size={11}/>{displayDate}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg font-light leading-none">✕</button>
        </div>
        <div className="p-6 space-y-4">
          {(step==='form'||step==='generating') && (
            <>
              {error && <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg text-xs text-red-600"><AlertCircle size={12} className="mt-0.5 shrink-0"/>{error}</div>}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Platform</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(PLATFORMS).map(([k,cfg]) => { const Icon=cfg.icon; const on=form.platform===k; return (
                    <button key={k} onClick={()=>{set('platform',k); if(!cfg.types.includes(form.post_type)) set('post_type','post');}}
                      className={`flex items-center justify-center gap-2 py-2 rounded-lg border text-xs font-semibold transition-all ${on?'border-indigo-500 bg-indigo-50 text-indigo-700':'border-slate-200 text-slate-500 hover:border-slate-300 bg-white dark:bg-gray-800'}`}>
                      <Icon size={13} className={on?'text-indigo-600':cfg.color}/>{cfg.label}
                    </button>
                  );})}
                </div>
              </div>
              {PLATFORMS[form.platform].types.length>1&&(
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Type</label>
                  <div className="flex p-1 bg-slate-100 dark:bg-gray-800 rounded-lg gap-1">
                    {PLATFORMS[form.platform].types.map(pt=>{ const Icon=TYPE_ICONS[pt]; const on=form.post_type===pt; return (
                      <button key={pt} onClick={()=>set('post_type',pt)} className={`${SEG_BASE} ${on?SEG_ON:SEG_OFF}`}><Icon size={12}/>{TYPE_LABELS[pt]}</button>
                    );})}
                  </div>
                </div>
              )}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Product Name *</label>
                <input type="text" value={form.product_name} onChange={e=>set('product_name',e.target.value)} placeholder="e.g. Summer T-Shirt" className={INPUT}/>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Description <span className="font-normal normal-case text-slate-400">(optional)</span></label>
                <textarea value={form.product_description} onChange={e=>set('product_description',e.target.value)} rows={2} className={INPUT}/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Campaign</label>
                  <select value={form.campaign_type} onChange={e=>set('campaign_type',e.target.value)} className={INPUT}>
                    <option value="social_media">Social Media</option><option value="clearance">Clearance</option><option value="seasonal">Seasonal</option>
                  </select></div>
                <div className="space-y-1"><label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Tone</label>
                  <select value={form.tone} onChange={e=>set('tone',e.target.value)} className={INPUT}>
                    <option value="engaging">Engaging</option><option value="urgent">Urgent</option><option value="casual">Casual</option><option value="professional">Professional</option>
                  </select></div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1"><Clock size={11}/> Schedule Time</label>
                <DateTimePicker value={schedAt} onChange={setSchedAt}/>
              </div>
              <button onClick={handleGenerate} disabled={step==='generating'||!form.product_name.trim()}
                className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {step==='generating'?<Loader2 size={15} className="animate-spin"/>:<Sparkles size={15}/>}
                {step==='generating'?'Generating…':'Generate & Preview'}
              </button>
            </>
          )}
          {(step==='preview'||step==='publishing') && result && (
            <>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-600 dark:text-gray-300">Preview</p>
                  <button onClick={()=>setStep('form')} className="text-xs text-indigo-500 hover:text-indigo-600">← Edit</button>
                </div>
                {(result.image_url||imgLoading) && (
                  <div className={`w-full overflow-hidden rounded-xl border border-slate-100 bg-slate-50 flex items-center justify-center ${form.post_type==='story'?'aspect-[9/16] max-h-64':'aspect-square max-h-48'}`}>
                    {imgLoading?<div className="flex flex-col items-center gap-1 text-slate-400"><Loader2 size={18} className="animate-spin"/><p className="text-xs">Generating…</p></div>
                    :<img src={result.image_url} alt="" className="w-full h-full object-cover"/>}
                  </div>
                )}
                <div className="bg-slate-50 dark:bg-gray-800 rounded-xl p-3">
                  <p className="text-xs text-slate-700 dark:text-gray-200 leading-relaxed whitespace-pre-wrap line-clamp-4">{result.caption}</p>
                </div>
                {result.hashtags?.length>0&&<div className="flex flex-wrap gap-1">
                  {result.hashtags.slice(0,6).map((t,i)=><span key={i} className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-medium">{t}</span>)}
                  {result.hashtags.length>6&&<span className="text-[10px] text-slate-400">+{result.hashtags.length-6} more</span>}
                </div>}
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Publish to</label>
                {Object.entries(PLATFORMS).map(([k,cfg])=>{
                  const inc=k==='twitter'&&(form.post_type==='story'||form.post_type==='reel');
                  const Icon=cfg.icon; const state=pubState[k]; const on=pubTargets[k]&&!inc;
                  return <label key={k} className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer ${inc?'opacity-40 cursor-not-allowed border-slate-200 bg-slate-50':state==='done'?'border-emerald-300 bg-emerald-50':state==='error'?'border-red-300 bg-red-50':on?'border-indigo-300 bg-indigo-50':'border-slate-200 bg-white hover:border-slate-300'}`}>
                    <input type="checkbox" checked={on} disabled={inc||state==='done'} onChange={e=>setPubTargets(p=>({...p,[k]:e.target.checked}))} className="w-4 h-4 accent-indigo-600 shrink-0"/>
                    <Icon size={13} className={cfg.color}/>
                    <span className="flex-1 text-xs font-semibold text-slate-700">{cfg.label}</span>
                    {inc&&<span className="text-[10px] text-slate-400 italic">Not available</span>}
                    {state==='done'&&<Check size={12} className="text-emerald-500"/>}
                    {state==='error'&&<AlertCircle size={12} className="text-red-400"/>}
                  </label>;
                })}
                {Object.entries(pubErrors).map(([p,err])=><div key={p} className="flex items-start gap-1.5 p-2 bg-red-50 rounded-lg text-[11px] text-red-600"><AlertCircle size={11} className="mt-0.5 shrink-0"/><span><strong>{PLATFORMS[p]?.label}:</strong> {err}</span></div>)}
              </div>
              <div className="text-[11px] text-amber-600 bg-amber-50 rounded-lg px-3 py-2 flex items-center gap-1.5">
                <Clock size={11}/> Scheduled for {new Date(schedAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})} at {new Date(schedAt).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}
              </div>
              <button onClick={handlePublish} disabled={step==='publishing'||imgLoading||!Object.values(pubTargets).some(Boolean)}
                className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                {step==='publishing'?<Loader2 size={15} className="animate-spin"/>:<Send size={15}/>}
                {step==='publishing'?'Scheduling…':'Schedule Post'}
              </button>
            </>
          )}
          {step==='done'&&(
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center"><Check size={28} className="text-emerald-600"/></div>
              <div className="text-center">
                <p className="font-semibold text-slate-800">Post Scheduled!</p>
                <p className="text-xs text-slate-400 mt-1">{new Date(schedAt).toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})} at {new Date(schedAt).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}</p>
              </div>
              <button onClick={onClose} className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors">Done</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Auto-Campaign Modal ──────────────────────────────────────────────────────
function AutoCampaignModal({ onClose, onComplete }) {
  // Step 1: pick dates + settings
  // Step 2: confirm product assignment
  // Step 3: running (shows live progress)
  // Step 4: done summary
  const [step, setStep] = useState('config');

  // Date range selection: first click = start, second = end
  const [rangeStart, setRangeStart] = useState(null);
  const [rangeEnd,   setRangeEnd]   = useState(null);
  const handleRangeClick = (ds) => {
    if (!rangeStart || (rangeStart && rangeEnd)) {
      setRangeStart(ds); setRangeEnd(null);
    } else {
      if (ds < rangeStart) { setRangeEnd(rangeStart); setRangeStart(ds); }
      else setRangeEnd(ds);
    }
  };

  // Settings
  const [postTime, setPostTime]       = useState('10:00');
  const [platform, setPlatform]       = useState('instagram');
  const [postType, setPostType]       = useState('post');
  const [campaignType, setCampaignType] = useState('social_media');
  const [tone, setTone]               = useState('engaging');

  // Products
  const [products, setProducts]       = useState([]);
  const [prodLoading, setProdLoading] = useState(false);
  const [prodError, setProdError]     = useState(null);

  // Assignment: dateStr → product index
  const [assignment, setAssignment]   = useState({});

  // Progress
  const [progress, setProgress]       = useState([]); // [{date, product, status, error}]
  const [running, setRunning]         = useState(false);

  const selectedDates = rangeStart && rangeEnd ? dateRange(rangeStart, rangeEnd) : rangeStart ? [rangeStart] : [];

  const loadProducts = async () => {
    setProdLoading(true); setProdError(null);
    try {
      const r = await fetchTopProducts();
      setProducts(r.data.products || []);
    } catch(e) { setProdError('Could not load products: ' + normalizeError(e)); }
    finally { setProdLoading(false); }
  };

  // Auto-assign products to dates (round-robin, no repeat on consecutive days)
  const autoAssign = (dates, prods) => {
    if (!prods.length) return {};
    const map = {};
    dates.forEach((d, i) => { map[d] = i % prods.length; });
    return map;
  };

  const handleConfigure = async () => {
    if (!selectedDates.length) return;
    await loadProducts();
    setStep('assign');
  };

  useEffect(() => {
    if (step === 'assign' && products.length > 0) {
      setAssignment(autoAssign(selectedDates, products));
    }
  }, [step, products.length]);

  const handleRun = async () => {
    setStep('running');
    setRunning(true);

    // Build days payload
    const days = selectedDates.map(d => {
      const prodIdx = assignment[d] ?? 0;
      const prod = products[prodIdx] || products[0];
      const [h,m] = postTime.split(':');
      const localDT = `${d}T${h}:${m}`;
      return {
        product_name: prod?.name || 'Product',
        product_description: prod?.description || '',
        campaign_type: campaignType,
        tone,
        platform,
        post_type: postType,
        scheduled_at: toUTC(localDT),
        _date: d,
        _prod: prod?.name || 'Product',
      };
    });

    // Init progress
    setProgress(days.map(d => ({ date:d._date, product:d._prod, status:'pending' })));

    // Call backend (batch endpoint)
    try {
      const r = await runAutoCampaign({ days: days.map(({_date,_prod,...rest})=>rest) });
      const results = r.data.results || [];
      const newProg = results.map((res, i) => ({
        date: days[i]._date,
        product: days[i]._prod,
        status: res.status === 'ok' ? 'done' : 'error',
        error: res.error || null,
        image_url: res.image_url || null,
        caption: res.caption || null,
        buffer_post_id: res.buffer_post_id || null,
      }));
      setProgress(newProg);

      // Add to history
      const histEntries = newProg.filter(p=>p.status==='done').map((p,i) => ({
        id: `autocampaign_${Date.now()}_${i}`,
        created_at: new Date().toISOString(),
        product_name: p.product,
        platform,
        post_type: postType,
        campaign_type: campaignType,
        caption: p.caption || '',
        hashtags: [],
        image_url: p.image_url || null,
        video_url: null,
        scheduled_at: toUTC(`${p.date}T${postTime}`),
        status: 'scheduled',
        buffer_post_id: p.buffer_post_id,
      }));
      if (histEntries.length) onComplete(histEntries);
    } catch(e) {
      setProgress(prev => prev.map(p => ({...p, status:'error', error: normalizeError(e)})));
    }
    setRunning(false);
    setStep('done');
  };

  const doneCount = progress.filter(p=>p.status==='done').length;
  const errCount  = progress.filter(p=>p.status==='error').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-gray-800 max-h-[92vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
              <Zap size={16} className="text-violet-600"/>
            </div>
            <div>
              <h2 className="font-semibold text-slate-800 dark:text-gray-100">Auto-Campaign</h2>
              <p className="text-xs text-slate-400">Schedule daily posts for a date range automatically</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg font-light">✕</button>
        </div>

        <div className="p-6 space-y-5">

          {/* ── Config step ── */}
          {step === 'config' && (
            <>
              {/* Step indicator */}
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="w-5 h-5 rounded-full bg-violet-600 text-white flex items-center justify-center font-bold text-[10px]">1</span>
                <span className="text-violet-600 font-semibold">Select date range & settings</span>
                <span className="mx-2 text-slate-300">→</span>
                <span className="w-5 h-5 rounded-full bg-slate-200 dark:bg-gray-700 text-slate-500 flex items-center justify-center font-bold text-[10px]">2</span>
                <span>Review products</span>
                <span className="mx-2 text-slate-300">→</span>
                <span className="w-5 h-5 rounded-full bg-slate-200 dark:bg-gray-700 text-slate-500 flex items-center justify-center font-bold text-[10px]">3</span>
                <span>Run</span>
              </div>

              {/* Calendar range picker */}
              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  Select Dates — click start date, then end date
                </p>
                <CalendarView
                  history={[]}
                  selectedDay={null}
                  onSelectDay={()=>{}}
                  rangeStart={rangeStart}
                  rangeEnd={rangeEnd}
                  onRangeClick={handleRangeClick}
                  rangeMode={true}
                />
                {selectedDates.length > 0 && (
                  <p className="text-xs text-violet-600 dark:text-violet-400 mt-2 flex items-center gap-1.5">
                    <Check size={11}/> {selectedDates.length} day{selectedDates.length!==1?'s':''} selected
                    {rangeStart && !rangeEnd && ' — click an end date'}
                  </p>
                )}
              </div>

              {/* Settings row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Post Time (daily)</label>
                  <input type="time" value={postTime} onChange={e=>setPostTime(e.target.value)} className={INPUT}/>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Platform</label>
                  <select value={platform} onChange={e=>{setPlatform(e.target.value); if(e.target.value==='twitter') setPostType('post');}} className={INPUT}>
                    <option value="instagram">Instagram</option>
                    <option value="twitter">Twitter / X</option>
                  </select>
                </div>
                {platform==='instagram' && (
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Content Type</label>
                    <select value={postType} onChange={e=>setPostType(e.target.value)} className={INPUT}>
                      <option value="post">Post</option>
                      <option value="story">Story</option>
                    </select>
                    <p className="text-[10px] text-slate-400">Reels not supported in auto-campaign (require video generation)</p>
                  </div>
                )}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Campaign Type</label>
                  <select value={campaignType} onChange={e=>setCampaignType(e.target.value)} className={INPUT}>
                    <option value="social_media">Social Media</option>
                    <option value="clearance">Clearance Sale</option>
                    <option value="seasonal">Seasonal</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Tone</label>
                  <select value={tone} onChange={e=>setTone(e.target.value)} className={INPUT}>
                    <option value="engaging">Engaging</option>
                    <option value="urgent">Urgent</option>
                    <option value="casual">Casual</option>
                    <option value="professional">Professional</option>
                  </select>
                </div>
              </div>

              <button onClick={handleConfigure} disabled={selectedDates.length===0||prodLoading}
                className="w-full flex items-center justify-center gap-2 py-3 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors">
                {prodLoading?<Loader2 size={15} className="animate-spin"/>:<Zap size={15}/>}
                {prodLoading?'Loading products…':'Next: Review Products →'}
              </button>
              {prodError && <p className="text-xs text-red-500 text-center">{prodError}</p>}
            </>
          )}

          {/* ── Assign step ── */}
          {step === 'assign' && (
            <>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold text-[10px]"><Check size={10}/></span>
                <span className="text-slate-400">Date range</span>
                <span className="mx-2 text-slate-300">→</span>
                <span className="w-5 h-5 rounded-full bg-violet-600 text-white flex items-center justify-center font-bold text-[10px]">2</span>
                <span className="text-violet-600 font-semibold">Assign products to dates</span>
                <span className="mx-2 text-slate-300">→</span>
                <span className="w-5 h-5 rounded-full bg-slate-200 dark:bg-gray-700 text-slate-500 flex items-center justify-center font-bold text-[10px]">3</span>
                <span>Run</span>
              </div>

              <div className="p-3 bg-violet-50 dark:bg-violet-950/20 rounded-xl text-xs text-violet-700 dark:text-violet-300">
                <p className="font-semibold mb-0.5">🔄 Products are auto-assigned to avoid repeats on consecutive days.</p>
                <p className="text-violet-600/80">You can override any day's product using the dropdowns below.</p>
              </div>

              {products.length === 0 && (
                <div className="p-4 bg-amber-50 dark:bg-amber-950/20 rounded-xl text-xs text-amber-700">
                  No products found in sales data. The campaign will use a generic product name. You can still proceed.
                </div>
              )}

              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {selectedDates.map(d => {
                  const [y,mo,day] = d.split('-').map(Number);
                  const label = new Date(y,mo-1,day).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
                  const assignedIdx = assignment[d] ?? 0;
                  return (
                    <div key={d} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 dark:border-gray-800 bg-slate-50 dark:bg-gray-800/60">
                      <div className="shrink-0 text-center w-16">
                        <p className="text-xs font-semibold text-slate-700 dark:text-gray-200">{label}</p>
                        <p className="text-[10px] text-slate-400">{postTime}</p>
                      </div>
                      <div className="flex-1">
                        {products.length > 0 ? (
                          <select value={assignedIdx} onChange={e=>setAssignment(prev=>({...prev,[d]:+e.target.value}))}
                            className={`${INPUT} py-1.5 text-xs`}>
                            {products.map((p,i)=><option key={i} value={i}>{p.name}</option>)}
                          </select>
                        ) : (
                          <p className="text-xs text-slate-400 italic">No products loaded</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-3">
                <button onClick={()=>setStep('config')} className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-500 hover:bg-slate-50 transition-colors">← Back</button>
                <button onClick={handleRun}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700 transition-colors">
                  <Zap size={14}/> Run Campaign ({selectedDates.length} posts)
                </button>
              </div>
            </>
          )}

          {/* ── Running / Done step ── */}
          {(step === 'running' || step === 'done') && (
            <>
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-semibold text-slate-800 dark:text-gray-100 text-sm flex items-center gap-2">
                  {running ? <Loader2 size={14} className="animate-spin text-violet-500"/> : <Check size={14} className="text-emerald-500"/>}
                  {running ? 'Generating & scheduling posts…' : 'Campaign complete'}
                </h3>
                {step === 'done' && (
                  <span className="text-xs text-slate-400">{doneCount} scheduled · {errCount} failed</span>
                )}
              </div>

              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {progress.map((p, i) => {
                  const [y,mo,d] = p.date.split('-').map(Number);
                  const label = new Date(y,mo-1,d).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
                  return (
                    <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border transition-colors
                      ${p.status==='done'?'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20'
                        :p.status==='error'?'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20'
                        :'border-slate-100 dark:border-gray-800 bg-slate-50 dark:bg-gray-800/60'}`}>
                      <div className="shrink-0 w-5 h-5 flex items-center justify-center">
                        {p.status==='pending' && <div className="w-3 h-3 rounded-full border-2 border-slate-300 dark:border-gray-600"/>}
                        {p.status==='done'    && <Check size={14} className="text-emerald-500"/>}
                        {p.status==='error'   && <AlertCircle size={14} className="text-red-400"/>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-700 dark:text-gray-200">{label} — <span className="font-normal">{p.product}</span></p>
                        {p.status==='error' && p.error && <p className="text-[10px] text-red-500 mt-0.5 truncate">{p.error}</p>}
                        {p.status==='done' && p.caption && <p className="text-[10px] text-slate-400 mt-0.5 truncate">{p.caption}</p>}
                      </div>
                      <div className="shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full
                        {p.status==='done'?'bg-emerald-100 text-emerald-600':p.status==='error'?'bg-red-100 text-red-500':'bg-slate-100 text-slate-400'}">
                        {p.status==='done'?'✓ Scheduled':p.status==='error'?'✗ Failed':'Pending'}
                      </div>
                    </div>
                  );
                })}
              </div>

              {step==='done' && (
                <button onClick={onClose}
                  className="w-full py-3 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors">
                  Done — View Calendar
                </button>
              )}
            </>
          )}

        </div>
      </div>
    </div>
  );
}

// ─── Step badge ───────────────────────────────────────────────────────────────
function StepBadge({ n, active, done }) {
  return (
    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0
      ${done?'bg-emerald-500 text-white':active?'bg-indigo-600 text-white':'bg-slate-200 dark:bg-gray-700 text-slate-500 dark:text-gray-400'}`}>
      {done?<Check size={12}/>:n}
    </span>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function MarketingGenerator() {

  const [form, setFormState] = useState(() => ls.get(FORM_KEY) || {
    product_name:'', product_description:'', campaign_type:'social_media',
    tone:'engaging', platform:'instagram', post_type:'post',
  });
  const setForm = (updater) => setFormState(prev => {
    const next = typeof updater==='function' ? updater(prev) : updater;
    ls.set(FORM_KEY, next); return next;
  });
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const [result, setResultRaw] = useState(() => ls.get(RESULT_KEY));
  const setResult = (val) => setResultRaw(prev => {
    const next = typeof val==='function' ? val(prev) : val;
    if (next) ls.set(RESULT_KEY, next); else ls.del(RESULT_KEY);
    return next;
  });

  const [loading,      setLoading]      = useState(false);
  const [imgLoading,   setImgLoading]   = useState(false);
  const [vidLoading,   setVidLoading]   = useState(false);
  const [vidError,     setVidError]     = useState(null);
  const [musicLoading, setMusicLoading] = useState(false);
  const [musicError,   setMusicError]   = useState(null);
  const [musicGenre,   setMusicGenre]   = useState('none');
  const [copied,       setCopied]       = useState(false);

  const [voiceoverText,    setVoiceoverText]    = useState('');
  const [voiceoverLoading, setVoiceoverLoading] = useState(false);
  const [voiceoverFetched, setVoiceoverFetched] = useState(false);

  const [pubState,   setPubState]   = useState({});
  const [pubErrors,  setPubErrors]  = useState({});
  const [pubTargets, setPubTargets] = useState({ instagram:true, twitter:false });
  const [schedMode,  setSchedMode]  = useState('now');
  const [schedAt,    setSchedAt]    = useState(() => toLocalDT(new Date(Date.now()+3600000)));

  const timers = useRef({});
  const [jobs, setJobs] = useState(() => ls.get(SCHED_KEY) || []);

  const [history,  setHistory]  = useState([]);
  const [histDone, setHistDone] = useState(false);
  const [tab,      setTab]      = useState('create');
  const [selDay,   setSelDay]   = useState(null);
  const [calModal, setCalModal] = useState(null);
  const [autoModal, setAutoModal] = useState(false);

  useEffect(() => { loadHistory().then(h => { setHistory(h); setHistDone(true); }); }, []);
  useEffect(() => {
    const allowed = PLATFORMS[form.platform]?.types ?? ['post'];
    if (!allowed.includes(form.post_type)) set('post_type','post');
  }, [form.platform]);

  useEffect(() => {
    ls.set(SCHED_KEY, jobs);
    jobs.forEach(job => {
      if (timers.current[job.id]) return;
      const delay = new Date(job.scheduled_at).getTime() - Date.now();
      const fire = () => fireJob(job);
      timers.current[job.id] = delay<=0 ? (setTimeout(fire,0),'pending') : setTimeout(fire,delay);
    });
  }, [jobs]);

  const fireJob = async (job) => {
    try {
      await postToBuffer(job.payload);
      setHistory(prev=>{ const u=prev.map(h=>h.id===job.historyId?{...h,status:'sent'}:h); saveHistory(u); return u; });
    } catch(e) { console.error('[Scheduler]',e); }
    setJobs(prev=>prev.filter(j=>j.id!==job.id));
    delete timers.current[job.id];
  };

  const addToHistory = async (e) => {
    const u = [e,...history].slice(0,100);
    setHistory(u); await saveHistory(u);
  };
  const addManyToHistory = async (entries) => {
    const u = [...entries,...history].slice(0,200);
    setHistory(u); await saveHistory(u);
  };
  const removeFromHistory = async (id) => {
    const u = history.filter(h=>h.id!==id);
    setHistory(u); await saveHistory(u);
  };
  const clearHistory = async () => { setHistory([]); await saveHistory([]); };

  const handleGenerate = async () => {
    if (!form.product_name.trim()) return;
    setLoading(true);
    setPubState({}); setPubErrors({});
    setVidError(null); setMusicError(null);
    setVoiceoverText(''); setVoiceoverFetched(false);
    try {
      const r1 = await generateMarketing({...form, generate_image:false});
      const newResult = {...r1.data, caption:stripFmt(r1.data.caption)};
      setResult(newResult);
      setLoading(false);
      if (form.post_type !== 'reel') {
        setImgLoading(true);
        try { const r2 = await generateMarketing({...form, generate_image:true}); setResult(prev=>({...prev,image_url:r2.data.image_url})); }
        catch(e) { console.error('Image gen failed',e); } finally { setImgLoading(false); }
      } else { fetchVoiceoverLine(); }
    } catch(e) {
      alert('Generation failed: '+(e.response?.data?.detail||e.message));
      setLoading(false);
    }
  };

  const fetchVoiceoverLine = async () => {
    setVoiceoverLoading(true);
    try {
      const r = await generateVoiceoverLine({ product_name:form.product_name, product_description:form.product_description, campaign_type:form.campaign_type, tone:form.tone });
      setVoiceoverText(r.data?.voiceover_text||'');
      setVoiceoverFetched(true);
    } catch(e) { console.error(e); } finally { setVoiceoverLoading(false); }
  };

  const handleGenerateVideo = async () => {
    if (!result) return;
    setVidLoading(true); setVidError(null); setMusicError(null);
    try {
      const r = await generateReelVideo({ product_name:form.product_name, product_description:form.product_description, campaign_type:form.campaign_type });
      const url = r.data?.video_url;
      if (!url) throw new Error('No video URL returned.');
      setResult(prev=>({...prev,video_url:url,video_url_with_music:null}));
    } catch(e) { setVidError(normalizeError(e)); } finally { setVidLoading(false); }
  };

  const handleAddMusic = async () => {
    if (!result?.video_url||musicGenre==='none') return;
    setMusicLoading(true); setMusicError(null);
    try {
      const r = await addMusicToReel({ video_url:result.video_url, genre:musicGenre, product_name:form.product_name, product_description:form.product_description, campaign_type:form.campaign_type, tone:form.tone, voiceover_text:voiceoverText });
      const url = r.data?.video_url;
      if (!url) throw new Error('No video URL returned.');
      setResult(prev=>({...prev,video_url_with_music:url}));
    } catch(e) { setMusicError(normalizeError(e)); } finally { setMusicLoading(false); }
  };

  const handlePublish = async () => {
    if (!result) return;
    const platforms = Object.entries(pubTargets).filter(([,v])=>v).map(([p])=>p);
    if (!platforms.length) return;
    const finalVideo = result.video_url_with_music || result.video_url || null;
    for (const platform of platforms) {
      if (pubState[platform]==='done') continue;
      setPubState(prev=>({...prev,[platform]:'posting'}));
      setPubErrors(prev=>{ const n={...prev}; delete n[platform]; return n; });
      const histId = `${Date.now()}_${platform}`;
      const captionText = result.caption + (platform==='instagram'&&form.post_type!=='story' ? '\n\n'+result.hashtags.join(' ') : '');
      const payload = { platform, post_type:form.post_type, caption:captionText, hashtags:result.hashtags, image_data_url:result.image_url||null, video_url:finalVideo, scheduled_at:schedMode==='later'?toUTC(schedAt):null };
      try {
        if (schedMode==='later') {
          setJobs(prev=>[...prev,{id:histId,historyId:histId,platform,scheduled_at:toUTC(schedAt),payload}]);
          await addToHistory({id:histId,created_at:new Date().toISOString(),product_name:form.product_name,platform,post_type:form.post_type,campaign_type:form.campaign_type,caption:result.caption,hashtags:result.hashtags,image_url:result.image_url||null,video_url:finalVideo,scheduled_at:toUTC(schedAt),status:'scheduled'});
        } else {
          const res = await postToBuffer(payload);
          await addToHistory({id:histId,created_at:new Date().toISOString(),product_name:form.product_name,platform,post_type:form.post_type,campaign_type:form.campaign_type,caption:result.caption,hashtags:result.hashtags,image_url:result.image_url||null,video_url:finalVideo,scheduled_at:null,buffer_post_id:res.data?.post?.id||null,status:'sent'});
        }
        setPubState(prev=>({...prev,[platform]:'done'}));
      } catch(e) {
        setPubErrors(prev=>({...prev,[platform]:normalizeError(e)}));
        setPubState(prev=>({...prev,[platform]:'error'}));
      }
    }
  };

  const isReel  = form.post_type==='reel';
  const isStory = form.post_type==='story';
  const finalVideo = result?.video_url_with_music || result?.video_url || null;
  const step1Done  = !!result && !loading;
  const step2Done  = !isReel || !!finalVideo;
  const anyPosting = Object.values(pubState).some(v=>v==='posting');
  const anyTargeted = Object.values(pubTargets).some(Boolean);
  const allDone = anyTargeted && Object.entries(pubTargets).filter(([,v])=>v).every(([p])=>pubState[p]==='done');

  const copyCaption = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.caption+'\n\n'+result.hashtags.join(' '));
    setCopied(true); setTimeout(()=>setCopied(false),2000);
  };

  // ════════════════════════ RENDER ═════════════════════════════════════════════
  return (
    <div className="space-y-4">

      {calModal && (
        <ScheduleFromCalendarModal dateStr={calModal} onClose={()=>setCalModal(null)}
          onScheduled={async (entry) => { await addToHistory(entry); }}/>
      )}
      {autoModal && (
        <AutoCampaignModal onClose={()=>{ setAutoModal(false); setTab('calendar'); }}
          onComplete={async (entries) => { await addManyToHistory(entries); }}/>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 p-1 bg-slate-100 dark:bg-gray-800 rounded-xl w-fit">
        {[['create','Create',Sparkles],['calendar','Calendar',CalendarDays]].map(([t,l,Icon])=>(
          <button key={t} onClick={()=>setTab(t)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all
              ${tab===t?'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-300 shadow-sm':'text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200'}`}>
            <Icon size={13}/>{l}
            {t==='calendar'&&history.length>0&&<span className="ml-0.5 bg-indigo-600 text-white text-[9px] rounded-full px-1.5 py-0.5">{history.length}</span>}
          </button>
        ))}
      </div>

      {/* ═══ CREATE TAB ══════════════════════════════════════════════════════ */}
      {tab==='create' && (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
          <div className="xl:col-span-2 space-y-3">

            {/* STEP 1 */}
            <div className={CARD}>
              <div className="px-5 pt-5 pb-3 border-b border-slate-100 dark:border-gray-800 flex items-center gap-3">
                <StepBadge n={1} active={!step1Done} done={step1Done}/>
                <div><p className="text-sm font-semibold text-slate-800 dark:text-gray-100">Configure Content</p><p className="text-[11px] text-slate-400 mt-0.5">Platform, post type, and product details</p></div>
              </div>
              <div className="p-5 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide">Platform</label>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(PLATFORMS).map(([k,cfg])=>{ const Icon=cfg.icon; const on=form.platform===k; return (
                      <button key={k} onClick={()=>set('platform',k)}
                        className={`flex items-center justify-center gap-2 py-2.5 rounded-lg border text-xs font-semibold transition-all ${on?'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300':'border-slate-200 dark:border-gray-700 text-slate-500 dark:text-gray-400 hover:border-slate-300 bg-white dark:bg-gray-800'}`}>
                        <Icon size={14} className={on?'text-indigo-600':cfg.color}/>{cfg.label}
                      </button>
                    );})}
                  </div>
                  <p className="text-[11px] text-slate-400 dark:text-gray-500 pl-0.5">
                    {form.platform==='instagram'?'Instagram supports Posts, Stories, and Reels':'Twitter supports text posts only'}
                  </p>
                </div>
                {PLATFORMS[form.platform].types.length>1&&(
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide">Content Type</label>
                    <div className="flex p-1 bg-slate-100 dark:bg-gray-800 rounded-lg gap-1">
                      {PLATFORMS[form.platform].types.map(pt=>{ const Icon=TYPE_ICONS[pt]; const on=form.post_type===pt; return (
                        <button key={pt} onClick={()=>set('post_type',pt)} className={`${SEG_BASE} ${on?SEG_ON:SEG_OFF}`}><Icon size={12}/>{TYPE_LABELS[pt]}</button>
                      );})}
                    </div>
                    {isStory&&<p className="text-[11px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg px-3 py-2">Caption will be overlaid at the bottom of the story image.</p>}
                    {isReel&&<p className="text-[11px] text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/30 rounded-lg px-3 py-2">After generating your caption, Step 2 will let you create the video with voiceover.</p>}
                  </div>
                )}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide">Product Name <span className="text-red-400">*</span></label>
                  <input type="text" value={form.product_name} onChange={e=>set('product_name',e.target.value)} placeholder="e.g. Archi POP's Chips 4-Pack" className={INPUT}/>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide">Description <span className="text-slate-400 font-normal normal-case">(optional)</span></label>
                  <textarea value={form.product_description} onChange={e=>set('product_description',e.target.value)} rows={2} className={INPUT}/>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide">Campaign</label>
                    <select value={form.campaign_type} onChange={e=>set('campaign_type',e.target.value)} className={INPUT}>
                      <option value="social_media">Social Media</option><option value="clearance">Clearance Sale</option><option value="seasonal">Seasonal</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide">Tone</label>
                    <select value={form.tone} onChange={e=>set('tone',e.target.value)} className={INPUT}>
                      <option value="engaging">Engaging</option><option value="urgent">Urgent</option><option value="casual">Casual</option><option value="professional">Professional</option>
                    </select>
                  </div>
                </div>
                <button onClick={handleGenerate} disabled={loading||imgLoading||!form.product_name.trim()}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                  {loading?<Loader2 size={15} className="animate-spin"/>:<Sparkles size={15}/>}
                  {loading?'Generating…':result?'Re-generate Content':'Generate Content'}
                </button>
              </div>
            </div>

            {/* STEP 2 — Reel */}
            {isReel && (
              <div className={`${CARD} ${!step1Done?'opacity-60 pointer-events-none':''}`}>
                <div className="px-5 pt-4 pb-3 border-b border-slate-100 dark:border-gray-800 flex items-center gap-3">
                  <StepBadge n={2} active={step1Done&&!step2Done} done={step2Done}/>
                  <div><p className="text-sm font-semibold text-slate-800 dark:text-gray-100">Generate Reel Video</p><p className="text-[11px] text-slate-400 mt-0.5">Create video, add voiceover & music</p></div>
                </div>
                <div className="p-5 space-y-3">
                  <button onClick={handleGenerateVideo} disabled={!step1Done||vidLoading}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors">
                    {vidLoading?<Loader2 size={14} className="animate-spin"/>:<Play size={14}/>}
                    {vidLoading?'Generating video (1–3 min)…':result?.video_url?'Re-generate Video':'Generate Video'}
                  </button>
                  {vidError&&<div className="flex items-start gap-1.5 p-2.5 bg-red-50 dark:bg-red-950/30 rounded-lg text-[11px] text-red-600 dark:text-red-400"><AlertCircle size={12} className="mt-0.5 shrink-0"/>{vidError}</div>}
                  {result?.video_url&&(
                    <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-gray-800">
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                          <Mic size={11}/> Voiceover (ElevenLabs TTS)
                          {voiceoverFetched&&!voiceoverLoading&&<span className="ml-auto text-emerald-500 font-normal normal-case text-[10px]">AI-generated ✓</span>}
                        </label>
                        <div className="flex gap-2">
                          <input type="text" value={voiceoverText} onChange={e=>setVoiceoverText(e.target.value)} placeholder="Short spoken line for the reel…" className={INPUT}/>
                          <button onClick={fetchVoiceoverLine} disabled={voiceoverLoading} title="Re-generate"
                            className="shrink-0 flex items-center justify-center w-9 h-9 bg-violet-100 dark:bg-violet-900/30 text-violet-600 rounded-lg hover:bg-violet-200 disabled:opacity-50 transition-colors">
                            {voiceoverLoading?<Loader2 size={13} className="animate-spin"/>:<RefreshCw size={13}/>}
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-400">Spoken aloud via AI voice over the reel. Edit or regenerate.</p>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                          <Music size={11}/> Background Music
                          {result.video_url_with_music&&<span className="ml-auto text-emerald-500 font-normal normal-case text-[10px]">✓ Mixed</span>}
                        </label>
                        <select value={musicGenre} onChange={e=>setMusicGenre(e.target.value)} className={INPUT}>
                          {GENRES.map(g=><option key={g.value} value={g.value}>{g.label}</option>)}
                        </select>
                        {musicError&&<div className="flex items-start gap-1.5 p-2 bg-red-50 dark:bg-red-950/30 rounded-lg text-[11px] text-red-600 dark:text-red-400"><AlertCircle size={11} className="mt-0.5 shrink-0"/>{musicError}</div>}
                        <button onClick={handleAddMusic} disabled={musicLoading||musicGenre==='none'}
                          className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-violet-600 text-white rounded-lg text-xs font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors">
                          {musicLoading?<Loader2 size={12} className="animate-spin"/>:<Music size={12}/>}
                          {musicLoading?'Mixing voiceover + music…':result.video_url_with_music?'Re-mix Audio':'Mix Voiceover + Music'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* STEP 3 (or 2) — Publish */}
            <div className={`${CARD} ${(!step1Done||!step2Done)?'opacity-60 pointer-events-none':''}`}>
              <div className="px-5 pt-4 pb-3 border-b border-slate-100 dark:border-gray-800 flex items-center gap-3">
                <StepBadge n={isReel?3:2} active={step1Done&&step2Done&&!allDone} done={allDone}/>
                <div><p className="text-sm font-semibold text-slate-800 dark:text-gray-100">Publish via Buffer</p><p className="text-[11px] text-slate-400 mt-0.5">Select platforms, set timing, then post</p></div>
              </div>
              <div className="p-5 space-y-4">
                <div className="space-y-2">
                  <label className="text-[11px] font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide">Publish to</label>
                  {Object.entries(PLATFORMS).map(([k,cfg])=>{ const inc=k==='twitter'&&(isStory||isReel); const Icon=cfg.icon; const state=pubState[k]; const on=pubTargets[k]&&!inc; return (
                    <label key={k} className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer select-none ${inc?'opacity-40 cursor-not-allowed border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800/50':state==='done'?'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/20':state==='error'?'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/20':on?'border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/20':'border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-slate-300 dark:hover:border-gray-600'}`}>
                      <input type="checkbox" checked={on} disabled={inc||state==='done'} onChange={e=>setPubTargets(prev=>({...prev,[k]:e.target.checked}))} className="w-4 h-4 accent-indigo-600 shrink-0"/>
                      <Icon size={14} className={cfg.color}/>
                      <span className="flex-1 text-xs font-semibold text-slate-700 dark:text-gray-200">{cfg.label}</span>
                      {inc&&<span className="text-[10px] text-slate-400 italic">Not available for {form.post_type}s</span>}
                      {state==='posting'&&<Loader2 size={13} className="animate-spin text-indigo-500"/>}
                      {state==='done'&&<Check size={13} className="text-emerald-500"/>}
                      {state==='error'&&<AlertCircle size={13} className="text-red-400"/>}
                    </label>
                  );})}
                  {Object.entries(pubErrors).map(([p,err])=>(
                    <div key={p} className="flex items-start gap-1.5 p-2 bg-red-50 dark:bg-red-950/30 rounded-lg text-[11px] text-red-600 dark:text-red-400">
                      <AlertCircle size={11} className="mt-0.5 shrink-0"/><span><strong>{PLATFORMS[p]?.label}:</strong> {err}</span>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide">When to Post</label>
                  <div className="flex p-1 bg-slate-100 dark:bg-gray-800 rounded-lg gap-1">
                    {[['now','Post Now'],['later','Schedule for Later']].map(([v,l])=>(
                      <button key={v} onClick={()=>setSchedMode(v)} className={`${SEG_BASE} ${schedMode===v?SEG_ON:SEG_OFF}`}>{l}</button>
                    ))}
                  </div>
                  {schedMode==='later'&&<DateTimePicker value={schedAt} onChange={setSchedAt}/>}
                  {schedMode==='later'&&<p className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 rounded-lg px-3 py-2">⏰ Post fires at the scheduled time — keep this page open.</p>}
                </div>
                <button onClick={handlePublish}
                  disabled={!step1Done||!step2Done||anyPosting||!anyTargeted||allDone||imgLoading||vidLoading||musicLoading}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                  {anyPosting?<Loader2 size={15} className="animate-spin"/>:allDone?<Check size={15}/>:<Send size={15}/>}
                  {anyPosting?(schedMode==='later'?'Scheduling…':'Posting…'):allDone?(schedMode==='later'?'Scheduled!':'Posted to Buffer!'):schedMode==='later'?'Schedule Post':'Post to Buffer'}
                </button>
                {allDone&&(
                  <button onClick={()=>{setPubState({});setPubErrors({});}}
                    className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-gray-200 transition-colors">
                    <RefreshCw size={12}/> Post to more platforms
                  </button>
                )}
              </div>
            </div>

          </div>

          {/* RIGHT: Preview */}
          <div className="xl:col-span-3">
            <div className={`${CARD} p-5 xl:sticky xl:top-4`}>
              {result ? (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-slate-800 dark:text-gray-100 text-sm">Generated Preview</h3>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {(()=>{ const pc=PLATFORMS[form.platform]; const PI=pc.icon; const TI=TYPE_ICONS[form.post_type]; return (<>
                          <span className={`flex items-center gap-1 text-[11px] font-medium ${pc.color}`}><PI size={10}/>{pc.label}</span>
                          <span className="text-[11px] text-slate-400 capitalize flex items-center gap-1"><TI size={10}/>{form.post_type}</span>
                          <span className="text-[11px] text-slate-400 capitalize">{form.campaign_type.replace('_',' ')}</span>
                          {imgLoading&&<span className="text-[11px] text-indigo-500 flex items-center gap-1"><Loader2 size={10} className="animate-spin"/>Generating image…</span>}
                        </>);})()}
                      </div>
                    </div>
                    <button onClick={copyCaption}
                      className="shrink-0 flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-gray-200 border border-slate-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 transition-colors">
                      {copied?<Check size={12} className="text-green-500"/>:<Copy size={12}/>}{copied?'Copied!':'Copy'}
                    </button>
                  </div>
                  {isReel ? (
                    <div className="w-full aspect-[9/16] max-h-[480px] overflow-hidden rounded-xl border border-slate-100 dark:border-gray-800 bg-slate-50 dark:bg-gray-800 flex items-center justify-center">
                      {finalVideo?<video src={finalVideo} controls className="w-full h-full object-cover"/>
                       :vidLoading?<div className="flex flex-col items-center gap-2 text-slate-400"><Loader2 size={24} className="animate-spin"/><p className="text-xs font-medium">Generating reel…</p><p className="text-[10px] opacity-70">1–3 minutes via Replicate</p></div>
                       :<div className="flex flex-col items-center gap-3 text-slate-300 dark:text-gray-600"><Film size={40} strokeWidth={1.5}/><p className="text-xs text-slate-400">Complete Step 2 to generate video</p></div>}
                    </div>
                  ) : (
                    <div className={`w-full overflow-hidden rounded-xl border border-slate-100 dark:border-gray-800 bg-slate-50 dark:bg-gray-800 flex items-center justify-center ${isStory?'aspect-[9/16] max-h-[480px]':'aspect-square max-h-80'}`}>
                      {imgLoading?<div className="flex flex-col items-center gap-2 text-slate-400"><Loader2 size={24} className="animate-spin"/><p className="text-xs">Generating image…</p></div>
                       :result.image_url?<div className="relative w-full h-full"><img src={result.image_url} alt="Generated" className="w-full h-full object-cover"/>
                          {isStory&&<div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-5"><p className="text-white text-sm font-semibold leading-snug line-clamp-5 text-left drop-shadow">{result.caption}</p><p className="text-white/50 text-[10px] mt-1.5">Caption baked onto image before upload</p></div>}
                        </div>
                       :<div className="flex flex-col items-center gap-2 text-slate-300 dark:text-gray-600"><ImageIcon size={32} strokeWidth={1.5}/><p className="text-xs text-slate-400">Image unavailable</p></div>}
                    </div>
                  )}
                  {isReel&&voiceoverText&&(
                    <div className="flex items-start gap-2 p-3 bg-violet-50 dark:bg-violet-950/20 rounded-xl border border-violet-100 dark:border-violet-800/40">
                      <Mic size={13} className="text-violet-500 mt-0.5 shrink-0"/>
                      <div><p className="text-[10px] font-semibold text-violet-600 dark:text-violet-400 uppercase tracking-wide mb-0.5">Voiceover</p>
                        <p className="text-xs text-violet-800 dark:text-violet-200 italic">"{voiceoverText}"</p></div>
                    </div>
                  )}
                  <div className="bg-slate-50 dark:bg-gray-800 rounded-xl p-4">
                    <p className="text-sm text-slate-800 dark:text-gray-100 leading-relaxed whitespace-pre-wrap">{result.caption}</p>
                  </div>
                  {result.hashtags?.length>0&&(
                    <div className="flex flex-wrap gap-1.5">
                      {result.hashtags.map((t,i)=><span key={i} className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-full text-xs font-medium">{t}</span>)}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-24 gap-4">
                  <Sparkles size={48} strokeWidth={1.5} className="text-slate-300 dark:text-gray-600"/>
                  <div className="text-center">
                    <p className="text-sm font-medium text-slate-500 dark:text-gray-400">Your content preview will appear here</p>
                    <p className="text-xs text-slate-400 dark:text-gray-500 mt-1">Fill in Step 1 and click Generate Content</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ CALENDAR TAB ════════════════════════════════════════════════════ */}
      {tab==='calendar'&&(
        <div className="space-y-4">
          {/* Auto-campaign banner */}
          <div className="flex items-center justify-between p-4 bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-950/30 dark:to-indigo-950/30 rounded-2xl border border-violet-100 dark:border-violet-800/40">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center shrink-0"><Zap size={18} className="text-white"/></div>
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-gray-100">Auto-Campaign</p>
                <p className="text-xs text-slate-500 dark:text-gray-400">Select a date range and automatically generate + schedule one post per day from your top products</p>
              </div>
            </div>
            <button onClick={()=>setAutoModal(true)}
              className="shrink-0 flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white rounded-lg text-xs font-semibold hover:bg-violet-700 transition-colors ml-4">
              <Zap size={12}/> Launch
            </button>
          </div>

          {!histDone?(
            <div className="flex justify-center py-16"><Loader2 size={22} className="animate-spin text-slate-300"/></div>
          ):(
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <CalendarView history={history} selectedDay={selDay} onSelectDay={setSelDay} rangeMode={false}/>
                  {history.length>0&&(
                    <div className="flex justify-end">
                      <button onClick={clearHistory} className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-600 transition-colors">
                        <Trash2 size={12}/> Clear all history
                      </button>
                    </div>
                  )}
                </div>
                <div>
                  {selDay?(
                    <DayDetail dateStr={selDay} history={history} onDelete={removeFromHistory} onScheduleForDay={(ds)=>setCalModal(ds)}/>
                  ):history.length===0?(
                    <div className={`${CARD} p-5 flex flex-col items-center justify-center py-16 gap-3`}>
                      <CalendarDays size={44} className="text-slate-300 dark:text-gray-600"/>
                      <p className="text-sm text-slate-500">No posts yet</p>
                      <p className="text-xs text-slate-400 text-center px-4">Posts appear here after publishing via Buffer</p>
                      <button onClick={()=>setTab('create')}
                        className="mt-2 flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-colors">
                        <Plus size={13}/> Create your first post
                      </button>
                    </div>
                  ):(
                    <div className={`${CARD} p-5 flex flex-col items-center justify-center py-12 gap-2`}>
                      <CalendarDays size={32} className="text-slate-300 dark:text-gray-600"/>
                      <p className="text-sm text-slate-400">Click a day to see posts</p>
                      <p className="text-xs text-slate-400">Click a future day to schedule a new post</p>
                    </div>
                  )}
                </div>
              </div>

              {(()=>{
                const up=history.filter(e=>e.status==='scheduled'&&e.scheduled_at&&new Date(e.scheduled_at)>new Date())
                  .sort((a,b)=>new Date(a.scheduled_at)-new Date(b.scheduled_at)).slice(0,5);
                if(!up.length) return null;
                return (
                  <div className={`${CARD} p-5`}>
                    <h3 className="font-semibold text-slate-800 dark:text-gray-100 text-sm mb-3 flex items-center gap-2">
                      <Clock size={14} className="text-amber-500"/> Upcoming Scheduled Posts
                    </h3>
                    <div className="space-y-2">
                      {up.map(e=>{ const pc=PLATFORMS[e.platform]; const PI=pc?.icon||Instagram; const TI=TYPE_ICONS[e.post_type]||ImageIcon; const dt=new Date(e.scheduled_at); return (
                        <div key={e.id} className="flex items-center gap-3 py-2 border-b border-slate-50 dark:border-gray-800 last:border-0">
                          <div className="shrink-0 text-center w-10">
                            <div className="text-[10px] text-slate-400">{dt.toLocaleDateString(undefined,{month:'short'})}</div>
                            <div className="text-base font-bold text-slate-700 dark:text-gray-200 leading-none">{dt.getDate()}</div>
                            <div className="text-[10px] text-slate-400">{dt.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}</div>
                          </div>
                          <div className="shrink-0 w-8 h-8 rounded-lg overflow-hidden bg-slate-100 dark:bg-gray-800 flex items-center justify-center">
                            {e.image_url?<img src={e.image_url} alt="" className="w-full h-full object-cover"/>:<TI size={14} className="text-slate-400"/>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-700 dark:text-gray-200 truncate">{e.product_name}</p>
                            <span className={`text-[10px] ${pc?.color||''} flex items-center gap-1`}><PI size={9}/>{pc?.label} · {e.post_type}</span>
                          </div>
                          <span className="text-[10px] bg-amber-100 dark:bg-amber-950/40 text-amber-600 px-2 py-1 rounded-full font-medium shrink-0">Scheduled</span>
                        </div>
                      );})}
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}
    </div>
  );
}
import { useState, useCallback, useRef, useEffect } from 'react';
import SplashScreen from './components/SplashScreen';
import AuthPage from './pages/AuthPage';
import appLogo    from './assets/app_logo.png';
import mascotImg  from './assets/mascot_for_chatbot.png';

const AUTH_KEY = 'retailIntelAuth';
const isAuthed = () => { try { return !!sessionStorage.getItem(AUTH_KEY); } catch { return false; } };
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, BarChart3, Megaphone, Bot, Package,
  ChevronLeft, ChevronRight, Sun, Moon, LogOut, Settings,
  Send, X,
} from 'lucide-react';
import ErrorBoundary from './components/ErrorBoundary';
import Dashboard from './pages/Dashboard';
import StoreAnalytics from './pages/StoreAnalytics';
import MarketingGenerator from './pages/MarketingGenerator';
import AIAssistant from './pages/AIAssistant';
import InventoryInsights from './pages/InventoryInsights';
import SettingsPage from './pages/SettingsPage';
import { useTheme } from './context/ThemeContext';
import { useTranslation } from 'react-i18next';
import { chatWithAdvisor } from './api';
import { ROLE_SESSION_KEY } from './pages/AuthPage';
import './index.css';

// ── Role permissions ───────────────────────────────────────────────────────────
const ROLE_PERMS = {
  owner:   { pages: new Set(['/', '/analytics', '/marketing', '/assistant', '/inventory', '/settings']), financial: true,  label: 'Owner',   badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  partner: { pages: new Set(['/', '/analytics', '/marketing', '/assistant', '/inventory', '/settings']), financial: true,  label: 'Partner', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  manager: { pages: new Set(['/', '/analytics', '/assistant', '/inventory', '/settings']),               financial: false, label: 'Manager', badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300' },
  staff:   { pages: new Set(['/inventory', '/assistant']),                                               financial: false, label: 'Staff',   badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
};
const getLoginRole = () => sessionStorage.getItem(ROLE_SESSION_KEY) || 'owner';
const getRolePerms = () => ROLE_PERMS[getLoginRole()] || ROLE_PERMS.owner;

/* ── Munim AI Logo ────────────────────────────────────────────────────── */
function MunimLogo({ size = 32 }) {
  return (
    <div
      className="rounded-xl bg-blue-600 flex items-center justify-center overflow-hidden shrink-0"
      style={{ width: size, height: size, padding: size * 0.1 }}
    >
      {/* The logo PNG is black on white — filter makes it white, renders on blue bg */}
      <img
        src={appLogo}
        alt="Munim AI"
        className="w-full h-full object-contain"
        style={{ filter: 'brightness(0) invert(1)' }}
      />
    </div>
  );
}

const navItems = [
  { path: '/',          label: 'Dashboard',       icon: LayoutDashboard },
  { path: '/analytics', label: 'Store Analytics',  icon: BarChart3 },
  { path: '/marketing', label: 'Marketing',         icon: Megaphone },
  { path: '/assistant', label: 'AI Assistant',      icon: Bot },
  { path: '/inventory', label: 'Inventory',         icon: Package },
];

const PAGE_TITLES = {
  '/':          'Dashboard',
  '/analytics': 'Store Analytics',
  '/marketing': 'Marketing Generator',
  '/assistant': 'AI Assistant',
  '/inventory': 'Inventory Insights',
  '/settings':  'Store Settings',
};

/* ── Sidebar ──────────────────────────────────────────────────────────── */
function Sidebar({ open, setOpen, onLogout }) {
  const { t } = useTranslation();
  const perms = getRolePerms();
  const visibleNav = navItems.filter(item => perms.pages.has(item.path));

  return (
    <aside className={`${open ? 'w-56' : 'w-16'} relative flex flex-col shrink-0 transition-all duration-300
      bg-white dark:bg-gray-900 border-r border-blue-50 dark:border-gray-800`}>

      {/* Logo */}
      <div className="h-16 px-4 border-b border-blue-50 dark:border-gray-800 flex items-center gap-3 overflow-hidden">
        <div className="shrink-0">
          <MunimLogo size={34} />
        </div>
        {open && (
          <div className="overflow-hidden animate-fade-in">
            <p className="font-bold text-slate-800 dark:text-gray-100 text-sm leading-tight whitespace-nowrap tracking-tight">
              Munim <span className="text-orange-500">AI</span>
            </p>
            <p className="text-[10px] text-slate-400 dark:text-gray-500 whitespace-nowrap font-medium">SME Retail Platform</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-hidden">
        {visibleNav.map(({ path, label, icon: Icon }, idx) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            title={!open ? label : undefined}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 animate-fade-in-up delay-${(idx + 1) * 75} ` +
              (isActive
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-200 dark:shadow-blue-900/50'
                : 'text-slate-500 dark:text-gray-400 hover:bg-blue-50 dark:hover:bg-gray-800 hover:text-blue-700 dark:hover:text-gray-100')
            }
          >
            <Icon size={17} className="shrink-0" />
            {open && <span className="whitespace-nowrap overflow-hidden text-ellipsis">{t(`sidebar.${path}`, label)}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Bottom utilities */}
      <div className="p-3 border-t border-blue-50 dark:border-gray-800 space-y-0.5">
        {/* Role badge */}
        {open && (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl mb-1 ${perms.badge}`}>
            <span className="text-[11px] font-bold tracking-wide">{perms.label}</span>
            <span className="text-[10px] font-medium opacity-70">· {perms.financial ? 'Full access' : 'Restricted'}</span>
          </div>
        )}
        {!open && (
          <div title={`Role: ${perms.label}`}
            className={`w-full flex items-center justify-center px-3 py-2 rounded-xl mb-1 ${perms.badge}`}>
            <span className="text-[10px] font-bold">{perms.label[0]}</span>
          </div>
        )}

        <NavLink
          to="/settings"
          title={!open ? 'Settings' : undefined}
          className={({ isActive }) =>
            'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ' +
            (isActive
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-500 dark:text-gray-400 hover:bg-blue-50 dark:hover:bg-gray-800 hover:text-blue-700 dark:hover:text-gray-100')
          }
        >
          <Settings size={17} className="shrink-0" />
          {open && <span>{t('sidebar.settings', 'Settings')}</span>}
        </NavLink>

        <button
          onClick={onLogout}
          title={!open ? 'Log out' : undefined}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
            text-slate-400 dark:text-gray-500 hover:bg-red-50 dark:hover:bg-red-950/30
            hover:text-red-500 dark:hover:text-red-400 transition-colors"
        >
          <LogOut size={17} className="shrink-0" />
          {open && <span>{t('sidebar.logout', 'Log out')}</span>}
        </button>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setOpen(v => !v)}
        className="absolute -right-3 top-[4.75rem] z-10 w-6 h-6
          bg-white dark:bg-gray-900 border border-blue-100 dark:border-gray-700
          rounded-full flex items-center justify-center shadow-sm
          text-slate-400 hover:text-blue-600 hover:border-blue-300 transition-all hover:scale-110"
      >
        {open ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
      </button>
    </aside>
  );
}

/* ── Top Header ───────────────────────────────────────────────────────── */
function Header() {
  const location = useLocation();
  const { dark, toggle } = useTheme();
  const { t } = useTranslation();
  const title = t(`pageTitles.${location.pathname}`, PAGE_TITLES[location.pathname] ?? 'Dashboard');

  return (
    <header className="h-14 px-6 shrink-0 flex items-center justify-between
      bg-white dark:bg-gray-900 border-b border-blue-50 dark:border-gray-800">
      <h1 className="text-sm font-semibold text-slate-600 dark:text-gray-400 tracking-wide">{title}</h1>
      <div className="flex items-center gap-2">
        <button
          onClick={toggle}
          title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="w-8 h-8 rounded-xl flex items-center justify-center
            text-slate-500 dark:text-gray-400
            hover:bg-blue-50 dark:hover:bg-gray-800 transition-all hover:text-blue-600 hover:scale-105"
        >
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </header>
  );
}

// ── Hinglish detector (same logic as AIAssistant) ─────────────────────────────
const HINGLISH_WORDS_F = new Set([
  'kya','kyun','kyunki','kab','kaise','kaun','kahan','kitna','kitne','kitni',
  'mujhe','hume','humko','aapko','tumko','hum','aap','tum','main','mein','mei',
  'ek','do','teen','bhi','nahi','nahin','nhi','hai','hain','hoga','ho','kar','karo',
  'se','ko','ka','ki','ke','wala','wali','wale','yeh','woh','ye','wo','iska','uska',
  'bahut','accha','acha','sahi','theek','thik','zyada','zyadi','jyada','kam','kum',
  'jaldi','abhi','kal','aaj','matlab','batao','bolo','dikhao','chahiye','milega',
  'bata','dekho','sunno','bhai','yaar','raha','rahi','rahe','bikta','bika','bik',
  'sabse','badhiya','zyade','thoda','sab','kuch','bol','sun','dekh','le','de',
]);
function detectHinglishF(text) {
  const words = text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  const count = words.filter(w => HINGLISH_WORDS_F.has(w)).length;
  return count >= 2 || (words.length >= 4 && count / words.length >= 0.2);
}
const FLOAT_LANG_HI = '\n\n[Note: User is writing in Hinglish. Please respond in Hinglish — Hindi written in Roman script, mixed naturally with English.]';
const FLOAT_LANG_EN = '\n\n[Note: User is writing in English. Please respond in English.]';

const FLOAT_ROLE_POLICY = {
  owner:   `[SECURITY: Role=Owner. Full access — discuss all financial data freely.]`,
  partner: `[SECURITY: Role=Partner. Full access — discuss all financial data freely.]`,
  manager: `[SECURITY: Role=Manager. Operational access — discuss analytics and inventory. Avoid detailed profit breakdowns.]`,
  staff:   `[SECURITY: Role=Staff. RESTRICTED. Only answer stock/inventory questions. REFUSE revenue, profit, or financial data.]`,
};
const getFloatRolePolicy = () => FLOAT_ROLE_POLICY[sessionStorage.getItem(ROLE_SESSION_KEY)] || FLOAT_ROLE_POLICY.owner;
const FLOAT_INIT = {
  en: "Namaste! 🙏 Main hoon Munim Ji — your store's AI advisor. Ask me about sales, inventory, expiring products, or anything else about your store!",
  hi: "Namaste! 🙏 Main hoon Munim Ji — aapke store ka AI advisor. Sales, inventory, expiring products — kuch bhi poochho!",
};

/* ── Munim Ji — Floating chatbot ──────────────────────────────────────── */
function MunimJi() {
  const { i18n } = useTranslation();
  const initLang = i18n.language === 'hi' ? 'hi' : 'en';
  const [open, setOpen]       = useState(false);
  const [input, setInput]     = useState('');
  const [loading, setLoading] = useState(false);
  const [chatLang, setChatLang] = useState(initLang);
  const [messages, setMessages] = useState([{ role: 'assistant', content: FLOAT_INIT[initLang] }]);
  const messagesEndRef = useRef(null);

  // Sync with app-level language changes (settings toggle)
  useEffect(() => {
    const lang = i18n.language === 'hi' ? 'hi' : 'en';
    setChatLang(lang);
    setMessages(prev =>
      prev.length === 1 ? [{ role: 'assistant', content: FLOAT_INIT[lang] }] : prev
    );
  }, [i18n.language]);

  useEffect(() => {
    if (open) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  const handleSend = async (e) => {
    e?.preventDefault();
    const msg = input.trim();
    if (!msg || loading) return;
    setInput('');
    const isHinglish = detectHinglishF(msg);
    const msgLang = isHinglish ? 'hi' : 'en';
    setChatLang(msgLang);
    const next = [...messages, { role: 'user', content: msg }];
    setMessages(next);
    setLoading(true);
    try {
      const langNote   = msgLang === 'hi' ? FLOAT_LANG_HI : FLOAT_LANG_EN;
      const rolePolicy = getFloatRolePolicy();
      const res = await chatWithAdvisor(msg + langNote + '\n' + rolePolicy, 'munim-ji-float');
      setMessages([...next, { role: 'assistant', content: res.data.response }]);
    } catch {
      setMessages([...next, { role: 'assistant', content: msgLang === 'hi' ? 'Yaar, abhi offline hoon. Thodi der mein try karo!' : 'I seem to be offline right now. Please try again in a moment.' }]);
    }
    setLoading(false);
  };

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end gap-3">
      {/* Chat window */}
      {open && (
        <div
          className="w-80 bg-white dark:bg-gray-900 rounded-3xl overflow-hidden
            shadow-2xl shadow-blue-200/40 dark:shadow-blue-900/40
            border border-blue-100 dark:border-gray-800 flex flex-col animate-slide-up-bounce"
          style={{ height: '440px' }}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3 flex items-center gap-3 shrink-0">
            {/* Mascot: dark-blue bg so the white illustration shows naturally */}
            <div className="w-11 h-11 rounded-2xl overflow-hidden bg-white shrink-0 border-2 border-blue-100 flex items-end justify-center">
              <img
                src={mascotImg}
                alt="Munim Ji"
                className="w-[120%] object-cover object-top"
                style={{ transform: 'translateY(3px)', filter: 'sepia(1) hue-rotate(200deg) saturate(6) brightness(0.55)' }}
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-sm leading-tight">Munim Ji</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                <p className="text-blue-200 text-[10px] font-medium">AI Retail Advisor · Online</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-white/60 hover:text-white transition-colors hover:scale-110 active:scale-95"
            >
              <X size={16} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 animate-fade-in-up ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 mt-0.5
                    bg-white border border-blue-100 flex items-end justify-center">
                    <img src={mascotImg} alt="Munim Ji"
                      className="w-[120%] object-cover"
                      style={{ transform: 'translateY(2px)', filter: 'sepia(1) hue-rotate(200deg) saturate(6) brightness(0.55)' }} />
                  </div>
                )}
                <div className={`max-w-[76%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-sm'
                    : 'bg-slate-100 dark:bg-gray-800 text-slate-700 dark:text-gray-200 rounded-bl-sm'
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full overflow-hidden shrink-0
                  bg-white border border-blue-100 flex items-end justify-center">
                  <img src={mascotImg} alt="" className="w-[120%] object-cover"
                    style={{ transform: 'translateY(2px)' }} />
                </div>
                <div className="bg-slate-100 dark:bg-gray-800 rounded-2xl rounded-bl-sm px-3 py-2 flex gap-1.5 items-center">
                  {[0, 150, 300].map(d => (
                    <span key={d} className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"
                      style={{ animationDelay: `${d}ms` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSend} className="p-3 border-t border-blue-50 dark:border-gray-800 flex gap-2 shrink-0 bg-white dark:bg-gray-900">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={chatLang === 'hi' ? 'Kuch bhi poochho Munim Ji se…' : 'Ask Munim Ji anything…'}
              className="flex-1 text-xs px-3 py-2.5 rounded-xl border border-slate-200 dark:border-gray-700
                bg-slate-50 dark:bg-gray-800 text-slate-700 dark:text-gray-200
                placeholder:text-slate-400 dark:placeholder:text-gray-600
                focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="w-9 h-9 rounded-xl flex items-center justify-center
                bg-gradient-to-br from-blue-500 to-blue-700
                text-white disabled:opacity-40 hover:brightness-110 transition-all active:scale-95"
            >
              <Send size={13} />
            </button>
          </form>
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        className={`relative w-14 h-14 rounded-full overflow-hidden shadow-xl
          transition-all duration-200 hover:scale-110 active:scale-95
          ${open
            ? 'bg-slate-100 dark:bg-gray-800 border-2 border-slate-300 dark:border-gray-600'
            : 'bg-white border-[3px] border-orange-400 animate-glow-ring'
          }`}
      >
        {open ? (
          <div className="w-full h-full flex items-center justify-center bg-slate-100 dark:bg-gray-800">
            <X size={22} className="text-slate-600 dark:text-gray-300" />
          </div>
        ) : (
          <img
            src={mascotImg}
            alt="Munim Ji"
            className="w-full h-full object-cover object-top"
            style={{ transform: 'scale(1.15) translateY(6px)', filter: 'sepia(1) hue-rotate(200deg) saturate(6) brightness(0.55)' }}
          />
        )}
        {!open && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-orange-500 rounded-full
            flex items-center justify-center text-[9px] text-white font-bold
            border-2 border-white shadow-sm animate-pop-in">
            AI
          </span>
        )}
      </button>
    </div>
  );
}

/* ── Protected Route ──────────────────────────────────────────────────── */
function ProtectedRoute({ path, children }) {
  const perms = getRolePerms();
  if (!perms.pages.has(path)) {
    const home = getLoginRole() === 'staff' ? '/inventory' : '/';
    return <Navigate to={home} replace />;
  }
  return children;
}

/* ── Inactivity timeout warning modal ────────────────────────────────── */
const INACTIVITY_MS  = 20 * 60 * 1000; // 20 minutes
const WARNING_BEFORE = 60;             // show warning 60s before logout

function InactivityGuard({ onLogout }) {
  const [countdown, setCountdown] = useState(null); // null = no warning
  const warnTimerRef   = useRef(null);
  const logoutTimerRef = useRef(null);
  const countRef       = useRef(null);

  const reset = useCallback(() => {
    setCountdown(null);
    clearTimeout(warnTimerRef.current);
    clearTimeout(logoutTimerRef.current);
    clearInterval(countRef.current);

    warnTimerRef.current = setTimeout(() => {
      setCountdown(WARNING_BEFORE);
      let c = WARNING_BEFORE;
      countRef.current = setInterval(() => {
        c -= 1;
        setCountdown(c);
        if (c <= 0) { clearInterval(countRef.current); }
      }, 1000);
    }, INACTIVITY_MS - WARNING_BEFORE * 1000);

    logoutTimerRef.current = setTimeout(onLogout, INACTIVITY_MS);
  }, [onLogout]);

  useEffect(() => {
    const events = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];
    const handler = () => reset();
    events.forEach(e => document.addEventListener(e, handler, { passive: true }));
    reset();
    return () => {
      events.forEach(e => document.removeEventListener(e, handler));
      clearTimeout(warnTimerRef.current);
      clearTimeout(logoutTimerRef.current);
      clearInterval(countRef.current);
    };
  }, [reset]);

  if (countdown === null) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-gray-700 p-7 max-w-sm w-full text-center animate-fade-in-up">
        <div className="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl font-bold text-amber-600 dark:text-amber-400 tabular-nums">{countdown}</span>
        </div>
        <h3 className="text-base font-bold text-slate-800 dark:text-white mb-1">Still there?</h3>
        <p className="text-sm text-slate-400 dark:text-gray-500 mb-5">
          You'll be logged out in <span className="font-semibold text-amber-600 dark:text-amber-400">{countdown}s</span> due to inactivity.
        </p>
        <button
          onClick={reset}
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          Stay logged in
        </button>
        <button
          onClick={onLogout}
          className="mt-2 w-full py-2 text-xs text-slate-400 dark:text-gray-600 hover:text-red-500 transition-colors"
        >
          Log out now
        </button>
      </div>
    </div>
  );
}

/* ── App ──────────────────────────────────────────────────────────────── */
function App() {
  const [open, setOpen]     = useState(true);
  const [splash, setSplash] = useState(true);
  const [authed, setAuthed] = useState(isAuthed);
  const hideSplash = useCallback(() => setSplash(false), []);

  const handleAuthDone = useCallback((role = 'owner') => {
    sessionStorage.setItem(AUTH_KEY, '1');
    sessionStorage.setItem(ROLE_SESSION_KEY, role);
    setAuthed(true);
  }, []);

  const handleLogout = useCallback(() => {
    sessionStorage.removeItem(AUTH_KEY);
    sessionStorage.removeItem(ROLE_SESSION_KEY);
    setAuthed(false);
  }, []);

  if (splash) return <SplashScreen onDone={hideSplash} />;
  if (!authed) return <AuthPage onDone={handleAuthDone} />;

  return (
    <BrowserRouter>
      <div className="flex h-screen bg-slate-50 dark:bg-gray-950 overflow-hidden">
        <Sidebar open={open} setOpen={setOpen} onLogout={handleLogout} />
        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          <Header />
          <div className="flex-1 overflow-auto p-6">
            <ErrorBoundary>
              <Routes>
                <Route path="/"          element={<ProtectedRoute path="/"><Dashboard /></ProtectedRoute>} />
                <Route path="/analytics" element={<ProtectedRoute path="/analytics"><StoreAnalytics /></ProtectedRoute>} />
                <Route path="/marketing" element={<ProtectedRoute path="/marketing"><MarketingGenerator /></ProtectedRoute>} />
                <Route path="/assistant" element={<ProtectedRoute path="/assistant"><AIAssistant /></ProtectedRoute>} />
                <Route path="/inventory" element={<InventoryInsights />} />
                <Route path="/settings"  element={<ProtectedRoute path="/settings"><SettingsPage /></ProtectedRoute>} />
              </Routes>
            </ErrorBoundary>
          </div>
        </main>
      </div>
      {/* Global floating chatbot */}
      <MunimJi />
      {/* Zero Trust: session inactivity guard */}
      <InactivityGuard onLogout={handleLogout} />
    </BrowserRouter>
  );
}

export default App;

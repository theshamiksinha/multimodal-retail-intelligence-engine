import { useState, useCallback } from 'react';
import SplashScreen from './components/SplashScreen';
import AuthPage from './pages/AuthPage';

const AUTH_KEY = 'retailIntelAuth';
const isAuthed = () => { try { return !!sessionStorage.getItem(AUTH_KEY); } catch { return false; } };
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, BarChart3, Megaphone, Bot, Package,
  ChevronLeft, ChevronRight, Sun, Moon, Store, LogOut, Settings,
} from 'lucide-react';
import ErrorBoundary from './components/ErrorBoundary';
import Dashboard from './pages/Dashboard';
import StoreAnalytics from './pages/StoreAnalytics';
import MarketingGenerator from './pages/MarketingGenerator';
import AIAssistant from './pages/AIAssistant';
import InventoryInsights from './pages/InventoryInsights';
import SettingsPage from './pages/SettingsPage';
import { useTheme } from './context/ThemeContext';
import './index.css';

const navItems = [
  { path: '/',          label: 'Dashboard',      icon: LayoutDashboard },
  { path: '/analytics', label: 'Store Analytics', icon: BarChart3 },
  { path: '/marketing', label: 'Marketing',        icon: Megaphone },
  { path: '/assistant', label: 'AI Assistant',     icon: Bot },
  { path: '/inventory', label: 'Inventory',        icon: Package },
];

const PAGE_TITLES = {
  '/':          'Dashboard',
  '/analytics': 'Store Analytics',
  '/marketing': 'Marketing Generator',
  '/assistant': 'AI Assistant',
  '/inventory': 'Inventory Insights',
  '/settings':  'Store Settings',
};

function Sidebar({ open, setOpen, onLogout }) {
  return (
    <aside className={`${open ? 'w-56' : 'w-16'} relative flex flex-col shrink-0 transition-all duration-300
      bg-white dark:bg-gray-900 border-r border-slate-100 dark:border-gray-800`}>

      {/* Logo */}
      <div className="h-16 px-4 border-b border-slate-100 dark:border-gray-800 flex items-center gap-3 overflow-hidden">
        <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center text-white shrink-0">
          <Store size={15} />
        </div>
        {open && (
          <div className="overflow-hidden">
            <p className="font-semibold text-slate-800 dark:text-gray-100 text-sm leading-tight whitespace-nowrap">
              Retail Intel
            </p>
            <p className="text-xs text-slate-400 dark:text-gray-500 whitespace-nowrap">SME Platform</p>
          </div>
        )}
      </div>

      {/* Navigation — 5 items (within Miller's 5±2) */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-hidden">
        {navItems.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            title={!open ? label : undefined}
            className={({ isActive }) =>
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors duration-150 ' +
              (isActive
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-500 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800 hover:text-slate-900 dark:hover:text-gray-100')
            }
          >
            <Icon size={17} className="shrink-0" />
            {open && <span className="whitespace-nowrap overflow-hidden text-ellipsis">{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Bottom utilities */}
      <div className="p-3 border-t border-slate-100 dark:border-gray-800 space-y-0.5">
        <NavLink
          to="/settings"
          title={!open ? 'Settings' : undefined}
          className={({ isActive }) =>
            'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors duration-150 ' +
            (isActive
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-500 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800 hover:text-slate-900 dark:hover:text-gray-100')
          }
        >
          <Settings size={17} className="shrink-0" />
          {open && <span>Settings</span>}
        </NavLink>

        <button
          onClick={onLogout}
          title={!open ? 'Log out' : undefined}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
            text-slate-400 dark:text-gray-500 hover:bg-red-50 dark:hover:bg-red-950/30
            hover:text-red-500 dark:hover:text-red-400 transition-colors"
        >
          <LogOut size={17} className="shrink-0" />
          {open && <span>Log out</span>}
        </button>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setOpen(v => !v)}
        className="absolute -right-3 top-[4.75rem] z-10 w-6 h-6
          bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700
          rounded-full flex items-center justify-center shadow-sm
          text-slate-400 hover:text-indigo-600 hover:border-indigo-300 transition-colors"
      >
        {open ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
      </button>
    </aside>
  );
}

function Header() {
  const location = useLocation();
  const { dark, toggle } = useTheme();
  const title = PAGE_TITLES[location.pathname] ?? 'Dashboard';

  return (
    <header className="h-16 px-6 shrink-0 flex items-center justify-between
      bg-white dark:bg-gray-900 border-b border-slate-100 dark:border-gray-800">
      <h1 className="text-base font-semibold text-slate-800 dark:text-gray-100">{title}</h1>
      <button
        onClick={toggle}
        title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        className="w-9 h-9 rounded-xl flex items-center justify-center
          text-slate-500 dark:text-gray-400
          hover:bg-slate-100 dark:hover:bg-gray-800 transition-colors"
      >
        {dark ? <Sun size={17} /> : <Moon size={17} />}
      </button>
    </header>
  );
}

function App() {
  const [open, setOpen]     = useState(true);
  const [splash, setSplash] = useState(true);
  const [authed, setAuthed] = useState(isAuthed);
  const hideSplash = useCallback(() => setSplash(false), []);

  const handleAuthDone = useCallback(() => {
    sessionStorage.setItem(AUTH_KEY, '1');
    setAuthed(true);
  }, []);

  const handleLogout = useCallback(() => {
    sessionStorage.removeItem(AUTH_KEY);
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
                <Route path="/"          element={<Dashboard />} />
                <Route path="/analytics" element={<StoreAnalytics />} />
                <Route path="/marketing" element={<MarketingGenerator />} />
                <Route path="/assistant" element={<AIAssistant />} />
                <Route path="/inventory" element={<InventoryInsights />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Routes>
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;

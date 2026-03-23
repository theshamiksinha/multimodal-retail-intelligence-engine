import { useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { LayoutDashboard, BarChart3, Megaphone, Bot, Package } from 'lucide-react';
import ErrorBoundary from './components/ErrorBoundary';
import Dashboard from './pages/Dashboard';
import StoreAnalytics from './pages/StoreAnalytics';
import MarketingGenerator from './pages/MarketingGenerator';
import AIAssistant from './pages/AIAssistant';
import InventoryInsights from './pages/InventoryInsights';
import './index.css';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/analytics', label: 'Store Analytics', icon: BarChart3 },
  { path: '/marketing', label: 'Marketing Generator', icon: Megaphone },
  { path: '/assistant', label: 'AI Assistant', icon: Bot },
  { path: '/inventory', label: 'Inventory Insights', icon: Package },
];

function Sidebar({ sidebarOpen, setSidebarOpen }) {
  return (
    <aside className={`${sidebarOpen ? 'w-64' : 'w-16'} bg-white border-r border-slate-200 flex flex-col transition-all duration-300 shrink-0`}>
      <div className="p-4 border-b border-slate-200 flex items-center gap-2">
        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0">
          AI
        </div>
        {sidebarOpen && (
          <span className="font-semibold text-slate-800 text-sm whitespace-nowrap">Retail Intelligence</span>
        )}
      </div>
      <nav className="flex-1 p-2 space-y-1">
        {navItems.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            className={({ isActive }) =>
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ' +
              (isActive
                ? 'bg-indigo-50 text-indigo-700 font-medium'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900')
            }
          >
            <Icon size={18} />
            {sidebarOpen && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="p-3 text-slate-400 hover:text-slate-600 border-t border-slate-200 text-xs"
      >
        {sidebarOpen ? 'Collapse' : '>'}
      </button>
    </aside>
  );
}

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <BrowserRouter>
      <div className="flex h-screen bg-slate-50 overflow-hidden">
        <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

        <main className="flex-1 overflow-auto min-w-0">
          <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
            <h1 className="text-lg font-semibold text-slate-800">Retail Intelligence Dashboard</h1>
            <span className="text-xs text-slate-500">SME Retail Analytics Platform</span>
          </header>
          <div className="p-6">
            <ErrorBoundary>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/analytics" element={<StoreAnalytics />} />
                <Route path="/marketing" element={<MarketingGenerator />} />
                <Route path="/assistant" element={<AIAssistant />} />
                <Route path="/inventory" element={<InventoryInsights />} />
              </Routes>
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;

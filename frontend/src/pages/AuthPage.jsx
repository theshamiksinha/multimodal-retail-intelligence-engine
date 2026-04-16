import { useState } from 'react';
import {
  ChevronRight, ChevronLeft, Check,
  Users, DollarSign, Maximize2, LogIn, Sparkles, Sun, Moon, Globe, User, Store as StoreIcon,
  Crown, ClipboardList, ShieldAlert,
} from 'lucide-react';

export const ROLE_SESSION_KEY = 'munimLoginRole';
import appLogo   from '../assets/app_logo.png';
import mascotImg from '../assets/mascot_for_chatbot.png';
import { SETUP_KEY } from '../components/SetupWizard';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from 'react-i18next';

// Step definitions — type: 'options' | 'text' | 'profile'
const STEPS = [
  {
    type: 'options',
    id: 'language',
    icon: Globe,
    question: 'What language do you prefer?',
    hint: 'Choose your display language',
    options: [
      { value: 'en', label: 'English',       sub: 'English interface' },
      { value: 'hi', label: 'हिंदी (Hindi)', sub: 'हिंदी इंटरफ़ेस' },
    ],
  },
  {
    type: 'profile',
    id: 'profile',
    icon: User,
    question: 'Tell us about yourself',
    hint: 'Your name and role in the store',
    roles: [
      { value: 'owner',   label: 'Owner',   sub: 'I run the store' },
      { value: 'manager', label: 'Manager', sub: 'I manage operations' },
    ],
  },
  {
    type: 'text',
    id: 'storeName',
    icon: StoreIcon,
    question: "What's your store called?",
    hint: 'Your store identity',
    placeholder: 'e.g. Sharma and Sons Kirana',
  },
  {
    type: 'options',
    id: 'footfall',
    icon: Users,
    question: 'How many customers visit your store each day?',
    hint: 'Approximate daily footfall',
    options: [
      { value: '50_200',   label: '50 – 200', sub: 'Local convenience store' },
      { value: '200_500',  label: '200 – 500', sub: 'Busy high-street shop' },
      { value: 'over_500', label: '500+',      sub: 'High-traffic retail outlet' },
    ],
  },
  {
    type: 'options',
    id: 'revenue',
    icon: DollarSign,
    question: 'What is your approximate monthly revenue?',
    hint: 'Helps us tailor analytics thresholds',
    options: [
      { value: '10k_50k',   label: '₹10K – ₹50K',  sub: 'Growing retailer' },
      { value: '50k_200k',  label: '₹50K – ₹200K', sub: 'Established mid-size store' },
      { value: 'over_200k', label: '₹200K+',        sub: 'Large retail operation' },
    ],
  },
  {
    type: 'options',
    id: 'size',
    icon: Maximize2,
    question: 'How would you describe your store size?',
    hint: 'Floor area helps with heatmap zone recommendations',
    options: [
      { value: 'medium', label: 'Small',  sub: '500 – 2,000 sq ft' },
      { value: 'large',  label: 'Medium', sub: '2,000 – 10,000 sq ft' },
      { value: 'xlarge', label: 'Large',  sub: '10,000+ sq ft' },
    ],
  },
];

const TOTAL_STEPS = STEPS.length;

// ── Shared layout ─────────────────────────────────────────────────────────────
function PageShell({ children }) {
  const { dark, toggle } = useTheme();

  return (
    <div className="min-h-screen relative flex flex-col items-center justify-center p-6
      bg-gradient-to-br from-slate-100 via-blue-50 to-slate-200
      dark:from-gray-950 dark:via-blue-950 dark:to-gray-950">

      {/* Theme toggle */}
      <button
        onClick={toggle}
        className="absolute top-5 right-5 w-9 h-9 rounded-xl flex items-center justify-center
          text-slate-400 dark:text-gray-500
          hover:bg-slate-200 dark:hover:bg-white/10
          hover:text-slate-700 dark:hover:text-white
          transition-colors"
        title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {dark ? <Sun size={16} /> : <Moon size={16} />}
      </button>

      {/* Brand mark */}
      <div className="flex items-center gap-3 mb-10 animate-fade-in">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30 p-2 shrink-0">
          <img
            src={appLogo}
            alt="Munim AI"
            className="w-full h-full object-contain"
            style={{ filter: 'brightness(0) invert(1)' }}
          />
        </div>
        <div className="leading-tight">
          <p className="font-bold text-base tracking-tight text-slate-800 dark:text-white">
            Munim <span className="text-orange-500">AI</span>
          </p>
          <p className="text-[10px] text-slate-400 dark:text-gray-500 font-medium tracking-wide">SME Retail Platform</p>
        </div>
      </div>

      {children}
    </div>
  );
}

// ── Welcome ───────────────────────────────────────────────────────────────────
function WelcomeView({ onLogin, onSetup }) {
  return (
    <div className="w-full max-w-sm text-center">
      {/* Mascot */}
      <div className="relative w-44 h-44 mx-auto mb-5 animate-fade-in-up delay-100">
        <div className="w-full h-full rounded-full overflow-hidden
          bg-white border-4 border-blue-200 shadow-xl shadow-blue-500/20 flex items-center justify-center">
          <img
            src={mascotImg}
            alt="Munim Ji"
            className="w-[78%] h-[78%] object-contain"
            style={{ objectPosition: '60% center', transform: 'translateX(6px)' }}
          />
        </div>
        {/* Orange AI badge */}
        <span className="absolute bottom-1 right-1 w-7 h-7 bg-orange-500 rounded-full
          border-2 border-white dark:border-gray-900
          flex items-center justify-center text-[10px] font-bold text-white shadow-sm animate-pop-in delay-300">
          AI
        </span>
      </div>

      <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Namaste! 🙏</h1>
      <p className="text-blue-600 dark:text-blue-300 text-sm mb-10 font-medium">
        Meet <span className="font-bold">Munim Ji</span> — your AI-powered retail advisor.
      </p>

      <div className="space-y-3">
        <button
          onClick={onSetup}
          className="w-full flex items-center justify-between px-5 py-4
            bg-blue-600 hover:bg-blue-700 text-white rounded-2xl
            text-sm font-medium transition-all shadow-lg shadow-blue-500/30 active:scale-[0.98]"
        >
          <div className="text-left">
            <p className="font-semibold">New here? Set up your store</p>
            <p className="text-blue-200 text-xs mt-0.5 font-normal">Takes about 30 seconds</p>
          </div>
          <div className="flex items-center gap-1.5">
            <Sparkles size={14} className="text-blue-200" />
            <ChevronRight size={15} />
          </div>
        </button>

        <button
          onClick={onLogin}
          className="w-full flex items-center justify-between px-5 py-4 rounded-2xl
            bg-white dark:bg-gray-900
            border border-slate-200 dark:border-gray-700
            hover:border-slate-300 dark:hover:border-gray-600
            text-slate-700 dark:text-gray-200
            text-sm font-medium transition-all active:scale-[0.98]"
        >
          <div className="text-left">
            <p className="font-semibold">Already registered?</p>
            <p className="text-slate-400 dark:text-gray-500 text-xs mt-0.5 font-normal">Sign in to your account</p>
          </div>
          <LogIn size={15} className="text-slate-400 dark:text-gray-500" />
        </button>
      </div>
    </div>
  );
}

// ── Login ─────────────────────────────────────────────────────────────────────
const LOGIN_ROLES = [
  {
    value: 'owner',
    label: 'Owner',
    icon: Crown,
    sub: 'Full access — all data visible',
    color: 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
    iconColor: 'text-emerald-600',
  },
  {
    value: 'manager',
    label: 'Manager',
    icon: ClipboardList,
    sub: 'Full access — manages the store',
    color: 'border-violet-400 bg-violet-50 dark:bg-violet-950/30',
    badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300',
    iconColor: 'text-violet-600',
  },
  {
    value: 'staff',
    label: 'Staff',
    icon: ShieldAlert,
    sub: 'Inventory only — no financial data',
    color: 'border-amber-400 bg-amber-50 dark:bg-amber-950/30',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
    iconColor: 'text-amber-600',
  },
];

function LoginView({ onBack, onDone }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState('');

  const inputCls = `w-full px-4 py-3 rounded-xl text-sm transition-colors
    bg-white dark:bg-gray-800
    border border-slate-200 dark:border-gray-700
    text-slate-800 dark:text-white
    placeholder:text-slate-400 dark:placeholder:text-gray-600
    focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500`;

  return (
    <div className="w-full max-w-sm">
      <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Welcome back</h2>
      <p className="text-slate-400 dark:text-gray-500 text-sm mb-6">Sign in to continue</p>

      <div className="space-y-3">
        <input type="text" placeholder="Username" value={username}
          onChange={e => setUsername(e.target.value)} className={inputCls} />
        <input type="password" placeholder="Password" value={password}
          onChange={e => setPassword(e.target.value)} className={inputCls} />
      </div>

      <button
        onClick={() => selectedRole && onDone(selectedRole)}
        disabled={!selectedRole}
        className="w-full mt-4 py-3 bg-blue-600 hover:bg-blue-700 text-white
          text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-blue-500/30
          active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Sign In
      </button>

      <p className="text-center text-xs text-slate-400 dark:text-gray-600 mt-2">
        Demo mode — no credentials required
      </p>

      {/* Role simulation selector */}
      <div className="mt-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1 h-px bg-slate-200 dark:bg-gray-700" />
          <span className="text-[11px] font-semibold text-slate-400 dark:text-gray-500 uppercase tracking-wider whitespace-nowrap">
            Sign in as
          </span>
          <div className="flex-1 h-px bg-slate-200 dark:bg-gray-700" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {LOGIN_ROLES.map(role => {
            const Icon = role.icon;
            const active = selectedRole === role.value;
            return (
              <button
                key={role.value}
                onClick={() => setSelectedRole(role.value)}
                className={`relative text-left px-3 py-3 rounded-xl border-2 transition-all duration-150 ${
                  active
                    ? role.color
                    : 'border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800/50 hover:border-slate-300 dark:hover:border-gray-600'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon size={13} className={active ? role.iconColor : 'text-slate-400 dark:text-gray-500'} />
                  <span className={`text-xs font-semibold ${active ? 'text-slate-800 dark:text-white' : 'text-slate-600 dark:text-gray-300'}`}>
                    {role.label}
                  </span>
                  {active && (
                    <div className="ml-auto w-3.5 h-3.5 bg-blue-500 rounded-full flex items-center justify-center shrink-0">
                      <Check size={8} className="text-white" />
                    </div>
                  )}
                </div>
                <p className={`text-[10px] leading-tight ${active ? 'text-slate-500 dark:text-gray-400' : 'text-slate-400 dark:text-gray-600'}`}>
                  {role.sub}
                </p>
              </button>
            );
          })}
        </div>
        {!selectedRole && (
          <p className="text-center text-[11px] text-amber-500 mt-2">
            Select a role to continue
          </p>
        )}
      </div>

      <button
        onClick={onBack}
        className="flex items-center gap-1 mx-auto mt-5 text-xs text-slate-400 dark:text-gray-600
          hover:text-slate-700 dark:hover:text-gray-300 transition-colors"
      >
        <ChevronLeft size={13} /> Back
      </button>
    </div>
  );
}

// ── Setup wizard ──────────────────────────────────────────────────────────────
function SetupView({ onBack, onDone }) {
  const { i18n, t } = useTranslation();
  const [step, setStep]           = useState(0);
  const [textValues, setTextValues] = useState({ storeName: '', userName: '' });
  const [answers, setAnswers]     = useState({});

  const currentStep = STEPS[step];
  const isLast      = step === TOTAL_STEPS - 1;

  const canNext = (() => {
    if (currentStep.type === 'text')    return textValues[currentStep.id]?.trim().length > 0;
    if (currentStep.type === 'profile') return textValues.userName.trim().length > 0 && !!answers.userRole;
    return !!answers[currentStep.id];
  })();

  const next = () => {
    if (isLast) {
      const isSmall = answers.size === 'medium';
      const lang    = answers.language || 'en';
      const data = {
        completed:  true,
        storeName:  textValues.storeName.trim(),
        userName:   textValues.userName.trim(),
        userRole:   answers.userRole || 'owner',
        ...answers,
        features: { voiceEntry: isSmall, ocrEntry: isSmall },
      };
      localStorage.setItem(SETUP_KEY, JSON.stringify(data));
      localStorage.setItem('appLanguage', lang);
      i18n.changeLanguage(lang);
      onDone(data);
    } else {
      setStep(s => s + 1);
    }
  };

  const inputCls = `w-full px-4 py-3 rounded-xl text-sm transition-colors
    bg-slate-50 dark:bg-gray-800
    border border-slate-200 dark:border-gray-700
    text-slate-800 dark:text-white
    placeholder:text-slate-400 dark:placeholder:text-gray-600
    focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20`;

  const cardCls  = 'bg-white dark:bg-gray-900 rounded-2xl border border-slate-200 dark:border-gray-800 p-7';
  const hintCls  = 'text-xs text-slate-400 dark:text-gray-500';
  const titleCls = 'text-slate-900 dark:text-white text-lg font-semibold mb-5 leading-snug';

  const OptionCard = ({ stepId, opt, active, onClick }) => (
    <button
      key={opt.value}
      onClick={onClick}
      className={`text-left px-4 py-3.5 rounded-xl border transition-all duration-150 ${
        active
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-600/20 text-slate-900 dark:text-white'
          : 'border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800/50 text-slate-600 dark:text-gray-300 hover:border-blue-300 dark:hover:border-gray-500'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{opt.label}</p>
          <p className={`text-xs mt-0.5 ${active ? 'text-blue-600 dark:text-blue-300' : 'text-slate-400 dark:text-gray-500'}`}>
            {opt.sub}
          </p>
        </div>
        {active && (
          <div className="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center shrink-0 mt-0.5">
            <Check size={9} className="text-white" />
          </div>
        )}
      </div>
    </button>
  );

  const renderStepContent = () => {
    const { type, id, icon: Icon, question, hint, options, roles, placeholder } = currentStep;

    const header = (
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon size={14} className="text-blue-500" />}
        <span className={hintCls}>{hint}</span>
      </div>
    );

    if (type === 'text') {
      return (
        <>
          {header}
          <h2 className={titleCls}>{question}</h2>
          <input
            type="text"
            autoFocus
            value={textValues[id]}
            onChange={e => setTextValues(v => ({ ...v, [id]: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && canNext && next()}
            placeholder={placeholder}
            className={inputCls}
          />
        </>
      );
    }

    if (type === 'profile') {
      return (
        <>
          {header}
          <h2 className={titleCls}>{question}</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-gray-400 mb-1.5">
                Your name
              </label>
              <input
                type="text"
                autoFocus
                value={textValues.userName}
                onChange={e => setTextValues(v => ({ ...v, userName: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && textValues.userName.trim() && e.preventDefault()}
                placeholder="e.g. Ramesh, Priya..."
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-gray-400 mb-1.5">
                Your role
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                {roles.map(opt => (
                  <OptionCard
                    key={opt.value}
                    stepId={id}
                    opt={opt}
                    active={answers.userRole === opt.value}
                    onClick={() => setAnswers(a => ({ ...a, userRole: opt.value }))}
                  />
                ))}
              </div>
            </div>
          </div>
        </>
      );
    }

    // type === 'options'
    return (
      <>
        {header}
        <h2 className={titleCls}>{question}</h2>
        <div className="grid grid-cols-2 gap-3">
          {options.map(opt => (
            <OptionCard
              key={opt.value}
              stepId={id}
              opt={opt}
              active={answers[id] === opt.value}
              onClick={() => {
                setAnswers(a => ({ ...a, [id]: opt.value }));
                if (id === 'language') i18n.changeLanguage(opt.value);
              }}
            />
          ))}
        </div>
      </>
    );
  };

  return (
    <div className="w-full max-w-lg">
      {/* Progress */}
      <div className="flex gap-1.5 mb-8">
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
            i <= step ? 'bg-blue-500' : 'bg-slate-200 dark:bg-gray-800'
          }`} />
        ))}
      </div>

      {/* Card */}
      <div className={cardCls}>
        {renderStepContent()}
      </div>

      {/* Nav */}
      <div className="flex items-center justify-between mt-5">
        <button
          onClick={() => step === 0 ? onBack() : setStep(s => s - 1)}
          className="flex items-center gap-1.5 text-sm text-slate-400 dark:text-gray-500
            hover:text-slate-700 dark:hover:text-gray-300 transition-colors"
        >
          <ChevronLeft size={15} />
          {step === 0 ? 'Back' : 'Previous'}
        </button>

        <button
          onClick={next}
          disabled={!canNext}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700
            disabled:opacity-40 disabled:cursor-not-allowed
            text-white text-sm font-medium rounded-xl transition-colors"
        >
          {isLast ? 'Get Started' : 'Next'}
          {!isLast && <ChevronRight size={15} />}
        </button>
      </div>

      <p className="text-center text-xs text-slate-400 dark:text-gray-600 mt-5">
        Step {step + 1} of {TOTAL_STEPS} · Your answers stay on this device
      </p>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function AuthPage({ onDone }) {
  const [view, setView] = useState('welcome');

  return (
    <PageShell>
      {view === 'welcome' && (
        <WelcomeView onLogin={() => setView('login')} onSetup={() => setView('setup')} />
      )}
      {view === 'login' && (
        <LoginView onBack={() => setView('welcome')} onDone={(role) => onDone(role)} />
      )}
      {view === 'setup' && (
        <SetupView onBack={() => setView('welcome')} onDone={() => onDone('owner')} />
      )}
    </PageShell>
  );
}

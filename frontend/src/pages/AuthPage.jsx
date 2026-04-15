import { useState } from 'react';
import {
  Store, ChevronRight, ChevronLeft, Check,
  Users, DollarSign, Maximize2, LogIn, Sparkles, Sun, Moon, Globe,
} from 'lucide-react';
import { SETUP_KEY } from '../components/SetupWizard';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from 'react-i18next';

const OPTION_STEPS = [
  {
    id: 'language',
    icon: Globe,
    question: 'What language do you prefer?',
    hint: 'Choose your display language',
    options: [
      { value: 'en', label: 'English',         sub: 'English interface' },
      { value: 'hi', label: 'हिंदी (Hindi)',   sub: 'हिंदी इंटरफ़ेस' },
    ],
  },
  {
    id: 'footfall',
    icon: Users,
    question: 'How many customers visit your store each day?',
    hint: 'Approximate daily footfall',
    options: [
      { value: '50_200',    label: '50 – 200',   sub: 'Local convenience store' },
      { value: '200_500',   label: '200 – 500',  sub: 'Busy high-street shop' },
      { value: 'over_500',  label: '500+',        sub: 'High-traffic retail outlet' },
    ],
  },
  {
    id: 'revenue',
    icon: DollarSign,
    question: 'What is your approximate monthly revenue?',
    hint: 'Helps us tailor analytics thresholds',
    options: [
      { value: '10k_50k',    label: '₹10K – ₹50K',   sub: 'Growing retailer' },
      { value: '50k_200k',   label: '₹50K – ₹200K',  sub: 'Established mid-size store' },
      { value: 'over_200k',  label: '₹200K+',         sub: 'Large retail operation' },
    ],
  },
  {
    id: 'size',
    icon: Maximize2,
    question: 'How would you describe your store size?',
    hint: 'Floor area helps with heatmap zone recommendations',
    options: [
      { value: 'medium',  label: 'Small',   sub: '500 – 2,000 sq ft' },
      { value: 'large',   label: 'Medium',  sub: '2,000 – 10,000 sq ft' },
      { value: 'xlarge',  label: 'Large',   sub: '10,000+ sq ft' },
    ],
  },
];

// Total steps: 0 = store name, 1-3 = option cards
const TOTAL_STEPS = 1 + OPTION_STEPS.length;

// ── Shared layout ─────────────────────────────────────────────────────────────
function PageShell({ children }) {
  const { dark, toggle } = useTheme();

  return (
    <div className="min-h-screen relative flex flex-col items-center justify-center p-6
      bg-gradient-to-br from-slate-100 via-indigo-50 to-slate-200
      dark:from-gray-950 dark:via-indigo-950 dark:to-gray-950">

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
      <div className="flex items-center gap-2.5 mb-10">
        <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center shadow-md">
          <Store size={17} className="text-white" />
        </div>
        <span className="font-semibold text-sm tracking-tight text-slate-800 dark:text-white">
          Retail Intel
        </span>
      </div>

      {children}
    </div>
  );
}

// ── Welcome ───────────────────────────────────────────────────────────────────
function WelcomeView({ onLogin, onSetup }) {
  return (
    <div className="w-full max-w-sm text-center">
      <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Hello there!</h1>
      <p className="text-indigo-600 dark:text-indigo-300 text-sm mb-10">
        Your AI-powered retail command centre awaits.
      </p>

      <div className="space-y-3">
        <button
          onClick={onSetup}
          className="w-full flex items-center justify-between px-5 py-4
            bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl
            text-sm font-medium transition-all shadow-lg shadow-indigo-500/30 active:scale-[0.98]"
        >
          <div className="text-left">
            <p className="font-semibold">New here? Set up your store</p>
            <p className="text-indigo-200 text-xs mt-0.5 font-normal">Takes about 30 seconds</p>
          </div>
          <div className="flex items-center gap-1.5">
            <Sparkles size={14} className="text-indigo-200" />
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
function LoginView({ onBack, onDone }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const inputCls = `w-full px-4 py-3 rounded-xl text-sm transition-colors
    bg-white dark:bg-gray-800
    border border-slate-200 dark:border-gray-700
    text-slate-800 dark:text-white
    placeholder:text-slate-400 dark:placeholder:text-gray-600
    focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500`;

  return (
    <div className="w-full max-w-sm">
      <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Welcome back</h2>
      <p className="text-slate-400 dark:text-gray-500 text-sm mb-8">Sign in to continue</p>

      <div className="space-y-3">
        <input type="text" placeholder="Username" value={username}
          onChange={e => setUsername(e.target.value)} className={inputCls} />
        <input type="password" placeholder="Password" value={password}
          onChange={e => setPassword(e.target.value)} className={inputCls} />
      </div>

      <button
        onClick={onDone}
        className="w-full mt-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white
          text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-indigo-500/30 active:scale-[0.98]"
      >
        Sign In
      </button>

      <p className="text-center text-xs text-slate-400 dark:text-gray-600 mt-4">
        Demo mode — no credentials required
      </p>

      <button
        onClick={onBack}
        className="flex items-center gap-1 mx-auto mt-6 text-xs text-slate-400 dark:text-gray-600
          hover:text-slate-700 dark:hover:text-gray-300 transition-colors"
      >
        <ChevronLeft size={13} /> Back
      </button>
    </div>
  );
}

// ── Setup wizard ──────────────────────────────────────────────────────────────
function SetupView({ onBack, onDone }) {
  const { i18n } = useTranslation();
  const [step, setStep]         = useState(0);
  const [storeName, setStoreName] = useState('');
  const [answers, setAnswers]   = useState({});

  // step 0 = store name, steps 1+ = option cards
  const isNameStep = step === 0;
  const optStep    = OPTION_STEPS[step - 1];
  const isLast     = step === TOTAL_STEPS - 1;
  const canNext    = isNameStep ? storeName.trim().length > 0 : !!answers[optStep?.id];

  const next = () => {
    if (isLast) {
      const isSmall = answers.size === 'medium'; // 'medium' is the smallest option (500–2,000 sq ft)
      const lang = answers.language || 'en';
      const data = {
        completed: true,
        storeName: storeName.trim(),
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

  const { t } = useTranslation();

  const cardCls = 'bg-white dark:bg-gray-900 rounded-2xl border border-slate-200 dark:border-gray-800 p-7';
  const hintCls = 'text-xs text-slate-400 dark:text-gray-500';
  const titleCls = 'text-slate-900 dark:text-white text-lg font-semibold mb-6 leading-snug';

  // For language step keep option labels as-is (language names don't translate)
  const getOptionLabel = (stepId, opt) =>
    stepId === 'language' ? opt.label : t(`settings.options.${opt.value}.label`, opt.label);
  const getOptionSub = (stepId, opt) =>
    stepId === 'language' ? opt.sub : t(`settings.options.${opt.value}.sub`, opt.sub);

  return (
    <div className="w-full max-w-lg">
      {/* Progress */}
      <div className="flex gap-1.5 mb-8">
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
            i <= step ? 'bg-indigo-500' : 'bg-slate-200 dark:bg-gray-800'
          }`} />
        ))}
      </div>

      {/* Card */}
      <div className={cardCls}>
        {isNameStep ? (
          <>
            <div className="flex items-center gap-2 mb-1">
              <Store size={14} className="text-indigo-500" />
              <span className={hintCls}>{t('wizard.steps.storeName.hint', 'Your store identity')}</span>
            </div>
            <h2 className={titleCls}>{t('wizard.steps.storeName.question', "What's your store called?")}</h2>
            <input
              type="text"
              autoFocus
              value={storeName}
              onChange={e => setStoreName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && canNext && next()}
              placeholder={t('wizard.steps.storeName.placeholder', 'e.g. Green Valley Grocery')}
              className="w-full px-4 py-3 rounded-xl text-sm transition-colors
                bg-slate-50 dark:bg-gray-800
                border border-slate-200 dark:border-gray-700
                text-slate-800 dark:text-white
                placeholder:text-slate-400 dark:placeholder:text-gray-600
                focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            />
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-1">
              {optStep && <optStep.icon size={14} className="text-indigo-500" />}
              <span className={hintCls}>{t(`wizard.steps.${optStep?.id}.hint`, optStep?.hint)}</span>
            </div>
            <h2 className={titleCls}>{t(`wizard.steps.${optStep?.id}.question`, optStep?.question)}</h2>
            <div className="grid grid-cols-2 gap-3">
              {optStep?.options.map(opt => {
                const active = answers[optStep.id] === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setAnswers(a => ({ ...a, [optStep.id]: opt.value }));
                      if (optStep.id === 'language') i18n.changeLanguage(opt.value);
                    }}
                    className={`text-left px-4 py-3.5 rounded-xl border transition-all duration-150 ${
                      active
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-600/20 text-slate-900 dark:text-white'
                        : 'border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800/50 text-slate-600 dark:text-gray-300 hover:border-indigo-300 dark:hover:border-gray-500'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{getOptionLabel(optStep.id, opt)}</p>
                        <p className={`text-xs mt-0.5 ${active ? 'text-indigo-600 dark:text-indigo-300' : 'text-slate-400 dark:text-gray-500'}`}>
                          {getOptionSub(optStep.id, opt)}
                        </p>
                      </div>
                      {active && (
                        <div className="w-4 h-4 bg-indigo-500 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                          <Check size={9} className="text-white" />
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Nav */}
      <div className="flex items-center justify-between mt-5">
        <button
          onClick={() => step === 0 ? onBack() : setStep(s => s - 1)}
          className="flex items-center gap-1.5 text-sm text-slate-400 dark:text-gray-500
            hover:text-slate-700 dark:hover:text-gray-300 transition-colors"
        >
          <ChevronLeft size={15} />
          {step === 0 ? t('wizard.back', 'Back') : t('wizard.previous', 'Previous')}
        </button>

        <button
          onClick={next}
          disabled={!canNext}
          className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700
            disabled:opacity-40 disabled:cursor-not-allowed
            text-white text-sm font-medium rounded-xl transition-colors"
        >
          {isLast ? t('wizard.getStarted', 'Get Started') : t('wizard.next', 'Next')}
          {!isLast && <ChevronRight size={15} />}
        </button>
      </div>

      <p className="text-center text-xs text-slate-400 dark:text-gray-600 mt-5">
        {t('wizard.stepProgress', 'Step {{step}} of {{total}} · Your answers stay on this device', { step: step + 1, total: TOTAL_STEPS })}
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
        <LoginView onBack={() => setView('welcome')} onDone={() => onDone()} />
      )}
      {view === 'setup' && (
        <SetupView onBack={() => setView('welcome')} onDone={() => onDone()} />
      )}
    </PageShell>
  );
}

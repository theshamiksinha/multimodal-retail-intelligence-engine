import { useState, useEffect } from 'react';
import { Users, DollarSign, Maximize2, Check, Save, Store, Mic, ScanText, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SETUP_KEY } from '../components/SetupWizard';

const CARD = 'bg-white dark:bg-gray-900 rounded-2xl border border-slate-100 dark:border-gray-800 shadow-sm';

const SECTIONS = [
  {
    id: 'footfall',
    icon: Users,
    label: 'Daily Customer Footfall',
    options: [
      { value: 'under_50',  label: 'Under 50',   sub: 'Quiet neighbourhood store' },
      { value: '50_200',    label: '50 – 200',   sub: 'Local convenience store' },
      { value: '200_500',   label: '200 – 500',  sub: 'Busy high-street shop' },
      { value: 'over_500',  label: '500+',        sub: 'High-traffic retail outlet' },
    ],
  },
  {
    id: 'revenue',
    icon: DollarSign,
    label: 'Monthly Revenue',
    options: [
      { value: 'under_10k',  label: 'Under ₹10K',    sub: 'Early stage / small store' },
      { value: '10k_50k',    label: '₹10K – ₹50K',   sub: 'Growing retailer' },
      { value: '50k_200k',   label: '₹50K – ₹200K',  sub: 'Established mid-size store' },
      { value: 'over_200k',  label: '₹200K+',         sub: 'Large retail operation' },
    ],
  },
  {
    id: 'size',
    icon: Maximize2,
    label: 'Store Size',
    options: [
      { value: 'small',   label: 'Small',       sub: 'Under 500 sq ft' },
      { value: 'medium',  label: 'Medium',      sub: '500 – 2,000 sq ft' },
      { value: 'large',   label: 'Large',       sub: '2,000 – 10,000 sq ft' },
      { value: 'xlarge',  label: 'Extra Large', sub: '10,000+ sq ft' },
    ],
  },
];

const FEATURE_TOGGLES = [
  {
    key: 'voiceEntry',
    icon: Mic,
    label: 'Voice Inventory Entry',
    sub: 'Add products by speaking — ideal for small stores',
  },
  {
    key: 'ocrEntry',
    icon: ScanText,
    label: 'OCR Inventory Entry',
    sub: 'Scan handwritten notes, labels, or bills',
  },
];

function getStored() {
  try { return JSON.parse(localStorage.getItem(SETUP_KEY)) || {}; } catch { return {}; }
}

function Toggle({ enabled, onChange }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none ${
        enabled ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-gray-700'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200 ${
          enabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
        }`}
      />
    </button>
  );
}

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const stored = getStored();
  const [storeName, setStoreName] = useState(stored.storeName || '');
  const [answers, setAnswers]     = useState(stored);
  const [features, setFeatures]   = useState(stored.features || { voiceEntry: false, ocrEntry: false });
  const [lang, setLangState]      = useState(localStorage.getItem('appLanguage') || i18n.language || 'en');
  const [saved, setSaved]         = useState(false);

  useEffect(() => {
    return () => {
      const persisted = localStorage.getItem('appLanguage') || 'en';
      if (i18n.language !== persisted) {
        i18n.changeLanguage(persisted);
      }
    };
  }, [i18n]);

  const setLang = (l) => {
    setSaved(false);
    setLangState(l);
    i18n.changeLanguage(l); // Preview instantly
  };

  const set = (id, value) => {
    setSaved(false);
    setAnswers(a => ({ ...a, [id]: value }));
  };

  const setFeature = (key, value) => {
    setSaved(false);
    setFeatures(f => ({ ...f, [key]: value }));
  };

  const save = () => {
    localStorage.setItem(SETUP_KEY, JSON.stringify({
      ...answers,
      storeName: storeName.trim(),
      features,
      completed: true,
    }));
    localStorage.setItem('appLanguage', lang);
    i18n.changeLanguage(lang);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="max-w-2xl space-y-6">

      {/* Store name */}
      <div className={`${CARD} p-5`}>
        <div className="flex items-center gap-2 mb-4">
          <Store size={15} className="text-indigo-500" />
          <h3 className="text-sm font-semibold text-slate-800 dark:text-gray-100">Store Name</h3>
        </div>
        <input
          type="text"
          value={storeName}
          onChange={e => { setSaved(false); setStoreName(e.target.value); }}
          placeholder="e.g. Green Valley Grocery"
          className="w-full px-4 py-3 rounded-xl text-sm transition-colors
            bg-slate-50 dark:bg-gray-800
            border border-slate-200 dark:border-gray-700
            text-slate-800 dark:text-white
            placeholder:text-slate-400 dark:placeholder:text-gray-600
            focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
        />
      </div>

      {/* Language */}
      <div className={`${CARD} p-5`}>
        <div className="flex items-center gap-2 mb-4">
          <Globe size={15} className="text-indigo-500" />
          <h3 className="text-sm font-semibold text-slate-800 dark:text-gray-100">{t('settings.language')}</h3>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => { setSaved(false); setLang('en'); }}
            className={`flex-1 px-4 py-3 flex justify-between items-center rounded-xl border transition-all duration-150 text-left ${
              lang === 'en'
                ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-600/20 text-slate-800 dark:text-white'
                : 'border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800/50 text-slate-600 dark:text-gray-300 hover:border-indigo-300 dark:hover:border-gray-500'
            }`}
          >
            <span className="text-sm font-medium">English</span>
            {lang === 'en' && <Check size={14} className="text-indigo-500" />}
          </button>
          <button
            onClick={() => { setSaved(false); setLang('hi'); }}
            className={`flex-1 px-4 py-3 flex justify-between items-center rounded-xl border transition-all duration-150 text-left ${
              lang === 'hi'
                ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-600/20 text-slate-800 dark:text-white'
                : 'border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800/50 text-slate-600 dark:text-gray-300 hover:border-indigo-300 dark:hover:border-gray-500'
            }`}
          >
            <span className="text-sm font-medium">हिंदी (Hindi)</span>
            {lang === 'hi' && <Check size={14} className="text-indigo-500" />}
          </button>
        </div>
      </div>

      {/* Store profile option cards */}
      {SECTIONS.map(({ id, icon: Icon, label, options }) => (
        <div key={id} className={`${CARD} p-5`}>
          <div className="flex items-center gap-2 mb-4">
            <Icon size={15} className="text-indigo-500" />
            <h3 className="text-sm font-semibold text-slate-800 dark:text-gray-100">{t(`settings.sections.${id}`, label)}</h3>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {options.map(opt => {
              const active = answers[id] === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => set(id, opt.value)}
                  className={`text-left px-4 py-3 rounded-xl border transition-all duration-150 ${
                    active
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-600/20 text-slate-800 dark:text-white'
                      : 'border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800/50 text-slate-600 dark:text-gray-300 hover:border-indigo-300 dark:hover:border-gray-500'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{t(`settings.options.${opt.value}.label`, opt.label)}</p>
                      <p className={`text-xs mt-0.5 ${active ? 'text-indigo-600 dark:text-indigo-300' : 'text-slate-400 dark:text-gray-500'}`}>
                        {t(`settings.options.${opt.value}.sub`, opt.sub)}
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
        </div>
      ))}

      {/* Inventory input features */}
      <div className={`${CARD} p-5`}>
        <h3 className="text-sm font-semibold text-slate-800 dark:text-gray-100 mb-1">{t('settings.inputMethods', 'Inventory Input Methods')}</h3>
        <p className="text-xs text-slate-400 dark:text-gray-500 mb-4">
          {t('settings.inputMethodsSub', 'CSV / Excel import is always available. Enable additional methods below.')}
        </p>
        <div className="space-y-3">
          {FEATURE_TOGGLES.map(({ key, icon: Icon, label, sub }) => (
            <div key={key} className="flex items-center justify-between gap-4 px-4 py-3.5 rounded-xl bg-slate-50 dark:bg-gray-800/50 border border-slate-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${features[key] ? 'bg-indigo-50 dark:bg-indigo-950/40' : 'bg-slate-100 dark:bg-gray-800'}`}>
                  <Icon size={14} className={features[key] ? 'text-indigo-500' : 'text-slate-400 dark:text-gray-500'} />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-gray-100">{t(`settings.features.${key}.label`, label)}</p>
                  <p className="text-xs text-slate-400 dark:text-gray-500 mt-0.5">{t(`settings.features.${key}.sub`, sub)}</p>
                </div>
              </div>
              <Toggle enabled={features[key]} onChange={v => setFeature(key, v)} />
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={save}
        className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium transition-all ${
          saved
            ? 'bg-green-600 text-white'
            : 'bg-indigo-600 hover:bg-indigo-700 text-white'
        }`}
      >
        {saved ? <Check size={15} /> : <Save size={15} />}
        {saved ? t('settings.saved', 'Saved!') : t('settings.save', 'Save Changes')}
      </button>
    </div>
  );
}

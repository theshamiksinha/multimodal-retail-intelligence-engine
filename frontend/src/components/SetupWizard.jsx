import { useState } from 'react';
import { Store, ChevronRight, ChevronLeft, Check, Users, DollarSign, Maximize2 } from 'lucide-react';

const STEPS = [
  {
    id: 'footfall',
    icon: Users,
    question: 'How many customers visit your store each day?',
    hint: 'Approximate daily footfall',
    options: [
      { value: 'under_50',   label: 'Under 50',   sub: 'Quiet neighbourhood store' },
      { value: '50_200',     label: '50 – 200',   sub: 'Local convenience store' },
      { value: '200_500',    label: '200 – 500',  sub: 'Busy high-street shop' },
      { value: 'over_500',   label: '500+',        sub: 'High-traffic retail outlet' },
    ],
  },
  {
    id: 'revenue',
    icon: DollarSign,
    question: 'What is your approximate monthly revenue?',
    hint: 'Helps us tailor analytics thresholds',
    options: [
      { value: 'under_10k',    label: 'Under $10K',       sub: 'Early stage / small store' },
      { value: '10k_50k',      label: '$10K – $50K',      sub: 'Growing retailer' },
      { value: '50k_200k',     label: '$50K – $200K',     sub: 'Established mid-size store' },
      { value: 'over_200k',    label: '$200K+',            sub: 'Large retail operation' },
    ],
  },
  {
    id: 'size',
    icon: Maximize2,
    question: 'How would you describe your store size?',
    hint: 'Floor area helps with heatmap zone recommendations',
    options: [
      { value: 'small',   label: 'Small',   sub: 'Under 500 sq ft' },
      { value: 'medium',  label: 'Medium',  sub: '500 – 2,000 sq ft' },
      { value: 'large',   label: 'Large',   sub: '2,000 – 10,000 sq ft' },
      { value: 'xlarge',  label: 'Extra Large', sub: '10,000+ sq ft' },
    ],
  },
];

export const SETUP_KEY = 'retailIntelSetup';

export function getSetupData() {
  try {
    const raw = localStorage.getItem(SETUP_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function SetupWizard({ onDone }) {
  const [step, setStep]       = useState(0);
  const [answers, setAnswers] = useState({});

  const current = STEPS[step];
  const Icon    = current.icon;
  const isLast  = step === STEPS.length - 1;
  const chosen  = answers[current.id];

  const selectOption = (value) => {
    setAnswers(a => ({ ...a, [current.id]: value }));
  };

  const next = () => {
    if (isLast) {
      const data = { completed: true, ...answers };
      localStorage.setItem(SETUP_KEY, JSON.stringify(data));
      onDone(data);
    } else {
      setStep(s => s + 1);
    }
  };

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center
      bg-gray-950/95 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center shrink-0">
            <Store size={17} className="text-white" />
          </div>
          <div>
            <p className="text-white font-semibold text-sm">Retail Intel</p>
            <p className="text-gray-500 text-xs">Quick store setup — {STEPS.length} steps</p>
          </div>
        </div>

        {/* Progress dots */}
        <div className="flex gap-1.5 mb-8">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                i <= step ? 'bg-indigo-500' : 'bg-gray-800'
              }`}
            />
          ))}
        </div>

        {/* Question card */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-7">
          <div className="flex items-center gap-2.5 mb-1">
            <Icon size={16} className="text-indigo-400" />
            <span className="text-xs text-gray-500">{current.hint}</span>
          </div>
          <h2 className="text-white text-lg font-semibold mb-6 leading-snug">
            {current.question}
          </h2>

          <div className="grid grid-cols-2 gap-3">
            {current.options.map(opt => {
              const active = chosen === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => selectOption(opt.value)}
                  className={`text-left px-4 py-3.5 rounded-xl border transition-all duration-150 ${
                    active
                      ? 'border-indigo-500 bg-indigo-600/20 text-white'
                      : 'border-gray-700 bg-gray-800/50 text-gray-300 hover:border-gray-500 hover:bg-gray-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{opt.label}</p>
                      <p className={`text-xs mt-0.5 ${active ? 'text-indigo-300' : 'text-gray-500'}`}>
                        {opt.sub}
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

        {/* Navigation */}
        <div className="flex items-center justify-between mt-5">
          {step > 0 ? (
            <button
              onClick={() => setStep(s => s - 1)}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 transition-colors"
            >
              <ChevronLeft size={15} /> Back
            </button>
          ) : (
            <div />
          )}

          <button
            onClick={next}
            disabled={!chosen}
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700
              disabled:opacity-40 disabled:cursor-not-allowed
              text-white text-sm font-medium rounded-xl transition-colors"
          >
            {isLast ? 'Get Started' : 'Next'}
            {!isLast && <ChevronRight size={15} />}
          </button>
        </div>

        <p className="text-center text-xs text-gray-600 mt-5">
          Step {step + 1} of {STEPS.length} · Your answers stay on this device
        </p>
      </div>
    </div>
  );
}

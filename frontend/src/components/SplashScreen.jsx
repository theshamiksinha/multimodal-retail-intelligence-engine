import { useEffect, useState } from 'react';
import { Store } from 'lucide-react';

export default function SplashScreen({ onDone }) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const exitTimer  = setTimeout(() => setExiting(true), 2200);
    const doneTimer  = setTimeout(() => onDone(), 2650);
    return () => { clearTimeout(exitTimer); clearTimeout(doneTimer); };
  }, [onDone]);

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center
        bg-gradient-to-br from-gray-950 via-indigo-950 to-gray-950
        ${exiting ? 'splash-exit' : ''}`}
    >
      {/* Pulse rings */}
      <div className="relative flex items-center justify-center mb-8">
        <span className="splash-ring absolute w-24 h-24 rounded-full border border-indigo-400/40" />
        <span className="splash-ring-2 absolute w-24 h-24 rounded-full border border-indigo-400/25" />

        {/* Logo box */}
        <div className="splash-logo relative w-20 h-20 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-indigo-700/50">
          <Store size={36} className="text-white" />
          {/* inner glow */}
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
        </div>
      </div>

      {/* Product name */}
      <h1 className="splash-title text-white text-3xl font-bold tracking-tight">
        Retail Intel
      </h1>

      {/* Tagline */}
      <p className="splash-tagline mt-2 text-indigo-300 text-sm font-medium tracking-widest uppercase">
        Managing your store, smarter than ever
      </p>

      {/* Loading dots */}
      <div className="splash-dots flex gap-1.5 mt-10">
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-indigo-400/60"
            style={{ animation: `splash-pulse-ring 1.2s ease-in-out infinite ${i * 0.2}s` }}
          />
        ))}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import appLogo   from '../assets/app_logo.png';
import mascotImg from '../assets/mascot_for_chatbot.png';

export default function SplashScreen({ onDone }) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const exitTimer = setTimeout(() => setExiting(true), 2400);
    const doneTimer = setTimeout(() => onDone(), 2850);
    return () => { clearTimeout(exitTimer); clearTimeout(doneTimer); };
  }, [onDone]);

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center
        bg-gradient-to-br from-gray-950 via-blue-950 to-gray-950
        ${exiting ? 'splash-exit' : ''}`}
    >
      {/* Pulse rings */}
      <div className="relative flex items-center justify-center mb-8">
        <span className="splash-ring absolute w-28 h-28 rounded-full border border-blue-400/30" />
        <span className="splash-ring-2 absolute w-28 h-28 rounded-full border border-orange-400/20" />

        {/* Logo box */}
        <div className="splash-logo relative w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-700/60 p-3">
          <img
            src={appLogo}
            alt="Munim AI"
            className="w-full h-full object-contain"
            style={{ filter: 'brightness(0) invert(1)' }}
          />
          {/* Orange accent dot */}
          <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-orange-500 rounded-full
            border-2 border-gray-950 flex items-center justify-center text-[8px] text-white font-bold">
            AI
          </span>
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
        </div>
      </div>

      {/* Mascot silhouette (subtle, in background) */}
      <div className="absolute bottom-0 right-12 w-40 opacity-10 pointer-events-none select-none"
        style={{ filter: 'brightness(0) invert(1)' }}>
        <img src={mascotImg} alt="" className="w-full object-contain" />
      </div>

      {/* Product name */}
      <h1 className="splash-title text-white text-3xl font-bold tracking-tight">
        Munim <span className="text-orange-400">AI</span>
      </h1>

      {/* Tagline */}
      <p className="splash-tagline mt-2 text-blue-300 text-sm font-medium tracking-widest uppercase">
        Managing your store, smarter than ever
      </p>

      {/* Loading dots */}
      <div className="splash-dots flex gap-1.5 mt-10">
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-blue-400/60"
            style={{ animation: `splash-pulse-ring 1.2s ease-in-out infinite ${i * 0.2}s` }}
          />
        ))}
      </div>
    </div>
  );
}

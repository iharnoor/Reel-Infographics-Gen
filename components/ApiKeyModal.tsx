import React, { useEffect, useState } from 'react';

interface ApiKeyModalProps {
  onKeySelected: () => void;
  forceNewKey?: boolean;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ onKeySelected, forceNewKey = false }) => {
  const [serverReady, setServerReady] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    checkServer();
  }, [forceNewKey]);

  const checkServer = async () => {
    setChecking(true);
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        setServerReady(true);
        onKeySelected();
      } else {
        setServerReady(false);
      }
    } catch {
      setServerReady(false);
    }
    setChecking(false);
  };

  if (serverReady || checking) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" style={{
      background: 'rgba(0, 0, 0, 0.9)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
    }}>
      <div className="max-w-md w-full text-center relative overflow-hidden rounded-2xl p-8" style={{
        background: 'linear-gradient(180deg, rgba(28, 25, 23, 0.95) 0%, rgba(14, 12, 11, 0.98) 100%)',
        border: '1px solid rgba(251, 191, 36, 0.12)',
        boxShadow: '0 0 60px rgba(251, 191, 36, 0.06), 0 24px 48px rgba(0, 0, 0, 0.4)',
      }}>
        <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full blur-3xl pointer-events-none" style={{ background: 'rgba(251, 191, 36, 0.06)' }}></div>
        <div className="absolute -bottom-16 -left-16 w-32 h-32 rounded-full blur-3xl pointer-events-none" style={{ background: 'rgba(180, 83, 9, 0.05)' }}></div>

        <div className="mb-6 flex justify-center relative z-10">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{
            background: 'rgba(41, 37, 36, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
          }}>
            <span className="text-3xl">🔌</span>
          </div>
        </div>

        <h2 className="text-xl font-display mb-2 relative z-10" style={{ color: '#fafaf9' }}>
          Server Not Available
        </h2>

        <p className="text-sm mb-6 relative z-10 leading-relaxed" style={{ color: '#78716c' }}>
          The backend server is not running. Start it with{' '}
          <code className="px-1.5 py-0.5 rounded text-xs" style={{
            background: 'rgba(41, 37, 36, 0.6)',
            color: '#d97706',
            border: '1px solid rgba(255,255,255,0.04)',
          }}>npm run dev</code>
        </p>

        <div className="rounded-xl p-4 text-left mb-6 relative z-10" style={{
          background: 'rgba(14, 12, 11, 0.6)',
          border: '1px solid rgba(255, 255, 255, 0.04)',
        }}>
          <p className="text-[10px] uppercase tracking-[0.15em] mb-2.5 font-semibold" style={{ color: '#57534e' }}>Required in .env file</p>
          <code className="text-xs block font-mono" style={{ color: '#4ade80' }}>GEMINI_API_KEY=your_key_here</code>
        </div>

        <button
          onClick={checkServer}
          className="px-5 py-2.5 rounded-xl font-semibold text-sm relative z-10"
          style={{ background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', color: '#0c0a09' }}
        >
          Retry Connection
        </button>
      </div>
    </div>
  );
};

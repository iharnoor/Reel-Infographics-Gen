import React, { useEffect, useState } from 'react';

interface ApiKeyModalProps {
  onKeySelected: () => void;
  forceNewKey?: boolean;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ onKeySelected, forceNewKey = false }) => {
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    checkKey();
  }, [forceNewKey]);

  const checkKey = () => {
    // Check if API key is configured in environment
    const hasEnvKey = process.env.API_KEY && process.env.API_KEY !== 'undefined';

    if (hasEnvKey) {
      setHasKey(true);
      onKeySelected();
    } else {
      setHasKey(false);
    }
  };

  if (hasKey) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 transition-all duration-300">
      <div className="bg-slate-900 border border-red-500/30 rounded-2xl p-8 max-w-md w-full shadow-[0_0_50px_rgba(239,68,68,0.2)] text-center relative overflow-hidden">
        {/* Background decorative element */}
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-red-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="mb-6 flex justify-center relative z-10">
            <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center shadow-inner border border-slate-700">
                <span className="text-4xl">⚠️</span>
            </div>
        </div>

        <h2 className="text-2xl font-bold text-white mb-2 relative z-10">
          API Key Not Found
        </h2>

        <p className="text-slate-400 mb-8 relative z-10 leading-relaxed">
          <span>Please add your <strong>Gemini API Key</strong> to the <code className="bg-slate-800 px-2 py-1 rounded text-yellow-400">.env</code> file in the project root.</span>
        </p>

        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 text-left mb-6">
          <p className="text-xs text-slate-300 mb-2 font-mono">Add this to .env file:</p>
          <code className="text-xs text-green-400 block font-mono">GEMINI_API_KEY=your_api_key_here</code>
        </div>

        <p className="text-xs text-slate-500 relative z-10">
          Get your API key from <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-yellow-400/70 hover:text-yellow-400 underline decoration-dotted underline-offset-2">Google AI Studio</a>
        </p>
      </div>
    </div>
  );
};
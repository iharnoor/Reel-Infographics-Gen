import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Scene } from '../types';
import { Play, Pause, RotateCcw, X } from 'lucide-react';

interface PlayerProps {
  scenes: Scene[];
  onClose: () => void;
  startIndex?: number;
  aspectRatio?: "9:16" | "16:9";
}

// Helper to authenticated video URLs
const getAuthenticatedVideoSrc = (uri: string) => {
    const apiKey = process.env.API_KEY;
    if (uri.includes('key=')) return uri;
    return `${uri}&key=${apiKey}`;
};

// --- Individual Slide Component ---
interface SlideProps {
    scene: Scene;
    isActive: boolean;
    progress: number;
    zIndex: number;
}

const Slide = React.memo(({ scene, isActive, progress, zIndex }: SlideProps) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const words = useMemo(() => scene.text.split(" "), [scene.text]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        if (isActive) {
            video.currentTime = 0;
            video.play().catch(e => console.warn("Autoplay prevented", e));
        } else {
            video.pause();
        }
    }, [isActive]);

    return (
        <div
            className={`
                absolute inset-0 w-full h-full transition-all duration-1000 ease-in-out
                ${isActive
                    ? 'opacity-100 scale-100 blur-0'
                    : 'opacity-0 scale-105 blur-sm pointer-events-none'
                }
            `}
            style={{ zIndex }}
        >
            {/* Visual Content */}
            <div className="absolute inset-0 w-full h-full overflow-hidden" style={{ background: '#0e0c0b' }}>
                {scene.videoUri ? (
                    <video
                        ref={videoRef}
                        src={getAuthenticatedVideoSrc(scene.videoUri)}
                        className="w-full h-full object-cover"
                        muted
                        loop
                        playsInline
                    />
                ) : scene.imageData ? (
                    <img
                        src={`data:image/png;base64,${scene.imageData}`}
                        className={`w-full h-full object-cover origin-center ${isActive ? 'animate-kenburns' : ''}`}
                        alt={scene.visualPrompt}
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center" style={{ background: '#1c1917' }}>
                        <span style={{ color: '#57534e' }}>No Visuals</span>
                    </div>
                )}
            </div>

            {/* Cinematic Vignette */}
            <div className="absolute inset-0 cinematic-vignette pointer-events-none" />

            {/* Bottom Gradient */}
            <div className="absolute inset-0 pointer-events-none" style={{
                background: 'linear-gradient(to top, rgba(14,12,11,0.95) 0%, rgba(14,12,11,0.6) 25%, transparent 55%)'
            }} />

            {/* Text Content */}
            <div className="absolute bottom-0 left-0 right-0 p-8 pb-20 flex flex-col items-center justify-end min-h-[45%]">
                <div className="w-full max-w-2xl px-6 py-5 rounded-2xl" style={{
                    background: 'rgba(14, 12, 11, 0.5)',
                    backdropFilter: 'blur(20px) saturate(1.3)',
                    WebkitBackdropFilter: 'blur(20px) saturate(1.3)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                }}>
                    <p className="text-xl md:text-2xl font-display drop-shadow-lg leading-relaxed text-center flex flex-wrap justify-center gap-x-2 gap-y-1" style={{ color: '#fafaf9' }}>
                        {words.map((word, i) => {
                            const revealThreshold = (i / words.length) * 0.8;
                            const isVisible = progress > revealThreshold;

                            return (
                                <span
                                    key={i}
                                    className="inline-block transition-all duration-500 transform"
                                    style={isVisible
                                        ? { opacity: 1, transform: 'translateY(0) scale(1)', filter: 'blur(0)' }
                                        : { opacity: 0, transform: 'translateY(6px) scale(0.95)', filter: 'blur(3px)' }
                                    }
                                >
                                    {word}
                                </span>
                            );
                        })}
                    </p>
                </div>
            </div>
        </div>
    );
});

// --- Main Player Component ---

export const Player: React.FC<PlayerProps> = ({ scenes, onClose, startIndex = 0, aspectRatio = "9:16" }) => {
  const [currentSceneIndex, setCurrentSceneIndex] = useState(startIndex);
  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(0);

  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const sceneDurationRef = useRef<number>(0);

  useEffect(() => {
    if (isPlaying) {
      const scene = scenes[currentSceneIndex];
      if (!scene) return;

      sceneDurationRef.current = scene.duration * 1000;

      if (startTimeRef.current === 0 || progress === 0) {
          startTimeRef.current = Date.now() - (progress * sceneDurationRef.current);
      } else {
          startTimeRef.current = Date.now() - (progress * sceneDurationRef.current);
      }

      const tick = () => {
        const elapsed = Date.now() - startTimeRef.current;
        const newProgress = Math.min(elapsed / sceneDurationRef.current, 1);
        setProgress(newProgress);

        if (newProgress >= 1) {
          if (currentSceneIndex < scenes.length - 1) {
            setProgress(0);
            setCurrentSceneIndex(prev => prev + 1);
            startTimeRef.current = Date.now();
            const nextScene = scenes[currentSceneIndex + 1];
            sceneDurationRef.current = nextScene.duration * 1000;
            timerRef.current = requestAnimationFrame(tick);
          } else {
            setIsPlaying(false);
            setProgress(1);
          }
        } else {
          timerRef.current = requestAnimationFrame(tick);
        }
      };

      timerRef.current = requestAnimationFrame(tick);
    } else {
      if (timerRef.current) cancelAnimationFrame(timerRef.current);
    }

    return () => {
      if (timerRef.current) cancelAnimationFrame(timerRef.current);
    };
  }, [isPlaying, currentSceneIndex, scenes]);

  const togglePlay = () => {
    if (currentSceneIndex === scenes.length - 1 && progress === 1) {
        restart();
    } else {
        setIsPlaying(!isPlaying);
    }
  };

  const restart = () => {
    setCurrentSceneIndex(0);
    setProgress(0);
    setIsPlaying(true);
    startTimeRef.current = Date.now();
  };

  const frameAspectClass = aspectRatio === "9:16" ? "aspect-[9/16]" : "aspect-[16/9]";
  const frameHeightClass = aspectRatio === "9:16" ? "h-[90vh]" : "w-[90vw] max-w-[1200px]";

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center animate-fade-in" style={{
        background: 'rgba(0, 0, 0, 0.95)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
    }}>
      {/* Frame Container */}
      <div
        className={`relative ${frameHeightClass} ${frameAspectClass} rounded-2xl overflow-hidden`}
        style={{
            background: '#0e0c0b',
            border: '2px solid rgba(255,255,255,0.08)',
            boxShadow: '0 0 60px rgba(251,191,36,0.1), 0 0 120px rgba(0,0,0,0.5)',
        }}
      >

        {/* Scenes Stack */}
        <div className="absolute inset-0 w-full h-full">
            {scenes.map((scene, index) => {
                const slideProgress = index === currentSceneIndex ? progress : (index < currentSceneIndex ? 1 : 0);
                const isActive = index === currentSceneIndex;

                return (
                    <Slide
                        key={scene.id}
                        scene={scene}
                        isActive={isActive}
                        progress={slideProgress}
                        zIndex={index === currentSceneIndex ? 10 : 0}
                    />
                );
            })}
        </div>

        {/* Progress Bar Top */}
        <div className="absolute top-0 left-0 right-0 flex gap-1 px-3 pt-3 z-50" style={{
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)',
            paddingBottom: '24px',
        }}>
            {scenes.map((s, idx) => (
                <div
                    key={s.id}
                    className="h-[3px] flex-1 rounded-full overflow-hidden"
                    style={{ background: 'rgba(255,255,255,0.15)' }}
                >
                    <div
                        className="h-full rounded-full transition-all duration-100 ease-linear"
                        style={{
                            width: idx < currentSceneIndex ? '100%' :
                                   idx === currentSceneIndex ? `${progress * 100}%` : '0%',
                            background: 'linear-gradient(90deg, #fbbf24, #d97706)',
                            boxShadow: idx === currentSceneIndex ? '0 0 8px rgba(251,191,36,0.5)' : 'none',
                        }}
                    />
                </div>
            ))}
        </div>

        {/* Scene Counter */}
        <div className="absolute top-6 left-3 z-50 px-2.5 py-1 rounded-lg" style={{
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.08)',
        }}>
            <span className="text-[10px] font-mono font-semibold" style={{ color: '#a8a29e' }}>
                {currentSceneIndex + 1} <span style={{ color: '#57534e' }}>/</span> {scenes.length}
            </span>
        </div>

        {/* Play/Pause Overlay */}
        <div
            className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-300 cursor-pointer z-50"
            onClick={togglePlay}
            style={{ background: 'rgba(0,0,0,0.15)' }}
        >
             <button
                className="w-16 h-16 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110"
                style={{
                    background: 'rgba(255,255,255,0.12)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: '#fafaf9',
                    boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
                }}
             >
                {isPlaying
                    ? <Pause size={24} fill="currentColor" />
                    : <Play size={24} fill="currentColor" className="ml-0.5" />
                }
             </button>
        </div>

      </div>

      {/* Global Controls */}
      <div className="absolute bottom-8 flex gap-3 z-50">
        <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl font-semibold transition-all flex items-center gap-2 text-sm"
            style={{
                background: 'rgba(41, 37, 36, 0.8)',
                backdropFilter: 'blur(8px)',
                color: '#d6d3d1',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            }}
        >
            <X size={16} />
            Close
        </button>
        <button
            onClick={restart}
            className="px-5 py-2.5 rounded-xl font-semibold transition-all flex items-center gap-2 text-sm"
            style={{
                background: 'rgba(41, 37, 36, 0.8)',
                backdropFilter: 'blur(8px)',
                color: '#d6d3d1',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            }}
        >
            <RotateCcw size={16} /> Restart
        </button>
      </div>
    </div>
  );
};

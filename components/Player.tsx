import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Scene } from '../types';
import { Play, Pause, RotateCcw } from 'lucide-react';

interface PlayerProps {
  scenes: Scene[];
  onClose: () => void;
  startIndex?: number;
}

// Helper to authenticated video URLs
const getAuthenticatedVideoSrc = (uri: string) => {
    const apiKey = process.env.API_KEY;
    if (uri.includes('key=')) return uri;
    return `${uri}&key=${apiKey}`;
};

// --- Individual Slide Component ---
// Memoized to prevent re-rendering inactive slides on every tick
interface SlideProps {
    scene: Scene;
    isActive: boolean;
    progress: number; // 0 to 1
    zIndex: number;
}

const Slide = React.memo(({ scene, isActive, progress, zIndex }: SlideProps) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const words = useMemo(() => scene.text.split(" "), [scene.text]);

    // Manage video playback based on active state
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        if (isActive) {
            // Slight delay to allow transition to start before resetting logic if needed, 
            // but for instant response we play immediately.
            // We check if it's paused to avoid interrupting if it's already playing (though isActive usually changes once)
            video.currentTime = 0; // Always restart video when scene becomes active
            video.play().catch(e => console.warn("Autoplay prevented", e));
        } else {
            // Pause immediately when not active to save resources
            video.pause();
        }
    }, [isActive]);

    return (
        <div 
            className={`
                absolute inset-0 w-full h-full transition-all duration-1000 ease-in-out
                ${isActive 
                    ? 'opacity-100 scale-100 blur-0' 
                    : 'opacity-0 scale-110 blur-sm pointer-events-none'
                }
            `}
            style={{ zIndex }}
        >
            {/* Visual Content */}
            <div className="absolute inset-0 w-full h-full bg-slate-900 overflow-hidden">
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
                    <div className="w-full h-full flex items-center justify-center bg-slate-800">
                        <span className="text-slate-500">No Visuals</span>
                    </div>
                )}
            </div>
            
            {/* Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent pointer-events-none" />
            
            {/* Text Content */}
            <div className="absolute bottom-0 left-0 right-0 p-8 pb-16 flex flex-col items-center justify-end min-h-[50%]">
                <div className="bg-black/50 backdrop-blur-xl p-6 rounded-2xl border border-white/10 shadow-2xl w-full">
                    <p className="text-white text-xl md:text-2xl font-bold drop-shadow-lg leading-relaxed text-center flex flex-wrap justify-center gap-1.5">
                        {words.map((word, i) => {
                            // Text reveals over the first 80% of the slide duration
                            const revealThreshold = (i / words.length) * 0.8;
                            const isVisible = progress > revealThreshold;
                            
                            return (
                                <span 
                                    key={i} 
                                    className={`
                                        inline-block transition-all duration-500 transform
                                        ${isVisible 
                                            ? 'opacity-100 translate-y-0 scale-100 blur-0' 
                                            : 'opacity-0 translate-y-2 scale-90 blur-[2px]'
                                        }
                                    `}
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

export const Player: React.FC<PlayerProps> = ({ scenes, onClose, startIndex = 0 }) => {
  const [currentSceneIndex, setCurrentSceneIndex] = useState(startIndex);
  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const sceneDurationRef = useRef<number>(0);

  // Preload logic can stay, but React rendering all images handles it implicitly.
  // We keep explicit preloading for smoother first run if needed, but omitted for brevity as browser handles it via DOM.

  useEffect(() => {
    if (isPlaying) {
      const scene = scenes[currentSceneIndex];
      if (!scene) return;

      sceneDurationRef.current = scene.duration * 1000;
      
      // If we just started/resumed, calculate start time based on current progress
      if (startTimeRef.current === 0 || progress === 0) {
          startTimeRef.current = Date.now() - (progress * sceneDurationRef.current);
      } else {
          // Resuming from pause
          startTimeRef.current = Date.now() - (progress * sceneDurationRef.current);
      }

      const tick = () => {
        const elapsed = Date.now() - startTimeRef.current;
        const newProgress = Math.min(elapsed / sceneDurationRef.current, 1);
        setProgress(newProgress);

        if (newProgress >= 1) {
          if (currentSceneIndex < scenes.length - 1) {
            // Next scene
            // Reset progress first to ensure next slide starts cleanly
            setProgress(0);
            setCurrentSceneIndex(prev => prev + 1);
            startTimeRef.current = Date.now();
            // sceneDuration will be updated on next effect run or we can look ahead
            // To prevent a frame gap, we can look ahead:
            const nextScene = scenes[currentSceneIndex + 1];
            sceneDurationRef.current = nextScene.duration * 1000;
            timerRef.current = requestAnimationFrame(tick);
          } else {
            // End of story
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
  }, [isPlaying, currentSceneIndex, scenes]); // Removed progress from dependency to avoid loop resets

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

  return (
    <div className="fixed inset-0 z-40 bg-black/95 flex items-center justify-center backdrop-blur-sm animate-fade-in">
      {/* Phone Frame Container */}
      <div className="relative h-[90vh] aspect-[9/16] bg-slate-900 rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(250,204,21,0.2)] border-4 border-slate-800 ring-1 ring-white/10">
        
        {/* Scenes Stack */}
        <div className="absolute inset-0 w-full h-full">
            {scenes.map((scene, index) => {
                // Calculate scene-specific progress
                // If it's current, use global progress.
                // If it's past, it should be 1 (fully revealed).
                // If it's future, it should be 0.
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
        <div className="absolute top-0 left-0 right-0 flex gap-1 p-2 z-50 bg-gradient-to-b from-black/80 to-transparent pt-4">
            {scenes.map((s, idx) => (
                <div key={s.id} className="h-1 flex-1 bg-white/20 rounded-full overflow-hidden backdrop-blur-sm">
                    <div 
                        className="h-full bg-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.5)] transition-all duration-100 ease-linear"
                        style={{ 
                            width: idx < currentSceneIndex ? '100%' : 
                                   idx === currentSceneIndex ? `${progress * 100}%` : '0%' 
                        }}
                    />
                </div>
            ))}
        </div>

        {/* Controls Overlay (Hover) */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 hover:opacity-100 transition-opacity duration-300 group cursor-pointer z-50" onClick={togglePlay}>
             <button 
                className="w-20 h-20 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center hover:scale-110 transition-transform duration-200 text-white shadow-lg border border-white/20"
             >
                {isPlaying ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1" />}
             </button>
        </div>

      </div>

      {/* Global Controls */}
      <div className="absolute bottom-6 flex gap-4 z-50">
        <button onClick={onClose} className="px-6 py-3 rounded-full bg-slate-800 text-white font-medium hover:bg-slate-700 transition border border-slate-700 shadow-lg">
            Close
        </button>
        <button onClick={restart} className="px-6 py-3 rounded-full bg-slate-800 text-white font-medium hover:bg-slate-700 transition flex items-center gap-2 border border-slate-700 shadow-lg">
            <RotateCcw size={18} /> Restart
        </button>
      </div>
    </div>
  );
};

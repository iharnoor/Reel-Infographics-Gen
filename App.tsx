import React, { useState } from 'react';
import { ApiKeyModal } from './components/ApiKeyModal';
import { Player } from './components/Player';
import { analyzeScript, generateSceneImage, generateSceneVideo } from './services/geminiService';
import { Scene, Storyboard } from './types';
import { Clapperboard, Sparkles, AlertCircle, Loader2, PlayCircle, Image as ImageIcon, Download, Film, Video, Wand2, ChevronRight } from 'lucide-react';
import JSZip from 'jszip';

const App: React.FC = () => {
  const [apiKeyReady, setApiKeyReady] = useState(false);
  const [forceKeySelection, setForceKeySelection] = useState(false);

  const [script, setScript] = useState("");
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9">("9:16");
  const [isDramatic, setIsDramatic] = useState(false);
  const [storyboard, setStoryboard] = useState<Storyboard | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressMessage, setProgressMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [playerStartIndex, setPlayerStartIndex] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [videoExportState, setVideoExportState] = useState<{
    isExporting: boolean;
    progress: number;
    message: string;
  }>({
    isExporting: false,
    progress: 0,
    message: ''
  });

  // Helper to handle API errors
  const handleApiError = (err: any) => {
    const msg = err.message || JSON.stringify(err);
    console.error("API Error encountered:", msg);

    if (msg.includes('403') || msg.includes('PERMISSION_DENIED')) {
      setError("Permission Denied: Gemini 3 Pro requires a Paid Project API Key for image generation. Please select a valid key.");
      setForceKeySelection(true);
      setApiKeyReady(false);
    } else {
      setError(msg || "An unexpected error occurred.");
    }
    setIsProcessing(false);
  };

  // 1. Analyze script
  const handleGenerateStoryboard = async () => {
    if (!script.trim()) return;
    setIsProcessing(true);
    setError(null);
    setForceKeySelection(false);
    setProgressMessage("Analyzing script and planning scenes...");

    try {
      const data = await analyzeScript(script, 60, aspectRatio, isDramatic);
      setStoryboard(data);
      generateImages(data.scenes);
    } catch (err: any) {
      handleApiError(err);
    }
  };

  // 2. Generate images in parallel
  const generateImages = async (scenesToProcess: Scene[]) => {
    setIsProcessing(true);
    setError(null);
    setProgressMessage("Starting parallel generation...");

    const CONCURRENCY_LIMIT = 3;

    const processScene = async (scene: Scene) => {
      const sceneId = scene.id;
      let retries = 0;
      const MAX_RETRIES = 5;
      let success = false;

      while (!success && retries < MAX_RETRIES) {
        setStoryboard(prev => {
          if (!prev) return null;
          return {
            ...prev,
            scenes: prev.scenes.map(s => s.id === sceneId ? { ...s, status: 'generating' } : s)
          };
        });

        try {
          const base64Data = await generateSceneImage(scene.visualPrompt, aspectRatio, isDramatic);

          setStoryboard(prev => {
            if (!prev) return null;
            return {
              ...prev,
              scenes: prev.scenes.map(s => s.id === sceneId ? { ...s, imageData: base64Data, status: 'completed' } : s)
            };
          });
          success = true;
        } catch (e: any) {
          const msg = e.message || JSON.stringify(e);
          console.warn(`Scene ${sceneId} error:`, msg);

          if (msg.includes('403') || msg.includes('PERMISSION_DENIED')) {
            setStoryboard(prev => prev ? {
                ...prev,
                scenes: prev.scenes.map(s => s.id === sceneId ? { ...s, status: 'error' } : s)
            } : null);
            throw e;
          }

          if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) {
            retries++;
            if (retries >= MAX_RETRIES) {
              setStoryboard(prev => prev ? {
                  ...prev,
                  scenes: prev.scenes.map(s => s.id === sceneId ? { ...s, status: 'error' } : s)
              } : null);
              break;
            }

            let waitMs = 5000 * Math.pow(2, retries);
            const match = msg.match(/retry in (\d+(\.\d+)?)s/);
            if (match && match[1]) {
                waitMs = Math.ceil(parseFloat(match[1]) * 1000) + 2000;
            }

            console.log(`Rate limit hit for scene ${sceneId}. Retrying in ${waitMs}ms...`);
            await new Promise(resolve => setTimeout(resolve, waitMs));
          } else {
            setStoryboard(prev => prev ? {
                ...prev,
                scenes: prev.scenes.map(s => s.id === sceneId ? { ...s, status: 'error' } : s)
            } : null);
            break;
          }
        }
      }
    };

    const executing: Promise<void>[] = [];
    let hasCriticalError = false;

    setProgressMessage("Generating visuals in parallel...");

    for (const scene of scenesToProcess) {
        if (hasCriticalError) break;

        const p = processScene(scene).catch(e => {
            if (e.message?.includes('403') || e.message?.includes('PERMISSION_DENIED')) {
                hasCriticalError = true;
                handleApiError(e);
            }
        });

        const pWrapper: Promise<void> = p.then(() => {
             executing.splice(executing.indexOf(pWrapper), 1);
        });

        executing.push(pWrapper);

        if (executing.length >= CONCURRENCY_LIMIT) {
            await Promise.race(executing);
        }
    }

    await Promise.all(executing);

    if (!hasCriticalError) {
        setIsProcessing(false);
        setProgressMessage("Done!");
    }
  };

  // 3. Generate Video for a specific scene
  const generateVideoForScene = async (sceneId: number) => {
    const scene = storyboard?.scenes.find(s => s.id === sceneId);
    if (!scene || !scene.imageData) return;

    setStoryboard(prev => prev ? {
        ...prev,
        scenes: prev.scenes.map(s => s.id === sceneId ? { ...s, videoStatus: 'generating' } : s)
    } : null);

    let retries = 0;
    const MAX_RETRIES = 3;
    let success = false;

    while (!success && retries < MAX_RETRIES) {
        try {
            const videoUri = await generateSceneVideo(scene.imageData, scene.visualPrompt, aspectRatio, isDramatic);

            let videoBlob: Blob | undefined;
            try {
                const response = await fetch(videoUri);
                if (response.ok) {
                    videoBlob = await response.blob();
                    console.log(`Cached video blob for scene ${sceneId}, size: ${videoBlob.size} bytes`);
                }
            } catch (blobErr) {
                console.warn(`Failed to cache blob for scene ${sceneId}, will rely on URL`, blobErr);
            }

            setStoryboard(prev => prev ? {
                ...prev,
                scenes: prev.scenes.map(s => s.id === sceneId ? { ...s, videoStatus: 'completed', videoUri, videoBlob } : s)
            } : null);
            success = true;
        } catch (err: any) {
            const msg = err.message || JSON.stringify(err);
            console.error(`Video gen error scene ${sceneId} attempt ${retries + 1}`, msg);

            retries++;
            if (retries >= MAX_RETRIES) {
                    setStoryboard(prev => prev ? {
                    ...prev,
                    scenes: prev.scenes.map(s => s.id === sceneId ? { ...s, videoStatus: 'error' } : s)
                } : null);
                break;
            }

            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
  };

  const handleGenerateVideo = (sceneId: number) => {
      generateVideoForScene(sceneId);
  };

  // Parallel Video Generation
  const handleAnimateAll = async () => {
      if (!storyboard) return;
      const scenesToAnimate = storyboard.scenes.filter(s => s.status === 'completed' && !s.videoUri && s.videoStatus !== 'generating');
      if (scenesToAnimate.length === 0) return;

      setIsProcessing(true);
      setProgressMessage("Animating scenes with Veo 3.1 Fast...");

      const CONCURRENCY_LIMIT = 3;
      const executing: Promise<void>[] = [];

      for (const scene of scenesToAnimate) {
        const p = generateVideoForScene(scene.id);

        const pWrapper: Promise<void> = p.then(() => {
             executing.splice(executing.indexOf(pWrapper), 1);
        });

        executing.push(pWrapper);

        if (executing.length >= CONCURRENCY_LIMIT) {
            await Promise.race(executing);
        }
      }

      await Promise.all(executing);

      setIsProcessing(false);
      setProgressMessage("Animation complete!");
  };


  const handleDownloadAll = async () => {
    if (!storyboard || !storyboard.scenes.length) return;
    setIsDownloading(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder("nano_banana_assets");

      let count = 0;
      storyboard.scenes.forEach((scene, index) => {
        if (scene.imageData) {
          folder?.file(`scene_${index + 1}.png`, scene.imageData, { base64: true });
          count++;
        }
      });

      if (count === 0) throw new Error("No images generated yet.");

      const content = await zip.generateAsync({ type: "blob" });
      const url = window.URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      const safeTitle = (storyboard.title || "story").replace(/[^a-z0-9]/gi, '_').toLowerCase();
      a.download = `${safeTitle}_images.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

    } catch (e: any) {
      console.error("Download failed", e);
      setError(`Download failed: ${e.message}`);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadImage = (scene: Scene) => {
    if (!scene.imageData) return;
    const a = document.createElement("a");
    a.href = `data:image/png;base64,${scene.imageData}`;
    a.download = `scene_${scene.id + 1}_image.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownloadVideo = async (scene: Scene) => {
    if (!scene.videoUri) return;
    try {
        const response = await fetch(scene.videoUri);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `scene_${scene.id + 1}_video.mp4`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    } catch (e) {
        console.error("Failed to download video blob", e);
        window.open(scene.videoUri, '_blank');
    }
  };

  const handleExportFullVideo = async () => {
    if (!storyboard) return;

    const scenesWithVideos = storyboard.scenes.filter(s => s.videoUri);
    if (scenesWithVideos.length !== storyboard.scenes.length) {
      setError(`${storyboard.scenes.length - scenesWithVideos.length} scenes still need videos. Click "Animate All" first.`);
      return;
    }

    try {
      setVideoExportState({ isExporting: true, progress: 0, message: 'Preparing export...' });
      setError(null);

      const videoBlobs: Blob[] = [];
      for (let i = 0; i < storyboard.scenes.length; i++) {
        const scene = storyboard.scenes[i];
        setVideoExportState(prev => ({
          ...prev,
          progress: (i / storyboard.scenes.length) * 50,
          message: `Preparing video ${i + 1}/${storyboard.scenes.length}...`
        }));

        if (scene.videoBlob) {
          console.log(`Using cached blob for scene ${i + 1}`);
          videoBlobs.push(scene.videoBlob);
        } else if (scene.videoUri) {
          console.log(`Fetching video from URL for scene ${i + 1}`);
          const response = await fetch(scene.videoUri);
          if (!response.ok) {
            throw new Error(`Failed to download video ${i + 1}. URL may have expired. Try re-animating this scene.`);
          }
          const blob = await response.blob();
          videoBlobs.push(blob);
        } else {
          throw new Error(`Scene ${i + 1} has no video. Please animate all scenes first.`);
        }
      }

      setVideoExportState(prev => ({
        ...prev,
        progress: 50,
        message: 'Loading video processor (one-time download)...'
      }));

      const { loadFFmpeg } = await import('./services/ffmpegService');
      await loadFFmpeg((p) => {
        setVideoExportState(prev => ({
          ...prev,
          progress: 50 + p * 5
        }));
      });

      const { stitchVideos } = await import('./services/ffmpegService');
      const finalBlob = await stitchVideos(videoBlobs, (msg, percent) => {
        setVideoExportState(prev => ({
          ...prev,
          progress: 55 + percent * 0.4,
          message: msg
        }));
      });

      setVideoExportState(prev => ({
        ...prev,
        progress: 95,
        message: 'Preparing download...'
      }));

      const url = URL.createObjectURL(finalBlob);
      const a = document.createElement('a');
      a.href = url;
      const safeTitle = (storyboard.title || 'story').replace(/[^a-z0-9]/gi, '_').toLowerCase();
      a.download = `${safeTitle}_full_video.mp4`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setVideoExportState({
        isExporting: false,
        progress: 100,
        message: 'Complete!'
      });

      setTimeout(() => {
        setVideoExportState({ isExporting: false, progress: 0, message: '' });
      }, 3000);

    } catch (err: any) {
      console.error('Video export failed:', err);

      let userMessage = 'Video export failed: ';
      if (err.message?.includes('fetch') || err.message?.includes('download')) {
        userMessage += 'Some video URLs may have expired. Try re-animating scenes.';
      } else if (err.message?.includes('memory')) {
        userMessage += 'Not enough memory. Try exporting fewer scenes.';
      } else {
        userMessage += err.message || 'Unknown error occurred.';
      }

      setError(userMessage);
      setVideoExportState({ isExporting: false, progress: 0, message: '' });
    }
  };

  const openPlayer = (startIndex: number = 0) => {
    setPlayerStartIndex(startIndex);
    setIsPlayerOpen(true);
  };

  const handleKeySelected = () => {
    setApiKeyReady(true);
    setForceKeySelection(false);
  };

  const completedImagesCount = storyboard?.scenes.filter(s => s.status === 'completed').length || 0;
  const completedVideosCount = storyboard?.scenes.filter(s => s.videoStatus === 'completed').length || 0;
  const totalCount = storyboard?.scenes.length || 0;
  const isAllDone = totalCount > 0 && completedImagesCount === totalCount;
  const hasErrors = storyboard?.scenes.some(s => s.status === 'error');

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden bg-mesh">
      <ApiKeyModal
        onKeySelected={handleKeySelected}
        forceNewKey={forceKeySelection}
      />

      {/* ===== Header ===== */}
      <header className="px-6 py-3.5 flex items-center justify-between border-b z-10 sticky top-0 glass" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center animate-float" style={{ background: 'linear-gradient(135deg, #fbbf24, #d97706)' }}>
            <span className="text-xl">🍌</span>
          </div>
          <div>
            <h1 className="text-lg font-display tracking-tight leading-none" style={{ color: '#fafaf9' }}>
              Nano Banana <span className="text-gradient-amber font-display italic">Pro</span>
            </h1>
            <p className="text-[9px] uppercase tracking-[0.2em] mt-0.5 font-medium" style={{ color: '#78716c' }}>Infographic Story Engine</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2.5">
          {/* Aspect Ratio Toggle */}
          <div className="flex items-center rounded-xl p-1" style={{ background: 'rgba(41, 37, 36, 0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <button
              onClick={() => setAspectRatio("9:16")}
              disabled={isProcessing}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={aspectRatio === "9:16"
                ? { background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', color: '#0c0a09', boxShadow: '0 2px 12px rgba(251,191,36,0.3)' }
                : { color: '#a8a29e' }
              }
            >
              9:16
            </button>
            <button
              onClick={() => setAspectRatio("16:9")}
              disabled={isProcessing}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={aspectRatio === "16:9"
                ? { background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', color: '#0c0a09', boxShadow: '0 2px 12px rgba(251,191,36,0.3)' }
                : { color: '#a8a29e' }
              }
            >
              16:9
            </button>
          </div>

          {/* Dramatic Mode Toggle */}
          <button
            onClick={() => setIsDramatic(!isDramatic)}
            disabled={isProcessing}
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={isDramatic
              ? { background: 'linear-gradient(135deg, #b45309, #92400e)', color: '#fef3c7', border: '1px solid rgba(180,83,9,0.5)', boxShadow: '0 2px 16px rgba(180,83,9,0.3)' }
              : { background: 'rgba(41, 37, 36, 0.6)', color: '#a8a29e', border: '1px solid rgba(255,255,255,0.06)' }
            }
          >
            {isDramatic ? '◆ Cinematic' : 'Cinematic'}
          </button>
        </div>
      </header>

      {/* ===== Main Content ===== */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">

        {/* Left Panel: Input */}
        <div className="w-full md:w-[360px] md:min-w-[360px] p-6 flex flex-col sidebar-gradient overflow-y-auto" style={{ borderRight: '1px solid rgba(255,255,255,0.04)' }}>
          <label className="text-xs font-semibold mb-3 flex items-center gap-2 uppercase tracking-[0.15em]" style={{ color: '#78716c' }}>
            <Clapperboard size={14} style={{ color: '#d97706' }} /> Script
          </label>
          <textarea
            className="flex-1 min-h-[200px] rounded-xl p-4 placeholder-stone-700 focus:outline-none resize-none mb-5 text-sm leading-relaxed transition-all"
            style={{
              background: 'rgba(28, 25, 23, 0.8)',
              border: '1px solid rgba(255,255,255,0.06)',
              color: '#d6d3d1',
              fontFamily: "'DM Sans', system-ui, sans-serif",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(251,191,36,0.3)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(251,191,36,0.08)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.boxShadow = 'none'; }}
            placeholder="Paste your script here..."
            value={script}
            onChange={(e) => setScript(e.target.value)}
            disabled={isProcessing && progressMessage.includes("Analyzing")}
          />

          {error && (
            <div className="mb-4 p-4 rounded-xl flex items-start gap-3 text-sm animate-fade-in" style={{ background: 'rgba(153, 27, 27, 0.12)', border: '1px solid rgba(220, 38, 38, 0.2)', color: '#fca5a5' }}>
              <AlertCircle size={18} className="mt-0.5 shrink-0" style={{ color: '#ef4444' }} />
              <div className="flex-1">
                <span className="font-semibold block mb-1" style={{ color: '#fecaca' }}>Error</span>
                {error}
              </div>
            </div>
          )}

          <button
            onClick={handleGenerateStoryboard}
            disabled={!apiKeyReady || !script.trim() || isProcessing}
            className="w-full py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all btn-glow"
            style={isProcessing
              ? { background: 'rgba(41, 37, 36, 0.6)', color: '#57534e', cursor: 'not-allowed', border: '1px solid rgba(255,255,255,0.04)' }
              : { background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', color: '#0c0a09', boxShadow: '0 4px 20px rgba(251,191,36,0.25)' }
            }
          >
            {isProcessing ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Sparkles size={18} />
                Generate Visuals
              </>
            )}
          </button>

          {isProcessing && (
            <div className="mt-4 flex flex-col items-center animate-fade-in">
                <p className="text-xs font-mono mb-2.5" style={{ color: 'rgba(251,191,36,0.7)' }}>{progressMessage}</p>
                <div className="w-full h-0.5 rounded-full overflow-hidden" style={{ background: 'rgba(41, 37, 36, 0.8)' }}>
                    <div className="h-full w-full animate-shimmer"></div>
                </div>
            </div>
          )}

          {/* Subtle decorative element */}
          <div className="mt-auto pt-8 flex items-center gap-2 opacity-30">
            <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, rgba(251,191,36,0.3), transparent)' }}></div>
          </div>
        </div>

        {/* Right Panel: Storyboard */}
        <div className="flex-1 p-6 overflow-y-auto" style={{ background: '#0e0c0b' }}>
          {!storyboard ? (
             <div className="h-full flex flex-col items-center justify-center rounded-2xl" style={{ border: '1px dashed rgba(255,255,255,0.06)', background: 'rgba(28, 25, 23, 0.3)' }}>
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5" style={{ background: 'rgba(41, 37, 36, 0.5)', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <ImageIcon size={28} style={{ color: '#44403c' }} />
                </div>
                <h3 className="text-base font-display mb-2" style={{ color: '#57534e' }}>No Visuals Yet</h3>
                <p className="max-w-[260px] text-center text-sm leading-relaxed" style={{ color: '#44403c' }}>Enter a script to generate your infographic story.</p>
             </div>
          ) : (
            <div className="max-w-7xl mx-auto pb-20">
              {/* Storyboard Header */}
              <div className="flex flex-col xl:flex-row xl:items-center justify-between mb-8 gap-4 p-6 rounded-2xl glass-card">
                <div>
                   <h2 className="text-2xl font-display tracking-tight mb-1.5" style={{ color: '#fafaf9' }}>{storyboard.title}</h2>
                   <div className="flex items-center gap-3 text-sm">
                       <span className="px-2.5 py-1 rounded-md text-xs font-mono" style={{ background: 'rgba(41, 37, 36, 0.8)', color: '#a8a29e', border: '1px solid rgba(255,255,255,0.04)' }}>
                         {totalCount} scenes
                       </span>
                       <span style={{ color: '#44403c' }}>·</span>
                       <span className="text-xs" style={{ color: '#78716c' }}>~{Math.round(storyboard.scenes.reduce((acc, s) => acc + s.duration, 0))}s</span>
                       {completedImagesCount > 0 && (
                         <>
                           <span style={{ color: '#44403c' }}>·</span>
                           <span className="text-xs font-mono" style={{ color: '#d97706' }}>{completedImagesCount}/{totalCount} rendered</span>
                         </>
                       )}
                   </div>
                </div>

                <div className="flex flex-wrap gap-2.5 relative">
                    {hasErrors && !isProcessing && (
                         <button
                            onClick={() => generateImages(storyboard.scenes.filter(s => s.status === 'error' || !s.imageData))}
                            className="px-4 py-2 rounded-xl font-semibold flex items-center gap-2 transition-all text-xs"
                            style={{ background: 'rgba(153, 27, 27, 0.15)', color: '#fca5a5', border: '1px solid rgba(220, 38, 38, 0.2)' }}
                         >
                            Retry Errors
                         </button>
                    )}

                    {isAllDone && completedVideosCount < totalCount && (
                         <button
                            onClick={handleAnimateAll}
                            disabled={isProcessing}
                            className="px-4 py-2 rounded-xl font-semibold flex items-center gap-2 transition-all text-xs btn-glow"
                            style={isProcessing
                                ? { background: 'rgba(41, 37, 36, 0.6)', color: '#57534e', cursor: 'not-allowed', border: '1px solid rgba(255,255,255,0.04)' }
                                : { background: 'linear-gradient(135deg, #1d4ed8, #2563eb)', color: '#fff', border: '1px solid rgba(59,130,246,0.3)', boxShadow: '0 2px 16px rgba(37,99,235,0.25)' }
                            }
                         >
                           {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                           Animate All
                         </button>
                    )}

                    <button
                        onClick={handleDownloadAll}
                        disabled={!isAllDone || isDownloading}
                        className="px-4 py-2 rounded-xl font-semibold flex items-center gap-2 transition-all text-xs"
                        style={isAllDone
                            ? { background: 'rgba(41, 37, 36, 0.6)', color: '#d6d3d1', border: '1px solid rgba(255,255,255,0.08)' }
                            : { background: 'rgba(28, 25, 23, 0.5)', color: '#44403c', cursor: 'not-allowed', border: '1px solid rgba(255,255,255,0.03)' }
                        }
                    >
                        {isDownloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                        Images
                    </button>

                    <button
                        type="button"
                        onClick={handleExportFullVideo}
                        disabled={
                            completedVideosCount !== totalCount ||
                            videoExportState.isExporting ||
                            isProcessing
                        }
                        className="px-4 py-2 rounded-xl font-semibold flex items-center gap-2 transition-all text-xs relative btn-glow"
                        style={completedVideosCount === totalCount && !videoExportState.isExporting
                            ? { background: 'linear-gradient(135deg, #b45309, #92400e)', color: '#fef3c7', border: '1px solid rgba(180,83,9,0.4)', boxShadow: '0 2px 16px rgba(180,83,9,0.2)' }
                            : { background: 'rgba(28, 25, 23, 0.5)', color: '#44403c', cursor: 'not-allowed', border: '1px solid rgba(255,255,255,0.03)' }
                        }
                    >
                        {videoExportState.isExporting ? (
                            <>
                                <Loader2 size={14} className="animate-spin" />
                                {Math.round(videoExportState.progress)}%
                            </>
                        ) : (
                            <>
                                <Film size={14} />
                                Export Video
                            </>
                        )}
                    </button>

                    <button
                        onClick={() => openPlayer(0)}
                        disabled={!isAllDone}
                        className="px-5 py-2 rounded-xl font-semibold flex items-center gap-2 transition-all text-xs btn-glow"
                        style={isAllDone
                            ? { background: 'linear-gradient(135deg, #fbbf24, #d97706)', color: '#0c0a09', boxShadow: '0 2px 20px rgba(251,191,36,0.3)' }
                            : { background: 'rgba(41, 37, 36, 0.4)', color: '#57534e', cursor: 'not-allowed', border: '1px solid rgba(255,255,255,0.04)' }
                        }
                    >
                        <PlayCircle size={16} fill="currentColor" />
                        {isAllDone ? "Play Story" : `${completedImagesCount}/${totalCount}`}
                        {isAllDone && <ChevronRight size={14} />}
                    </button>

                    {videoExportState.isExporting && videoExportState.message && (
                        <p className="text-xs font-mono animate-pulse absolute -bottom-6 left-0 right-0 text-center" style={{ color: '#b45309' }}>
                            {videoExportState.message}
                        </p>
                    )}
                </div>
              </div>

              {/* Scene Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5">
                {storyboard.scenes.map((scene, index) => (
                  <div
                    key={scene.id}
                    className="relative group scene-card animate-stagger"
                    style={{ animationDelay: `${index * 60}ms` }}
                  >
                    <div className={`
                        ${aspectRatio === "9:16" ? "aspect-[9/16]" : "aspect-[16/9]"} rounded-xl overflow-hidden relative
                    `}
                    style={{
                      border: scene.status === 'error' ? '1px solid rgba(220, 38, 38, 0.3)' : '1px solid rgba(255,255,255,0.06)',
                      background: scene.status === 'error' ? 'rgba(153, 27, 27, 0.08)' : 'rgba(28, 25, 23, 0.6)',
                    }}
                    >
                      {scene.imageData ? (
                        <div className="w-full h-full relative">
                            <img
                                src={`data:image/png;base64,${scene.imageData}`}
                                alt={`Scene ${scene.id}`}
                                className={`w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 ${scene.videoUri ? 'opacity-90' : ''}`}
                            />

                            {/* Video Status Badge */}
                            {scene.videoStatus === 'generating' && (
                                <div className="absolute top-2.5 right-2.5 px-2 py-1 rounded-lg flex items-center gap-1.5" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', border: '1px solid rgba(251,191,36,0.3)' }}>
                                    <Loader2 size={10} className="animate-spin" style={{ color: '#fbbf24' }} />
                                    <span className="text-[9px] font-mono font-semibold" style={{ color: '#fde68a' }}>ANIMATING</span>
                                </div>
                            )}
                             {scene.videoUri && (
                                <div className="absolute top-2.5 right-2.5 px-2 py-1 rounded-lg flex items-center gap-1.5" style={{ background: 'rgba(29, 78, 216, 0.8)', backdropFilter: 'blur(8px)', border: '1px solid rgba(59,130,246,0.3)' }}>
                                    <Video size={10} style={{ color: '#fff' }} />
                                    <span className="text-[9px] font-mono font-semibold" style={{ color: '#fff' }}>VIDEO</span>
                                </div>
                            )}

                            {/* Number Badge */}
                            <div className="absolute top-2.5 left-2.5 w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold z-10" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', color: '#d6d3d1', border: '1px solid rgba(255,255,255,0.08)' }}>
                                {scene.id + 1}
                            </div>

                            {/* Hover Actions */}
                            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col items-center justify-center gap-2.5 z-20 px-3" style={{ background: 'rgba(14, 12, 11, 0.85)', backdropFilter: 'blur(4px)' }}>

                                {scene.status === 'completed' && (
                                    <>
                                        {!scene.videoUri && scene.videoStatus !== 'generating' && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleGenerateVideo(scene.id); }}
                                                className="w-full py-2 rounded-lg flex items-center justify-center gap-2 text-xs font-semibold transition-all"
                                                style={{ background: 'linear-gradient(135deg, #1d4ed8, #2563eb)', color: '#fff', border: '1px solid rgba(59,130,246,0.3)' }}
                                            >
                                                <Film size={13} /> Animate
                                            </button>
                                        )}

                                        <button
                                            onClick={(e) => { e.stopPropagation(); openPlayer(scene.id); }}
                                            className="w-full py-2 rounded-lg flex items-center justify-center gap-2 text-xs font-semibold transition-all btn-glow"
                                            style={{ background: 'linear-gradient(135deg, #fbbf24, #d97706)', color: '#0c0a09' }}
                                        >
                                            <PlayCircle size={13} fill="currentColor" /> Preview
                                        </button>

                                        <div className="flex gap-2 w-full">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleDownloadImage(scene); }}
                                                className="flex-1 py-2 rounded-lg flex items-center justify-center transition-all text-xs"
                                                style={{ background: 'rgba(41, 37, 36, 0.8)', color: '#d6d3d1', border: '1px solid rgba(255,255,255,0.08)' }}
                                                title="Download Image"
                                            >
                                                <ImageIcon size={13} />
                                            </button>

                                            {scene.videoUri ? (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDownloadVideo(scene); }}
                                                    className="flex-1 py-2 rounded-lg flex items-center justify-center transition-all text-xs"
                                                    style={{ background: 'rgba(29, 78, 216, 0.5)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.2)' }}
                                                    title="Download Video"
                                                >
                                                    <Video size={13} />
                                                </button>
                                            ) : (
                                                <div className="flex-1"></div>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center relative overflow-hidden">
                            {/* Subtle dot pattern */}
                            <div className="absolute inset-0 opacity-[0.03]" style={{backgroundImage: 'radial-gradient(circle, #a8a29e 1px, transparent 1px)', backgroundSize: '20px 20px'}}></div>

                            {scene.status === 'generating' ? (
                                <>
                                    <div className="relative mb-3">
                                        <div className="absolute inset-0 rounded-full blur-xl animate-pulse" style={{ background: 'rgba(251,191,36,0.15)' }}></div>
                                        <Loader2 size={28} className="animate-spin relative z-10" style={{ color: '#d97706' }} />
                                    </div>
                                    <span className="text-[10px] font-mono uppercase tracking-[0.15em]" style={{ color: 'rgba(217,119,6,0.7)' }}>Rendering</span>
                                </>
                            ) : scene.status === 'error' ? (
                                <>
                                    <AlertCircle size={28} className="mb-2" style={{ color: '#dc2626' }} />
                                    <span className="text-[10px] font-semibold" style={{ color: '#fca5a5' }}>Failed</span>
                                </>
                            ) : (
                                <>
                                    <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-2 text-xs font-bold" style={{ background: 'rgba(41, 37, 36, 0.5)', color: '#57534e', border: '1px solid rgba(255,255,255,0.04)' }}>
                                        {scene.id + 1}
                                    </div>
                                    <span className="text-[10px] font-medium" style={{ color: '#44403c' }}>Queued</span>
                                </>
                            )}
                        </div>
                      )}

                      {/* Bottom Info */}
                      <div className="absolute inset-x-0 bottom-0 scene-overlay-gradient p-3.5 translate-y-1 group-hover:translate-y-0 transition-transform duration-300 z-10 pointer-events-none">
                         <div className="flex justify-between items-center mb-1.5">
                             <div className="h-px w-6 rounded-full" style={{ background: '#d97706' }}></div>
                             <span className="text-[9px] font-mono" style={{ color: '#78716c' }}>{scene.duration}s</span>
                         </div>
                         <p className="text-[11px] line-clamp-3 leading-relaxed" style={{ color: '#a8a29e' }}>{scene.text}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Fullscreen Player */}
      {isPlayerOpen && storyboard && (
        <Player
            scenes={storyboard.scenes}
            startIndex={playerStartIndex}
            aspectRatio={aspectRatio}
            onClose={() => setIsPlayerOpen(false)}
        />
      )}
    </div>
  );
};

export default App;

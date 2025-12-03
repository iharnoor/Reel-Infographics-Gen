import React, { useState } from 'react';
import { ApiKeyModal } from './components/ApiKeyModal';
import { Player } from './components/Player';
import { analyzeScript, generateSceneImage, generateSceneVideo } from './services/geminiService';
import { Scene, Storyboard } from './types';
import { Clapperboard, Sparkles, AlertCircle, Loader2, PlayCircle, Image as ImageIcon, StopCircle, Download, Film, Video, Wand2 } from 'lucide-react';
import JSZip from 'jszip';

const App: React.FC = () => {
  const [apiKeyReady, setApiKeyReady] = useState(false);
  const [forceKeySelection, setForceKeySelection] = useState(false);
  
  const [script, setScript] = useState("");
  const [storyboard, setStoryboard] = useState<Storyboard | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressMessage, setProgressMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [playerStartIndex, setPlayerStartIndex] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);

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
      const data = await analyzeScript(script, 60);
      setStoryboard(data);
      // Start parallel generation
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
        // Update status to generating
        setStoryboard(prev => {
          if (!prev) return null;
          return {
            ...prev,
            scenes: prev.scenes.map(s => s.id === sceneId ? { ...s, status: 'generating' } : s)
          };
        });

        try {
          const base64Data = await generateSceneImage(scene.visualPrompt);
          
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
            // Critical error, stop retrying this scene
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

            let waitMs = 5000 * Math.pow(2, retries); // Exponential backoff
            // Try to parse retry delay from message
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

    // Parallel execution queue
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
        
        // Wrap promise to manage the executing array
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

  // 3. Generate Video for a specific scene (Single or internal use)
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
            const videoUri = await generateSceneVideo(scene.imageData, scene.visualPrompt);
            setStoryboard(prev => prev ? {
                ...prev,
                scenes: prev.scenes.map(s => s.id === sceneId ? { ...s, videoStatus: 'completed', videoUri } : s)
            } : null);
            success = true;
        } catch (err: any) {
            const msg = err.message || JSON.stringify(err);
            console.error(`Video gen error scene ${sceneId} attempt ${retries + 1}`, msg);

            // Retry on generic errors if not a strict failure
            retries++;
            if (retries >= MAX_RETRIES) {
                    setStoryboard(prev => prev ? {
                    ...prev,
                    scenes: prev.scenes.map(s => s.id === sceneId ? { ...s, videoStatus: 'error' } : s)
                } : null);
                break;
            }
            
            // Short backoff
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
  };

  // Wrapper for button click
  const handleGenerateVideo = (sceneId: number) => {
      generateVideoForScene(sceneId);
  };

  // Parallel Video Generation (Restored Parallelism for Fal.ai)
  const handleAnimateAll = async () => {
      if (!storyboard) return;
      const scenesToAnimate = storyboard.scenes.filter(s => s.status === 'completed' && !s.videoUri && s.videoStatus !== 'generating');
      if (scenesToAnimate.length === 0) return;

      setIsProcessing(true);
      setProgressMessage("Animating scenes with Kling (Parallel)...");

      const CONCURRENCY_LIMIT = 3; // Fal.ai queue handles this well, but let's be polite
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
        // Include videos if they exist
        // Note: Videos are URLs, we can't easily fetch and blob them all without potential CORS or bandwidth issues in a loop here,
        // but let's at least create a text file with links or try to fetch if possible.
        // For simplicity and stability, we'll stick to images for the bulk zip or need to fetch blobs one by one.
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
        // Fal.ai URLs are usually public for a short time, fetch directly
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
        // Fallback to direct link opening
        window.open(scene.videoUri, '_blank');
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
    <div className="flex-1 flex flex-col relative overflow-hidden bg-slate-950">
      <ApiKeyModal 
        onKeySelected={handleKeySelected} 
        forceNewKey={forceKeySelection} 
      />

      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between border-b border-slate-800 bg-slate-900/80 backdrop-blur-md z-10 sticky top-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-xl flex items-center justify-center shadow-lg shadow-yellow-500/20 rotate-3 transition-transform hover:rotate-6">
            <span className="text-2xl">🍌</span>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white leading-none">Nano Banana <span className="text-yellow-400">Pro</span></h1>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-1 font-semibold">Infographic Story Engine</p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        
        {/* Left Panel: Input */}
        <div className="w-full md:w-1/3 min-w-[320px] border-r border-slate-800 p-6 flex flex-col bg-slate-900/30 overflow-y-auto custom-scrollbar">
          <label className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2 uppercase tracking-wide">
            <Clapperboard size={16} className="text-yellow-500" /> Video Script
          </label>
          <textarea
            className="flex-1 min-h-[200px] bg-slate-900 border border-slate-700 rounded-xl p-4 text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 resize-none mb-4 font-mono text-sm leading-relaxed transition-all shadow-inner"
            placeholder="Paste your script here... (e.g. 'The future of AI is changing rapidly. First, we saw huge LLMs dominating the landscape. Now, efficiency is king...')"
            value={script}
            onChange={(e) => setScript(e.target.value)}
            disabled={isProcessing && progressMessage.includes("Analyzing")}
          />
          
          {error && (
            <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-3 text-red-200 text-sm animate-fade-in">
              <AlertCircle size={20} className="mt-0.5 text-red-400 shrink-0" />
              <div className="flex-1">
                <span className="font-bold block mb-1">Error encountered</span>
                {error}
              </div>
            </div>
          )}

          <button
            onClick={handleGenerateStoryboard}
            disabled={!apiKeyReady || !script.trim() || isProcessing}
            className={`
              w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg
              ${isProcessing 
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700' 
                : 'bg-gradient-to-r from-yellow-400 to-yellow-500 text-slate-900 hover:shadow-[0_0_25px_rgba(250,204,21,0.3)] hover:scale-[1.01] active:scale-[0.98]'
              }
            `}
          >
            {isProcessing ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Sparkles size={20} />
                Generate Visuals
              </>
            )}
          </button>
          
          {isProcessing && (
            <div className="mt-4 flex flex-col items-center">
                <p className="text-xs font-mono text-yellow-500/80 animate-pulse mb-2">{progressMessage}</p>
                <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-yellow-500/50 w-full animate-[shimmer_2s_infinite_linear] bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.5),transparent)] bg-[length:200%_100%]"></div>
                </div>
            </div>
          )}
        </div>

        {/* Right Panel: Storyboard Visualization */}
        <div className="flex-1 bg-slate-950 p-6 overflow-y-auto custom-scrollbar">
          {!storyboard ? (
             <div className="h-full flex flex-col items-center justify-center text-slate-600 border-2 border-dashed border-slate-800/50 rounded-2xl bg-slate-900/20">
                <div className="w-20 h-20 bg-slate-900 rounded-full flex items-center justify-center mb-6 shadow-inner">
                    <ImageIcon size={32} className="opacity-40" />
                </div>
                <h3 className="text-lg font-semibold text-slate-400 mb-2">No Visuals Yet</h3>
                <p className="max-w-xs text-center text-sm">Enter a script on the left to generate your Nano Banana Pro infographic story.</p>
             </div>
          ) : (
            <div className="max-w-7xl mx-auto pb-20">
              <div className="flex flex-col xl:flex-row xl:items-center justify-between mb-8 gap-4 bg-slate-900/50 p-6 rounded-2xl border border-slate-800">
                <div>
                   <h2 className="text-2xl font-bold text-white mb-1 tracking-tight">{storyboard.title}</h2>
                   <div className="flex items-center gap-3 text-sm">
                       <span className="bg-slate-800 text-slate-300 px-2 py-1 rounded-md font-mono">{totalCount} Scenes</span>
                       <span className="text-slate-500">•</span>
                       <span className="text-slate-400">~{Math.round(storyboard.scenes.reduce((acc, s)=> acc + s.duration, 0))}s Duration</span>
                   </div>
                </div>
                
                <div className="flex flex-wrap gap-3">
                    {hasErrors && !isProcessing && (
                         <button
                            onClick={() => generateImages(storyboard.scenes.filter(s => s.status === 'error' || !s.imageData))}
                            className="px-4 py-2.5 rounded-full font-bold flex items-center gap-2 bg-slate-800 text-red-400 hover:bg-slate-700 transition-colors border border-red-500/20 text-sm"
                         >
                            Retry Errors
                         </button>
                    )}

                    {isAllDone && completedVideosCount < totalCount && (
                         <button
                            onClick={handleAnimateAll}
                            disabled={isProcessing}
                            className={`
                                px-4 py-2.5 rounded-full font-bold flex items-center gap-2 transition-all border text-sm
                                ${isProcessing
                                    ? 'bg-slate-800 border-slate-700 text-slate-500 cursor-not-allowed'
                                    : 'bg-blue-600 text-white hover:bg-blue-500 border-blue-500 shadow-lg'
                                }
                            `}
                         >
                           {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                           Animate All
                         </button>
                    )}

                    <button
                        onClick={handleDownloadAll}
                        disabled={!isAllDone || isDownloading}
                        className={`
                            px-4 py-2.5 rounded-full font-bold flex items-center gap-2 transition-all border text-sm
                            ${isAllDone 
                                ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 hover:border-slate-500 hover:text-white shadow-lg' 
                                : 'bg-slate-900 border-slate-800 text-slate-700 cursor-not-allowed opacity-50'
                            }
                        `}
                    >
                        {isDownloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                        Images Zip
                    </button>
                    
                    <button
                        onClick={() => openPlayer(0)}
                        disabled={!isAllDone}
                        className={`
                            px-6 py-2.5 rounded-full font-bold flex items-center gap-2 transition-all text-sm
                            ${isAllDone 
                                ? 'bg-green-500 text-white hover:bg-green-400 shadow-[0_0_20px_rgba(34,197,94,0.3)] hover:scale-105 active:scale-95' 
                                : 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-700'
                            }
                        `}
                    >
                        <PlayCircle size={18} fill="currentColor" className={isAllDone ? "text-white" : "text-slate-600"} />
                        {isAllDone ? "Play Story" : `Generating ${completedImagesCount}/${totalCount}`}
                    </button>
                </div>
              </div>

              {/* Grid of Scenes */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {storyboard.scenes.map((scene) => (
                  <div key={scene.id} className="relative group perspective">
                    {/* Card */}
                    <div className={`
                        aspect-[9/16] rounded-xl overflow-hidden border relative shadow-xl transition-all duration-300
                        ${scene.status === 'error' ? 'border-red-500/50 bg-red-950/10' : 'border-slate-800 bg-slate-900'}
                        group-hover:shadow-[0_0_25px_rgba(250,204,21,0.1)] group-hover:border-yellow-500/30
                    `}>
                      {scene.imageData ? (
                        <div className="w-full h-full relative">
                            <img 
                                src={`data:image/png;base64,${scene.imageData}`} 
                                alt={`Scene ${scene.id}`}
                                className={`w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 ${scene.videoUri ? 'opacity-80' : ''}`}
                            />
                            
                            {/* Video Status Indicator */}
                            {scene.videoStatus === 'generating' && (
                                <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md px-2 py-1 rounded-full border border-yellow-500/50 flex items-center gap-1">
                                    <Loader2 size={10} className="text-yellow-400 animate-spin" />
                                    <span className="text-[9px] text-yellow-100 font-mono">ANIMATING</span>
                                </div>
                            )}
                             {scene.videoUri && (
                                <div className="absolute top-2 right-2 bg-blue-600/80 backdrop-blur-md px-2 py-1 rounded-full border border-blue-400/50 flex items-center gap-1">
                                    <Video size={10} className="text-white" />
                                    <span className="text-[9px] text-white font-mono">VIDEO READY</span>
                                </div>
                            )}

                            {/* Number Badge */}
                            <div className="absolute top-2 left-2 w-6 h-6 bg-black/50 backdrop-blur-md rounded-full flex items-center justify-center text-[10px] font-bold text-white border border-white/10 z-10">
                                {scene.id + 1}
                            </div>
                            
                            {/* Hover Actions Overlay */}
                            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col items-center justify-center gap-3 z-20 px-4">
                                
                                {scene.status === 'completed' && (
                                    <>
                                        {/* Animate / Video Button */}
                                        {!scene.videoUri && scene.videoStatus !== 'generating' && (
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handleGenerateVideo(scene.id); }}
                                                className="w-full py-2 bg-gradient-to-r from-blue-600 to-blue-500 rounded-lg flex items-center justify-center gap-2 text-white text-xs font-bold hover:scale-105 transition-transform shadow-lg border border-blue-400/30"
                                            >
                                                <Film size={14} /> Animate
                                            </button>
                                        )}

                                        {/* Play Button */}
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); openPlayer(scene.id); }}
                                            className="w-full py-2 bg-yellow-500 rounded-lg flex items-center justify-center gap-2 text-slate-900 text-xs font-bold hover:scale-105 transition-transform shadow-lg shadow-yellow-500/20"
                                        >
                                            <PlayCircle size={14} fill="currentColor" /> Preview
                                        </button>
                                        
                                        <div className="flex gap-2 w-full mt-2">
                                            {/* Download Image */}
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handleDownloadImage(scene); }}
                                                className="flex-1 py-2 bg-slate-700 rounded-lg flex items-center justify-center text-white hover:bg-slate-600 transition-all border border-slate-600 text-xs"
                                                title="Download Image"
                                            >
                                                <ImageIcon size={14} />
                                            </button>
                                            
                                            {/* Download Video (If available) */}
                                            {scene.videoUri ? (
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); handleDownloadVideo(scene); }}
                                                    className="flex-1 py-2 bg-blue-600 rounded-lg flex items-center justify-center text-white hover:bg-blue-500 transition-all border border-blue-500 text-xs"
                                                    title="Download Video"
                                                >
                                                    <Video size={14} />
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
                            {/* Background pattern */}
                            <div className="absolute inset-0 opacity-5" style={{backgroundImage: 'radial-gradient(circle, #64748b 1px, transparent 1px)', backgroundSize: '16px 16px'}}></div>
                            
                            {scene.status === 'generating' ? (
                                <>
                                    <div className="relative">
                                        <div className="absolute inset-0 bg-yellow-500 rounded-full blur-xl opacity-20 animate-pulse"></div>
                                        <Loader2 size={32} className="text-yellow-400 animate-spin mb-3 relative z-10" />
                                    </div>
                                    <span className="text-xs font-mono text-yellow-500/80 uppercase tracking-wider">Rendering</span>
                                </>
                            ) : scene.status === 'error' ? (
                                <>
                                    <AlertCircle size={32} className="text-red-500 mb-2" />
                                    <span className="text-xs text-red-400 font-bold">Failed</span>
                                </>
                            ) : (
                                <>
                                    <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center mb-2 text-slate-600 font-bold border border-slate-700">
                                        {scene.id + 1}
                                    </div>
                                    <span className="text-xs text-slate-600 font-medium">Pending</span>
                                </>
                            )}
                        </div>
                      )}
                      
                      {/* Overlay Info */}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent p-4 translate-y-2 group-hover:translate-y-0 transition-transform duration-300 z-10 pointer-events-none">
                         <div className="flex justify-between items-center mb-1">
                             <div className="h-0.5 w-8 bg-yellow-500 rounded-full"></div>
                             <span className="text-[9px] font-mono text-slate-400">{scene.duration}s</span>
                         </div>
                         <p className="text-[11px] text-slate-300 line-clamp-3 leading-relaxed font-medium">{scene.text}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Fullscreen Player Overlay */}
      {isPlayerOpen && storyboard && (
        <Player 
            scenes={storyboard.scenes} 
            startIndex={playerStartIndex}
            onClose={() => setIsPlayerOpen(false)} 
        />
      )}
    </div>
  );
};

export default App;
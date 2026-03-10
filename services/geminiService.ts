import { Scene, Storyboard } from '../types';

const API_BASE = '/api';
const WORDS_PER_MINUTE = 140;

export const analyzeScript = async (
  script: string,
  totalTargetSeconds: number = 60,
  aspectRatio: '9:16' | '16:9' = '9:16',
  isDramatic: boolean = false,
  singleScene: boolean = false
): Promise<Storyboard> => {
  const res = await fetch(`${API_BASE}/gemini/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ script, aspectRatio, isDramatic, singleScene }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Analysis failed' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  const data = await res.json();

  const scenesWithMetadata: Scene[] = data.scenes.map((s: any, index: number) => {
    const wordCount = s.text.split(' ').length;
    const rawDuration = (wordCount / WORDS_PER_MINUTE) * 60;
    return {
      id: index,
      text: s.text,
      visualPrompt: s.visualPrompt,
      duration: Math.max(3, parseFloat(rawDuration.toFixed(1))),
      status: 'pending',
      videoStatus: 'none',
    };
  });

  const currentTotal = scenesWithMetadata.reduce((acc, s) => acc + s.duration, 0);
  let factor = 1;
  if (currentTotal < 30) factor = 30 / currentTotal;
  else if (currentTotal > 90) factor = 90 / currentTotal;

  if (factor !== 1) {
    scenesWithMetadata.forEach(s => {
      s.duration = parseFloat((s.duration * factor).toFixed(1));
    });
  }

  return {
    title: data.title || 'Untitled Infographic',
    scenes: scenesWithMetadata,
  };
};

export const generateSceneImage = async (
  prompt: string,
  aspectRatio: '9:16' | '16:9' = '9:16',
  isDramatic: boolean = false
): Promise<string> => {
  const res = await fetch(`${API_BASE}/gemini/image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, aspectRatio, isDramatic }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Image generation failed' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  const data = await res.json();
  return data.imageData;
};

// Image compression stays client-side (uses browser Canvas API)
const compressImageToBase64 = async (base64Str: string, quality = 0.85): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = `data:image/png;base64,${base64Str}`;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Could not get canvas context')); return; }
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('Canvas to Blob failed')); return; }
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result as string;
          const base64 = dataUrl.split(',')[1];
          resolve(base64);
        };
        reader.readAsDataURL(blob);
      }, 'image/jpeg', quality);
    };
    img.onerror = () => reject(new Error('Failed to load image for compression'));
  });
};

export const generateSceneVideo = async (
  imageB64: string,
  visualPrompt: string,
  aspectRatio: '9:16' | '16:9' = '9:16',
  isDramatic: boolean = false
): Promise<string> => {
  const compressedBase64 = await compressImageToBase64(imageB64);

  const res = await fetch(`${API_BASE}/fal/video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64: compressedBase64,
      visualPrompt,
      aspectRatio,
      isDramatic,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Video generation failed' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  const data = await res.json();
  return data.videoUrl;
};

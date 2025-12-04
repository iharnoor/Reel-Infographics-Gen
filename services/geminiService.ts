import { GoogleGenAI, Type } from "@google/genai";
import { Scene, Storyboard } from '../types';
import { fal } from "@fal-ai/client";

// Helper to estimate duration based on word count
const WORDS_PER_MINUTE = 140; // Slightly slower for better readability
const FAL_KEY = "4c332fb1-37a2-4f9a-909c-a93f07cab59f:e16e2e516ed3d088bc4039d5d9246586";

// Configure Fal
fal.config({
  credentials: FAL_KEY,
});

export const analyzeScript = async (script: string, totalTargetSeconds: number = 60): Promise<Storyboard> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key not found");

  const ai = new GoogleGenAI({ apiKey });

  // Use Flash for logic/text processing
  const model = "gemini-2.5-flash";

  const systemInstruction = `
    You are an expert storyboard artist and modern infographic designer.
    Your goal is to break down a video script into a series of 9:16 vertical infographic scenes with clean, balanced design.

    1. Break the script into segments. Each segment should represent roughly 5-7 seconds of narration.
    2. For each segment, provide the 'text' (the exact part of the script being spoken).
    3. For each segment, provide a 'visualPrompt' following these BALANCED design rules:
       - Describe 3-5 key visual elements (not too empty, not too cluttered)
       - Use clean geometric shapes, simple icons, and minimal text
       - Include one clear focal point with supporting elements
       - IMPORTANT: Choose background color based on topic/tone:
         * Tech/Innovation/Future: Deep blue or dark navy background
         * Energy/Positive/Growth: White or light cream background
         * Urgent/Important/Alert: Deep red or burgundy background
         * Nature/Health/Calm: Soft green or teal background
         * Finance/Premium/Professional: Dark charcoal or rich purple background
       - Specify HIGH CONTRAST colors: dark backgrounds need bright/vibrant elements, light backgrounds need bold dark elements
       - Modern, professional look - like a polished tech presentation
       - Example good prompts: "white background, bold black icons with electric blue accents" or "deep navy background, bright yellow chart with white text"
       - Always mention the background color first in your prompt
    4. Provide a title for the whole story.
  `;

  const response = await ai.models.generateContent({
    model,
    contents: script,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          scenes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                visualPrompt: { type: Type.STRING }
              },
              required: ["text", "visualPrompt"]
            }
          }
        },
        required: ["title", "scenes"]
      }
    }
  });

  const data = JSON.parse(response.text || "{}");
  
  if (!data.scenes || !Array.isArray(data.scenes)) {
    throw new Error("Invalid response from Gemini script analysis");
  }

  // Calculate timing based on word count
  const scenesWithMetadata: Scene[] = data.scenes.map((s: any, index: number) => {
    const wordCount = s.text.split(' ').length;
    const rawDuration = (wordCount / WORDS_PER_MINUTE) * 60; 
    return {
      id: index,
      text: s.text,
      visualPrompt: s.visualPrompt,
      duration: Math.max(3, parseFloat(rawDuration.toFixed(1))), // Minimum 3s per slide
      status: 'pending',
      videoStatus: 'none'
    };
  });

  // Smart duration adjustment:
  const currentTotal = scenesWithMetadata.reduce((acc, s) => acc + s.duration, 0);
  
  let factor = 1;
  // If extremely short, stretch slightly to meet minimum viability of a "video"
  if (currentTotal < 30) {
      factor = 30 / currentTotal;
  } 
  // If it's reasonably close to 60 (between 30 and 90), leave it natural (factor 1)
  else if (currentTotal > 90) {
      factor = 90 / currentTotal;
  }

  if (factor !== 1) {
    scenesWithMetadata.forEach(s => {
      s.duration = parseFloat((s.duration * factor).toFixed(1));
    });
  }

  return {
    title: data.title || "Untitled Infographic",
    scenes: scenesWithMetadata
  };
};

export const generateSceneImage = async (prompt: string): Promise<string> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key not found");

  const ai = new GoogleGenAI({ apiKey });

  // Use Nano Banana Pro (Gemini 3 Pro Image) for high quality
  const model = "gemini-3-pro-image-preview";

  const enhancedPrompt = `${prompt}. Vertical 9:16 aspect ratio. Modern clean infographic style: 3-5 well-spaced visual elements, clear focal point with supporting details, balanced composition with breathing room, crisp geometric shapes and simple icons, minimal text (key words only), HIGH CONTRAST colors (ensure elements pop against background), flat design with subtle depth, organized layout, professional and polished look. Use the background color specified in the description. Not too crowded but not empty.`;

  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [{ text: enhancedPrompt }]
    },
    config: {
      imageConfig: {
        aspectRatio: "9:16",
        imageSize: "1K" 
      }
    }
  });

  // Extract image
  for (const candidate of response.candidates || []) {
    for (const part of candidate.content.parts) {
      if (part.inlineData && part.inlineData.data) {
        return part.inlineData.data;
      }
    }
  }

  throw new Error("No image data found in response");
};

// Helper: Compress Image (Base64 PNG -> Blob JPEG)
const compressImageToBlob = async (base64Str: string, quality = 0.85): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = `data:image/png;base64,${base64Str}`;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }
      ctx.fillStyle = '#000000'; // Fill black background just in case transparency exists
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      
      canvas.toBlob((blob) => {
        if (blob) {
            resolve(blob);
        } else {
            reject(new Error("Canvas to Blob conversion failed"));
        }
      }, 'image/jpeg', quality);
    };
    img.onerror = (e) => reject(new Error("Failed to load image for compression"));
  });
};

export const generateSceneVideo = async (imageB64: string, visualPrompt: string): Promise<string> => {
  try {
    console.log("Starting video generation...");

    // 1. Compress Image to JPEG Blob (Reduces upload size and compatibility issues)
    console.log("Compressing image...");
    const imageBlob = await compressImageToBlob(imageB64);
    console.log("Image compressed, size:", imageBlob.size);

    // 2. Upload Image to Fal Storage
    console.log("Uploading image to Fal storage...");
    const imageUrl = await fal.storage.upload(imageBlob);
    console.log("Image uploaded:", imageUrl);

    // 3. Enhance Prompt for Video - Balanced Progressive Animation
    const prompt = `${visualPrompt}. Balanced modern animation: Start with solid color background showing main focal point, then progressively reveal 3-4 supporting elements one at a time with smooth fade-in transitions. Gentle camera motion (subtle zoom or pan), clean composition with good spacing between elements. HIGH CONTRAST throughout - elements must clearly stand out from background. Each new element appears with purpose, building a complete but organized scene. Professional infographic style with smooth pacing. Maintain the background color from the image. 4 seconds total.`;
    console.log("Prompt:", prompt);

    // 4. Subscribe to Veo 3.1 Fast Video Generation (Faster & Cheaper than Kling)
    console.log("Subscribing to Veo 3.1 Fast video generation...");
    const result: any = await fal.subscribe("fal-ai/veo3.1/fast/image-to-video", {
      input: {
        prompt: prompt,
        image_url: imageUrl,
        duration: "4s", // Veo 3.1 supports 4s, 6s, or 8s
        aspect_ratio: "9:16",
        generate_audio: false, // Disable audio for speed and lower cost
        resolution: "720p"
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === "IN_PROGRESS") {
           console.log("Video generation in progress...", update);
        }
      },
    });

    console.log("Veo 3.1 Fast API response:", result);

    if (result.data && result.data.video && result.data.video.url) {
      console.log("Video generated successfully:", result.data.video.url);
      return result.data.video.url;
    } else {
      console.error("Unexpected response structure:", result);
      throw new Error("No video URL returned from Fal AI");
    }

  } catch (error: any) {
    // Enhanced error logging for debugging
    console.error("Fal AI Detailed Error:", error);
    let errorMsg = error.message || "Unknown error";
    
    // Try to extract body message from ApiError
    if (error.body) {
        try {
            const body = typeof error.body === 'string' ? JSON.parse(error.body) : error.body;
            if (body.message) errorMsg = body.message;
        } catch (e) { /* ignore */ }
    }
    
    throw new Error(`Video generation failed: ${errorMsg}`);
  }
};
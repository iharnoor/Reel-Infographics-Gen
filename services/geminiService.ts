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

export const analyzeScript = async (script: string, totalTargetSeconds: number = 60, aspectRatio: "9:16" | "16:9" = "9:16"): Promise<Storyboard> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key not found");

  const ai = new GoogleGenAI({ apiKey });

  // Use Flash for logic/text processing
  const model = "gemini-2.5-flash";

  const textGuidance = aspectRatio === "16:9"
    ? `For 16:9 horizontal format, you can include more text overlays that provide context:
       - Add relevant labels, captions, or key terms that enhance understanding
       - Include data points, statistics, or key facts when relevant to the content
       - Use clear hierarchical text placement (title, subtitle, supporting text)
       - Text should be context-driven and informative, not marketing fluff
       - Position text to complement the 3D elements, typically on the sides or bottom third`
    : `For 9:16 vertical format, keep text minimal and clean:
       - Use concise labels or single key terms
       - Keep text simple and focused`;

  const systemInstruction = `
    You are an expert storyboard artist and minimalist 3D designer.
    Your goal is to break down a video script into a series of infographic scenes with clean, minimal 3D design.

    1. Break the script into segments. Each segment should represent roughly 5-7 seconds of narration.
    2. For each segment, provide the 'text' (the exact part of the script being spoken).
    3. For each segment, provide a 'visualPrompt' following these CLEAN MINIMAL design rules:
       - Describe 3-5 simple 3D elements (rounded squares, circles, cylinders, simple geometric shapes)
       - Use neutral backgrounds (beige, cream, soft gray, light tan, pale colors)
       - Include one clear focal point with simple supporting elements
       - IMPORTANT: Choose soft, professional colors:
         * Main elements: Dark navy, charcoal, or matte black 3D shapes
         * Accent colors: Warm orange, coral, soft blue, or pastel highlights
         * Backgrounds: Always neutral and soft (beige, cream, light gray)
       - Apply clean 3D style: rounded corners, soft shadows, subtle depth, professional lighting
       - Minimal icons and symbols: simple user icons, basic shapes, clean typography
       - Soft diffused lighting with gentle shadows (no harsh contrasts)
       - Clean composition with lots of breathing room and whitespace
       - ${textGuidance}
       - Example good prompts: "beige background, dark navy 3D rounded squares with simple white icons, orange accent sphere in center, soft shadows, clean minimal composition" or "cream background, matte black 3D cylinders arranged in pattern, coral accent elements, gentle lighting, professional and minimal"
       - Always mention the neutral background color first in your prompt
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

export const generateSceneImage = async (prompt: string, aspectRatio: "9:16" | "16:9" = "9:16"): Promise<string> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key not found");

  const ai = new GoogleGenAI({ apiKey });

  // Use Nano Banana Pro (Gemini 3 Pro Image) for high quality
  const model = "gemini-3-pro-image-preview";

  const orientationText = aspectRatio === "9:16" ? "Vertical 9:16" : "Horizontal 16:9";
  const textInstructions = aspectRatio === "16:9"
    ? "Include context-driven text overlays with clear hierarchy (titles, labels, key terms) that enhance understanding, positioned to complement the 3D elements"
    : "Minimal text labels with clean sans-serif typography";

  const enhancedPrompt = `${prompt}. ${orientationText} aspect ratio. Clean minimal 3D style: neutral soft background (beige/cream/soft gray), 3-5 simple 3D geometric elements (rounded squares, circles, cylinders) with soft shadows, dark navy or matte black main shapes with white simple icons, warm accent colors (orange, coral, or pastels), gentle diffused lighting, clean composition with breathing room and whitespace, professional depth with subtle 3D perspective, smooth rounded corners on all elements, soft drop shadows, ultra crisp rendering, ${textInstructions}, organized balanced layout. Professional, clean, and approachable look.`;

  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [{ text: enhancedPrompt }]
    },
    config: {
      imageConfig: {
        aspectRatio: aspectRatio,
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

export const generateSceneVideo = async (imageB64: string, visualPrompt: string, aspectRatio: "9:16" | "16:9" = "9:16"): Promise<string> => {
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

    // 3. Enhance Prompt for Video - Clean Minimal Animation
    const prompt = `${visualPrompt}. Clean minimal 3D animation: Start with neutral soft background, main 3D element gently fades in and settles into place, then progressively reveal 3-4 supporting elements one at a time with smooth fade-in. Subtle gentle camera motion (slight rotation or slow push in), elements smoothly animate into position with soft easing, gentle shadows appear as elements settle. Soft consistent lighting throughout with gentle highlights on 3D shapes. Each element appears with purpose and clean timing. Maintain clean minimal aesthetic with rounded 3D shapes, professional soft shadows, and breathing room between elements. Ultra crisp quality, smooth motion. Maintain neutral background and clean composition from the image. 4 seconds total.`;
    console.log("Prompt:", prompt);

    // 4. Subscribe to Veo 3.1 Fast Video Generation (Faster & Cheaper than Kling)
    console.log("Subscribing to Veo 3.1 Fast video generation...");
    const result: any = await fal.subscribe("fal-ai/veo3.1/fast/image-to-video", {
      input: {
        prompt: prompt,
        image_url: imageUrl,
        duration: "4s", // Veo 3.1 supports 4s, 6s, or 8s
        aspect_ratio: aspectRatio,
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
import { Router, Request, Response } from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import {
  validateAnalyzeRequest,
  validateImageRequest,
  validateGeminiStoryboardResponse,
} from '../middleware/validation';

const router = Router();

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured on server');
  return new GoogleGenAI({ apiKey });
}

// POST /api/gemini/analyze
router.post('/analyze', validateAnalyzeRequest, async (req: Request, res: Response) => {
  try {
    const { script, aspectRatio = '9:16', isDramatic = false } = req.body;
    const ai = getGeminiClient();

    const textGuidance = aspectRatio === '16:9'
      ? `For 16:9 horizontal format, you can include more text overlays that provide context:
         - Add relevant labels, captions, or key terms that enhance understanding
         - Include data points, statistics, or key facts when relevant to the content
         - Use clear hierarchical text placement (title, subtitle, supporting text)
         - Text should be context-driven and informative, not marketing fluff
         - Position text to complement the 3D elements, typically on the sides or bottom third`
      : `For 9:16 vertical format, keep text minimal and clean:
         - Use concise labels or single key terms
         - Keep text simple and focused`;

    const visualStyle = isDramatic
      ? `DRAMATIC MODE - Create cinematic, emotional visuals with human subjects:
         - Feature South Asian Americans (desis living in USA) as main subjects
         - Use dramatic lighting: golden hour, rim lighting, strong directional light, moody shadows
         - Rich color grading: warm tones, cinematic color palettes, high contrast
         - Dynamic compositions: interesting angles, depth of field, layered scenes
         - Emotional expressions and body language that convey the story
         - Contextual settings: modern American environments (offices, homes, urban spaces, tech settings)
         - Cinematic atmosphere: film-like quality, dramatic storytelling through visuals
         - Professional photography style with depth and texture
         - Include relevant props and environmental details that enhance the narrative
         - Use dramatic weather or atmospheric elements when appropriate (fog, sunset, city lights)
         - Example: "South Asian woman in professional attire standing confidently in modern glass office, dramatic golden hour lighting streaming through windows, cinematic composition with warm color grading, depth of field with blurred city skyline background, film-like quality"`
      : `MINIMAL MODE - Clean, minimal 3D design:
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
         - Example: "beige background, dark navy 3D rounded squares with simple white icons, orange accent sphere in center, soft shadows, clean minimal composition"`;

    const systemInstruction = `
      You are an expert storyboard artist and visual designer.
      Your goal is to break down a video script into a series of compelling scenes.

      1. Break the script into segments. Each segment should represent roughly 5-7 seconds of narration.
      2. For each segment, provide the 'text' (the exact part of the script being spoken).
      3. For each segment, provide a 'visualPrompt' following these design rules:
         ${visualStyle}
         - ${textGuidance}
         - Always mention the background/setting first in your prompt
      4. Provide a title for the whole story.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: script,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
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
                  visualPrompt: { type: Type.STRING },
                },
                required: ['text', 'visualPrompt'],
              },
            },
          },
          required: ['title', 'scenes'],
        },
      },
    });

    const raw = JSON.parse(response.text || '{}');
    const data = validateGeminiStoryboardResponse(raw);
    res.json(data);
  } catch (err: any) {
    const msg = err.message || 'Analysis failed';
    const status = msg.includes('403') || msg.includes('PERMISSION_DENIED') ? 403
      : msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') ? 429
      : 500;
    res.status(status).json({ error: msg });
  }
});

// POST /api/gemini/image
router.post('/image', validateImageRequest, async (req: Request, res: Response) => {
  try {
    const { prompt, aspectRatio = '9:16', isDramatic = false } = req.body;
    const ai = getGeminiClient();

    const orientationText = aspectRatio === '9:16' ? 'Vertical 9:16' : 'Horizontal 16:9';
    const textInstructions = aspectRatio === '16:9'
      ? 'Include context-driven text overlays with clear hierarchy (titles, labels, key terms) that enhance understanding, positioned to complement the visuals'
      : 'Minimal text labels with clean sans-serif typography';

    const enhancedPrompt = isDramatic
      ? `${prompt}. ${orientationText} aspect ratio. Cinematic dramatic photography: South Asian American subjects, dramatic lighting (golden hour, rim lighting, moody shadows), rich color grading with warm tones and high contrast, dynamic composition with interesting angles and depth of field, emotional storytelling, modern American settings (offices, homes, urban spaces, tech environments), film-like quality with professional photography style, atmospheric details (city lights, sunset, fog), layered scenes with depth and texture, ${textInstructions}. Ultra sharp, cinematic, photorealistic.`
      : `${prompt}. ${orientationText} aspect ratio. Clean minimal 3D style: neutral soft background (beige/cream/soft gray), 3-5 simple 3D geometric elements (rounded squares, circles, cylinders) with soft shadows, dark navy or matte black main shapes with white simple icons, warm accent colors (orange, coral, or pastels), gentle diffused lighting, clean composition with breathing room and whitespace, professional depth with subtle 3D perspective, smooth rounded corners on all elements, soft drop shadows, ultra crisp rendering, ${textInstructions}, organized balanced layout. Professional, clean, and approachable look.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: { parts: [{ text: enhancedPrompt }] },
      config: {
        imageConfig: { aspectRatio, imageSize: '1K' },
      },
    });

    for (const candidate of response.candidates || []) {
      for (const part of candidate.content.parts) {
        if (part.inlineData?.data) {
          res.json({ imageData: part.inlineData.data });
          return;
        }
      }
    }

    res.status(500).json({ error: 'No image data in response' });
  } catch (err: any) {
    const msg = err.message || 'Image generation failed';
    const status = msg.includes('403') || msg.includes('PERMISSION_DENIED') ? 403
      : msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') ? 429
      : 500;
    res.status(status).json({ error: msg });
  }
});

export { router as geminiRouter };

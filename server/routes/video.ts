import { Router, Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import { validateVideoRequest } from '../middleware/validation';
import { tmpdir } from 'os';
import { join } from 'path';
import { readFile, unlink } from 'fs/promises';
import { randomUUID } from 'crypto';

const router = Router();

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured on server');
  return new GoogleGenAI({ apiKey });
}

// POST /api/fal/video
router.post('/video', validateVideoRequest, async (req: Request, res: Response) => {
  try {
    const { imageBase64, visualPrompt, aspectRatio = '9:16', isDramatic = false } = req.body;
    const ai = getGeminiClient();

    const prompt = isDramatic
      ? `${visualPrompt}. Dramatic cinematic motion: Slow cinematic camera movement (subtle dolly push or gentle pan), natural human movement (subtle head turn, eye blink, slight body shift), atmospheric elements subtly moving (light rays, fog, background motion), dynamic lighting shifts creating depth and emotion, film-like color grading maintaining warmth and contrast, smooth professional camera work, emotional storytelling through motion, maintain photorealistic quality and depth of field. 4 seconds total.`
      : `${visualPrompt}. Clean minimal 3D animation: Start with neutral soft background, main 3D element gently fades in and settles into place, then progressively reveal 3-4 supporting elements one at a time with smooth fade-in. Subtle gentle camera motion (slight rotation or slow push in), elements smoothly animate into position with soft easing, gentle shadows appear as elements settle. Soft consistent lighting throughout with gentle highlights on 3D shapes. Each element appears with purpose and clean timing. Maintain clean minimal aesthetic with rounded 3D shapes, professional soft shadows, and breathing room between elements. Ultra crisp quality, smooth motion. Maintain neutral background and clean composition from the image. 4 seconds total.`;

    let operation = await ai.models.generateVideos({
      model: 'veo-3.1-fast-generate-preview',
      prompt,
      image: {
        imageBytes: imageBase64,
        mimeType: 'image/jpeg',
      },
      config: {
        aspectRatio,
        durationSeconds: 4,
        numberOfVideos: 1,
        ...(isDramatic && { personGeneration: 'allow_adult' }),
      },
    });

    // Poll until the operation completes
    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      operation = await ai.operations.getVideosOperation({ operation });
    }

    const generatedVideo = operation.response?.generatedVideos?.[0];
    if (!generatedVideo) throw new Error('No video generated');

    const tempPath = join(tmpdir(), `veo-${randomUUID()}.mp4`);
    try {
      await ai.files.download({ file: generatedVideo, downloadPath: tempPath });
      const videoBuffer = await readFile(tempPath);
      const videoBase64 = videoBuffer.toString('base64');
      res.json({ videoUrl: `data:video/mp4;base64,${videoBase64}` });
    } finally {
      await unlink(tempPath).catch(() => {});
    }
  } catch (err: any) {
    const msg = err.message || 'Unknown error';
    const status = msg.includes('403') || msg.includes('PERMISSION_DENIED') ? 403
      : msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') ? 429
      : 500;
    res.status(status).json({ error: `Video generation failed: ${msg}` });
  }
});

export { router as videoRouter };

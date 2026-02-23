import { Router, Request, Response } from 'express';
import { fal } from '@fal-ai/client';
import { validateVideoRequest } from '../middleware/validation';

const router = Router();

let falConfigured = false;

function initFal() {
  if (falConfigured) return;
  const key = process.env.FAL_API_KEY;
  if (!key) throw new Error('FAL_API_KEY not configured on server');
  fal.config({ credentials: key });
  falConfigured = true;
}

// POST /api/fal/video
router.post('/video', validateVideoRequest, async (req: Request, res: Response) => {
  try {
    initFal();
    const { imageBase64, visualPrompt, aspectRatio = '9:16', isDramatic = false } = req.body;

    // Convert base64 to buffer then to File for upload
    const imageBuffer = Buffer.from(imageBase64, 'base64');
    const imageFile = new File([imageBuffer], 'image.jpg', { type: 'image/jpeg' });

    const imageUrl = await fal.storage.upload(imageFile);

    const prompt = isDramatic
      ? `${visualPrompt}. Dramatic cinematic motion: Slow cinematic camera movement (subtle dolly push or gentle pan), natural human movement (subtle head turn, eye blink, slight body shift), atmospheric elements subtly moving (light rays, fog, background motion), dynamic lighting shifts creating depth and emotion, film-like color grading maintaining warmth and contrast, smooth professional camera work, emotional storytelling through motion, maintain photorealistic quality and depth of field. 4 seconds total.`
      : `${visualPrompt}. Clean minimal 3D animation: Start with neutral soft background, main 3D element gently fades in and settles into place, then progressively reveal 3-4 supporting elements one at a time with smooth fade-in. Subtle gentle camera motion (slight rotation or slow push in), elements smoothly animate into position with soft easing, gentle shadows appear as elements settle. Soft consistent lighting throughout with gentle highlights on 3D shapes. Each element appears with purpose and clean timing. Maintain clean minimal aesthetic with rounded 3D shapes, professional soft shadows, and breathing room between elements. Ultra crisp quality, smooth motion. Maintain neutral background and clean composition from the image. 4 seconds total.`;

    const result: any = await fal.subscribe('fal-ai/veo3.1/fast/image-to-video', {
      input: {
        prompt,
        image_url: imageUrl,
        duration: '4s',
        aspect_ratio: aspectRatio,
        generate_audio: false,
        resolution: '720p',
      },
      logs: true,
    });

    if (result.data?.video?.url) {
      res.json({ videoUrl: result.data.video.url });
    } else {
      res.status(500).json({ error: 'No video URL returned from Fal AI' });
    }
  } catch (err: any) {
    let errorMsg = err.message || 'Unknown error';
    if (err.body) {
      try {
        const body = typeof err.body === 'string' ? JSON.parse(err.body) : err.body;
        if (body.message) errorMsg = body.message;
      } catch (_) { /* ignore */ }
    }
    res.status(500).json({ error: `Video generation failed: ${errorMsg}` });
  }
});

export { router as falRouter };

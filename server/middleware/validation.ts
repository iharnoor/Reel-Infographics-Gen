import { Request, Response, NextFunction } from 'express';

const MAX_SCRIPT_LENGTH = 10_000;
const MAX_PROMPT_LENGTH = 2_000;
const VALID_ASPECT_RATIOS = ['9:16', '16:9'];

export function validateAnalyzeRequest(req: Request, res: Response, next: NextFunction) {
  const { script, aspectRatio, isDramatic } = req.body;

  if (!script || typeof script !== 'string') {
    res.status(400).json({ error: 'Script is required and must be a string.' });
    return;
  }
  if (script.length > MAX_SCRIPT_LENGTH) {
    res.status(400).json({ error: `Script exceeds maximum length of ${MAX_SCRIPT_LENGTH} characters.` });
    return;
  }
  if (aspectRatio && !VALID_ASPECT_RATIOS.includes(aspectRatio)) {
    res.status(400).json({ error: 'Invalid aspect ratio.' });
    return;
  }
  if (isDramatic !== undefined && typeof isDramatic !== 'boolean') {
    res.status(400).json({ error: 'isDramatic must be a boolean.' });
    return;
  }

  req.body.script = script.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  next();
}

export function validateImageRequest(req: Request, res: Response, next: NextFunction) {
  const { prompt, aspectRatio, isDramatic } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    res.status(400).json({ error: 'Prompt is required.' });
    return;
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    res.status(400).json({ error: `Prompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters.` });
    return;
  }
  if (aspectRatio && !VALID_ASPECT_RATIOS.includes(aspectRatio)) {
    res.status(400).json({ error: 'Invalid aspect ratio.' });
    return;
  }
  if (isDramatic !== undefined && typeof isDramatic !== 'boolean') {
    res.status(400).json({ error: 'isDramatic must be a boolean.' });
    return;
  }

  next();
}

export function validateVideoRequest(req: Request, res: Response, next: NextFunction) {
  const { imageBase64, visualPrompt, aspectRatio, isDramatic } = req.body;

  if (!imageBase64 || typeof imageBase64 !== 'string') {
    res.status(400).json({ error: 'imageBase64 is required.' });
    return;
  }
  if (!/^[A-Za-z0-9+/=]+$/.test(imageBase64.slice(0, 100))) {
    res.status(400).json({ error: 'Invalid base64 image data.' });
    return;
  }
  if (!visualPrompt || typeof visualPrompt !== 'string' || visualPrompt.length > MAX_PROMPT_LENGTH) {
    res.status(400).json({ error: 'Valid visualPrompt is required (max 2000 chars).' });
    return;
  }
  if (aspectRatio && !VALID_ASPECT_RATIOS.includes(aspectRatio)) {
    res.status(400).json({ error: 'Invalid aspect ratio.' });
    return;
  }
  if (isDramatic !== undefined && typeof isDramatic !== 'boolean') {
    res.status(400).json({ error: 'isDramatic must be a boolean.' });
    return;
  }

  next();
}

export function validateGeminiStoryboardResponse(data: any): { title: string; scenes: Array<{ text: string; visualPrompt: string }> } {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid response structure');
  }

  const title = typeof data.title === 'string' ? data.title.slice(0, 200) : 'Untitled';

  if (!Array.isArray(data.scenes) || data.scenes.length === 0) {
    throw new Error('No scenes in response');
  }
  if (data.scenes.length > 50) {
    throw new Error('Too many scenes in response');
  }

  const scenes = data.scenes.map((s: any) => {
    if (!s || typeof s.text !== 'string' || typeof s.visualPrompt !== 'string') {
      throw new Error('Invalid scene structure');
    }
    return {
      text: s.text.slice(0, 1000),
      visualPrompt: s.visualPrompt.slice(0, 2000),
    };
  });

  return { title, scenes };
}

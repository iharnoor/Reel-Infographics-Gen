# Reel Infographics Generator

Generate stunning videos and images using FAL.ai's Kling video generation and FLUX image models.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure your FAL API key:
The `.env` file is already configured with your API key:
```
FAL_KEY=4c332fb1-37a2-4f9a-909c-a93f07cab59f:e16e2e516ed3d088bc4039d5d9246586
```

## Usage

### Generate Kling Videos

Run the video generation script:
```bash
npm run generate
```

Or use node directly with custom prompts:
```bash
node generate-video.js
```

### Generate FLUX Images

```bash
node index.js "Your prompt here" image
```

### Generate Videos with Custom Prompts

```bash
node index.js "Your video prompt" video
```

## API Endpoints

### Kling Video Generation
- **Model**: `fal-ai/kling-video/v1/standard/text-to-video`
- **Options**:
  - `prompt`: Text description of the video
  - `duration`: "5" or "10" (seconds)
  - `aspect_ratio`: "16:9", "9:16", "1:1"

### FLUX Image Generation
- **Model**: `fal-ai/flux-2-flex`
- **Options**:
  - `prompt`: Text description of the image
  - `num_images`: Number of images to generate

## Troubleshooting

### Videos Not Generating?

Common issues and solutions:

1. **Authentication Error (401)**
   - Verify FAL_KEY is correct in `.env`
   - Ensure `.env` file is in the project root
   - Check that dotenv is properly loading

2. **Bad Request (400)**
   - Check prompt format
   - Verify duration is "5" or "10" (string, not number)
   - Ensure aspect_ratio is valid

3. **Rate Limit (429)**
   - Wait before retrying
   - Consider upgrading FAL.ai plan

4. **Model Not Found**
   - Verify the model name: `fal-ai/kling-video/v1/standard/text-to-video`
   - Check FAL.ai documentation for model availability

## Example Output

The scripts will output:
- Real-time generation logs
- Video/Image URL when complete
- Request ID for tracking
- Full result data

## Files

- `generate-video.js` - Dedicated Kling video generation script
- `index.js` - Combined image/video generation with CLI
- `.env` - API key configuration
- `package.json` - Dependencies and scripts

## Built with

- [FAL.ai](https://fal.ai/) - AI model inference platform
- Kling Video - Text-to-video generation
- FLUX 2 - High-quality image generation

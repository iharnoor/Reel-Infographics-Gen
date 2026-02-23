<div align="center">
</div>

# Reel Infographics Generator

Transform text scripts into stunning animated infographic videos using AI. This tool leverages Google's Gemini AI to analyze your script, generate visually appealing scenes, and create professional video content optimized for social media platforms.

<div align="center">
<img src="Example infographic.png" alt="Example generated infographic scene" width="300" />
<p><em>Example scene generated in minimal 3D mode (9:16)</em></p>
</div>

## Features

- **AI-Powered Scene Generation**: Automatically breaks down scripts into visual scenes using Gemini AI
- **Dual Aspect Ratio Support**: Create videos in both 9:16 (vertical/stories) and 16:9 (horizontal/landscape) formats
- **Dramatic Visual Effects**: Optional cinematic mode with dramatic lighting, South Asian American subjects, and film-like quality
- **Parallel Processing**: Efficient concurrent scene generation (3 parallel workers) for faster video creation
- **Video Export**: Export complete videos with smooth transitions using client-side FFmpeg WASM
- **Batch Download**: Download all generated scenes as images in a ZIP archive
- **Interactive Player**: Preview and play through your generated scenes with word-by-word text reveal

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     Browser (Client)                         │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │   App.tsx     │  │  Player.tsx  │  │  FFmpeg WASM      │  │
│  │  (Orchestration)│  │ (Playback)  │  │  (Video Stitch)   │  │
│  └──────┬───────┘  └──────────────┘  └───────────────────┘  │
│         │                                                    │
│  ┌──────┴───────┐                                            │
│  │geminiService  │  ← HTTP client, calls /api/* endpoints    │
│  │  (Frontend)   │    No API keys, no direct external calls  │
│  └──────┬───────┘                                            │
└─────────┼────────────────────────────────────────────────────┘
          │ fetch(/api/*)
          │
┌─────────┼────────────────────────────────────────────────────┐
│         ▼            Express Server (Port 3001)              │
│                                                              │
│  ┌─────────────┐  ┌─────────────────┐  ┌────────────────┐   │
│  │  Rate Limit  │  │ Input Validation │  │  CORS Policy   │   │
│  │  (30 req/min)│  │ (size, type, fmt)│  │ (localhost only)│   │
│  └──────┬──────┘  └────────┬────────┘  └────────────────┘   │
│         │                  │                                  │
│  ┌──────┴──────────────────┴──────────────────────────┐      │
│  │                   API Routes                        │      │
│  │  POST /api/gemini/analyze  → Gemini 2.5 Flash      │      │
│  │  POST /api/gemini/image    → Gemini 3 Pro Image    │      │
│  │  POST /api/fal/video       → Fal.ai Veo 3.1 Fast  │      │
│  │  GET  /api/health          → Server status check    │      │
│  └────────────────────────────────────────────────────┘      │
│                                                              │
│  API Keys: GEMINI_API_KEY, FAL_API_KEY (from .env, server    │
│  only — never sent to the browser)                           │
└──────────────────────────────────────────────────────────────┘
          │                         │
          ▼                         ▼
   Google Gemini API          Fal.ai API
   (Text + Image)             (Video Gen)
```

### Data Flow

1. **Script Input** -> User pastes text into the frontend
2. **Script Analysis** -> Frontend sends script to `POST /api/gemini/analyze` -> Express server calls Gemini 2.5 Flash -> Returns structured scene data (title + scenes with text + visual prompts)
3. **Image Generation** -> For each scene, frontend calls `POST /api/gemini/image` -> Server calls Gemini 3 Pro Image -> Returns base64 PNG
4. **Video Generation** -> Frontend compresses image (Canvas API -> JPEG), sends to `POST /api/fal/video` -> Server uploads to Fal storage, calls Veo 3.1 Fast -> Returns video URL
5. **Video Export** -> Frontend fetches video blobs, stitches with FFmpeg WASM client-side -> Downloads final MP4

### Why Node.js/Express Instead of Python/FastAPI?

We chose Node.js with Express over Python with FastAPI for several reasons:

1. **Shared ecosystem**: The frontend already uses npm, TypeScript, and Node tooling (Vite). Adding Express keeps the entire stack in one language and one package manager. No need for a separate `requirements.txt`, virtual environment, or Python runtime.

2. **Shared type definitions**: TypeScript interfaces for Scene, Storyboard, etc. can be shared between frontend and backend. With Python, you'd duplicate these as Pydantic models.

3. **SDK compatibility**: Both `@google/genai` (Gemini) and `@fal-ai/client` are JavaScript/TypeScript SDKs. Using them server-side in Node.js means zero adapter code. The Python equivalents (`google-generativeai`, `fal-client`) have different APIs and would require rewriting all the prompt-building and response-parsing logic.

4. **Single `npm run dev`**: One command starts both the Vite dev server and the Express backend via `concurrently`. No Docker Compose, no separate terminal windows, no cross-language process management.

5. **Deployment simplicity**: A single Node.js process can serve both the static frontend (via `express.static`) and the API. With Python, you'd need a separate ASGI server (Uvicorn) plus a reverse proxy to serve the frontend.

6. **Developer experience**: For a personal project, minimizing the number of moving parts matters. One language, one runtime, one dependency tree.

FastAPI would be a better choice if this were a larger team project with existing Python ML pipelines, needed async WebSocket support, or required Python-specific libraries. For this use case, Express is the pragmatic choice.

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 19 + TypeScript | UI framework with hooks |
| **Build** | Vite 6 | Dev server, bundler, HMR |
| **Styling** | Tailwind CSS 4 (npm) | Utility-first CSS |
| **Icons** | Lucide React | Icon library |
| **Backend** | Express 5 | API proxy server |
| **AI (Text)** | Google Gemini 2.5 Flash | Script analysis |
| **AI (Image)** | Google Gemini 3 Pro Image | Scene image generation |
| **AI (Video)** | Fal.ai Veo 3.1 Fast | Image-to-video animation |
| **Video** | FFmpeg WASM | Client-side video stitching |
| **Security** | express-rate-limit, CSP, input validation | API protection |

## Security Model

All API keys are stored server-side in `.env` and never exposed to the browser:

- **Backend proxy**: The Express server proxies all Gemini and Fal.ai requests. The frontend only calls `/api/*` endpoints on its own origin.
- **Input validation**: Server validates script length (10k chars), prompt length (2k chars), aspect ratio whitelist, and base64 format before forwarding to external APIs.
- **Rate limiting**: 30 requests per minute per IP address.
- **Content Security Policy**: Restricts script sources to `'self'`, limits media/connect sources to known domains.
- **URL validation**: Frontend validates video URLs against an allowlist before `fetch()` or `window.open()`.
- **No console data leaks**: Console output never includes API keys, raw error objects, or response payloads.

## Prerequisites

- **Node.js** (version 18 or higher)
- **Gemini API Key**: Get from [Google AI Studio](https://aistudio.google.com/apikey) (requires a paid project for image generation)
- **Fal.ai API Key**: Get from [Fal.ai Dashboard](https://fal.ai/dashboard/keys)

## Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd Reel-Infographics-Gen
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up your API keys in `.env`:
   ```
   GEMINI_API_KEY=your_gemini_key_here
   FAL_API_KEY=your_fal_key_here
   ```

4. Start the development server (starts both frontend + backend):
   ```bash
   npm run dev
   ```

   This runs:
   - Vite dev server on `http://localhost:3000` (frontend)
   - Express server on `http://localhost:3001` (API proxy)
   - Vite proxies `/api/*` requests to the Express server automatically

## Usage

1. **Enter Your Script**: Type or paste your text script into the input area (max 10,000 characters)
2. **Configure Settings**:
   - Choose aspect ratio (9:16 for vertical reels or 16:9 for landscape)
   - Toggle cinematic mode for dramatic visual style
3. **Generate Storyboard**: Click to analyze your script and plan scenes
4. **Generate Visuals**: AI creates images for each scene (3 concurrent workers)
5. **Animate**: Generate 4-second videos for each scene using Veo 3.1 Fast
6. **Preview**: Use the interactive player to review your scenes
7. **Export**:
   - Download individual images or videos
   - Download all images as a ZIP file
   - Export as a complete stitched video (FFmpeg)

## Project Structure

```
Reel-Infographics-Gen/
├── App.tsx                       # Main React component (orchestration, state, UI)
├── index.tsx                     # React app entry point
├── index.html                    # HTML shell (CSP, fonts)
├── index.css                     # Global styles (Tailwind import, animations)
├── types.ts                      # TypeScript interfaces (Scene, Storyboard)
├── components/
│   ├── Player.tsx                # Fullscreen video player with word-by-word reveal
│   └── ApiKeyModal.tsx           # Server health check modal
├── services/
│   ├── geminiService.ts          # Frontend HTTP client (calls /api/* endpoints)
│   └── ffmpegService.ts          # FFmpeg WASM loader + video stitcher
├── server/
│   ├── index.ts                  # Express app entry point
│   ├── routes/
│   │   ├── gemini.ts             # Gemini API proxy (analyze + image)
│   │   └── fal.ts                # Fal.ai API proxy (video generation)
│   └── middleware/
│       ├── validation.ts         # Input validation + response sanitization
│       └── rateLimit.ts          # Rate limiting (30 req/min)
├── .env                          # API keys (git-ignored)
├── .gitignore
├── package.json
├── postcss.config.js             # Tailwind CSS + Autoprefixer
├── tsconfig.json
└── vite.config.ts                # Vite config (dev proxy to Express)
```

## Scripts

| Command | Description |
|---------|------------|
| `npm run dev` | Start both frontend (Vite) and backend (Express) |
| `npm run dev:client` | Start frontend only |
| `npm run dev:server` | Start backend only |
| `npm run build` | Build frontend for production |
| `npm run preview` | Preview production build |
| `npm start:server` | Start backend in production mode |

## Build for Production

```bash
npm run build
```

The optimized production build will be in the `dist` directory. In production, configure your web server to proxy `/api/*` to the Express backend, or use `express.static` to serve the built frontend from the same process.

## License

This project is private and not licensed for public use.

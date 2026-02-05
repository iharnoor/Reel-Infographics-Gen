<div align="center">
</div>

# Reel Infographics Generator

Transform text scripts into stunning animated infographic videos using AI. This tool leverages Google's Gemini AI to analyze your script, generate visually appealing scenes, and create professional video content optimized for social media platforms.

## Features

- **AI-Powered Scene Generation**: Automatically breaks down scripts into visual scenes using Gemini AI
- **Dual Aspect Ratio Support**: Create videos in both 9:16 (vertical/stories) and 16:9 (horizontal/landscape) formats
- **Dramatic Visual Effects**: Optional dramatic mode with enhanced lighting, shadows, and particle effects
- **Parallel Processing**: Efficient concurrent scene generation for faster video creation
- **Video Export**: Export complete videos with smooth transitions using FFmpeg
- **Batch Download**: Download all generated scenes as images in a ZIP archive
- **Interactive Player**: Preview and play through your generated scenes before exporting

## Technology Stack

- **React 19**: Modern UI framework with latest features
- **TypeScript**: Type-safe development
- **Vite**: Fast build tool and development server
- **Google Gemini AI**: Advanced text analysis and image generation
- **FFmpeg**: Video processing and export
- **Fal.ai**: Image generation API
- **Lucide React**: Beautiful icon library

## Prerequisites

- **Node.js** (version 16 or higher)
- **Gemini API Key**: Requires a paid project API key for image generation features

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

3. Set up your API key:
   - Create a `.env.local` file in the root directory
   - Add your Gemini API key:
     ```
     GEMINI_API_KEY=your_api_key_here
     ```

4. Start the development server:
   ```bash
   npm run dev
   ```

## Usage

1. **Enter Your Script**: Type or paste your text script into the input area
2. **Configure Settings**:
   - Choose aspect ratio (9:16 for vertical reels or 16:9 for landscape)
   - Toggle dramatic effects for enhanced visual style
3. **Generate Storyboard**: Click to analyze your script and plan scenes
4. **Generate Visuals**: AI will create images for each scene in parallel
5. **Preview**: Use the interactive player to review your scenes
6. **Export**:
   - Download individual scenes as a ZIP file
   - Export as a complete video with transitions

## Project Structure

```
Reel-Infographics-Gen/
├── App.tsx                 # Main application component
├── index.tsx              # Application entry point
├── components/
│   ├── Player.tsx         # Video player component
│   └── ApiKeyModal.tsx    # API key configuration modal
├── services/
│   └── geminiService.ts   # Gemini AI integration
├── types/                 # TypeScript type definitions
├── package.json          # Project dependencies
└── vite.config.ts        # Vite configuration
```

## Build for Production

```bash
npm run build
```

The optimized production build will be in the `dist` directory.

## Preview Production Build

```bash
npm run preview
```

## License

This project is private and not licensed for public use.

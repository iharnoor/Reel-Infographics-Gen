import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpegInstance: FFmpeg | null = null;
let isLoaded = false;

/**
 * Load FFmpeg instance (singleton pattern)
 * Loads WASM files from CDN on first call
 */
export async function loadFFmpeg(onProgress?: (progress: number) => void): Promise<FFmpeg> {
  if (ffmpegInstance && isLoaded) {
    return ffmpegInstance;
  }

  ffmpegInstance = new FFmpeg();

  ffmpegInstance.on('log', ({ message }) => {
    console.log('[FFmpeg]', message);
  });

  // Load WASM from CDN
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
  await ffmpegInstance.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  isLoaded = true;
  onProgress?.(1);
  return ffmpegInstance;
}

/**
 * Stitch multiple video blobs into one MP4
 * Uses concat demuxer for fast stitching, falls back to re-encode if needed
 */
export async function stitchVideos(
  videoBlobs: Blob[],
  onProgress?: (message: string, percent: number) => void
): Promise<Blob> {
  const ffmpeg = await loadFFmpeg();
  const fileNames: string[] = [];

  try {
    // Write videos to virtual FS
    onProgress?.('Writing videos to memory...', 0);
    for (let i = 0; i < videoBlobs.length; i++) {
      const fileName = `input${i}.mp4`;
      fileNames.push(fileName);
      await ffmpeg.writeFile(fileName, await fetchFile(videoBlobs[i]));
      onProgress?.(
        `Processing video ${i + 1}/${videoBlobs.length}...`,
        (i / videoBlobs.length) * 30
      );
    }

    // Create concat file list
    onProgress?.('Preparing stitch list...', 30);
    const concatList = videoBlobs.map((_, i) => `file 'input${i}.mp4'`).join('\n');
    await ffmpeg.writeFile('concat_list.txt', concatList);

    // Stitch videos
    onProgress?.('Stitching videos together...', 35);

    try {
      // Try fast concat (no re-encode)
      await ffmpeg.exec([
        '-f', 'concat',
        '-safe', '0',
        '-i', 'concat_list.txt',
        '-c', 'copy',
        'output.mp4'
      ]);
      onProgress?.('Videos stitched successfully!', 95);
    } catch (err) {
      // Fallback: Re-encode (slower but more reliable)
      console.warn('Concat failed, re-encoding...', err);

      const inputs = videoBlobs.flatMap((_, i) => ['-i', `input${i}.mp4`]);
      const filterComplex = videoBlobs
        .map((_, i) => `[${i}:v]`)
        .join('') + `concat=n=${videoBlobs.length}:v=1:a=0[outv]`;

      await ffmpeg.exec([
        ...inputs,
        '-filter_complex', filterComplex,
        '-map', '[outv]',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        'output.mp4'
      ]);
      onProgress?.('Videos re-encoded and stitched!', 95);
    }

    // Read output
    onProgress?.('Reading final video...', 97);
    const data = await ffmpeg.readFile('output.mp4');
    const blob = new Blob([data], { type: 'video/mp4' });

    // Cleanup
    onProgress?.('Cleaning up...', 99);
    await cleanupFiles(ffmpeg, [...fileNames, 'concat_list.txt', 'output.mp4']);

    return blob;

  } catch (error: any) {
    await cleanupFiles(ffmpeg, [...fileNames, 'concat_list.txt', 'output.mp4']);
    throw new Error(`FFmpeg stitching failed: ${error.message}`);
  }
}

/**
 * Clean up virtual filesystem
 */
async function cleanupFiles(ffmpeg: FFmpeg, fileNames: string[]): Promise<void> {
  for (const fileName of fileNames) {
    try {
      await ffmpeg.deleteFile(fileName);
    } catch (err) {
      console.warn(`Failed to delete ${fileName}:`, err);
    }
  }
}

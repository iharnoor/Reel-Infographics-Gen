import { fal } from "@fal-ai/client";
import dotenv from "dotenv";

dotenv.config();

// Configure FAL client with API key
fal.config({
  credentials: process.env.FAL_KEY
});

export async function generateImage(prompt, options = {}) {
  try {
    console.log("Generating image with FLUX...");

    const result = await fal.subscribe("fal-ai/flux-2-flex", {
      input: {
        prompt: prompt,
        num_images: options.numImages || 1,
        ...options
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === "IN_PROGRESS") {
          update.logs?.map((log) => log.message).forEach(console.log);
        }
      },
    });

    console.log("Image generated successfully!");
    console.log("Request ID:", result.requestId);
    return result.data;
  } catch (error) {
    console.error("Error generating image:", error.message);
    throw error;
  }
}

export async function generateKlingVideo(prompt, options = {}) {
  try {
    console.log("Generating Kling video...");

    const result = await fal.subscribe("fal-ai/kling-video/v1/standard/text-to-video", {
      input: {
        prompt: prompt,
        duration: options.duration || "5",
        aspect_ratio: options.aspectRatio || "16:9",
        ...options
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === "IN_PROGRESS") {
          console.log("Processing video...");
          update.logs?.map((log) => log.message).forEach(console.log);
        }
      },
    });

    console.log("Video generated successfully!");
    console.log("Request ID:", result.requestId);
    return result.data;
  } catch (error) {
    console.error("Error generating video:", error.message);
    throw error;
  }
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const prompt = process.argv[2] || "A serene mountain landscape at sunset";
  const type = process.argv[3] || "image";

  if (type === "video") {
    generateKlingVideo(prompt).then(console.log).catch(console.error);
  } else {
    generateImage(prompt).then(console.log).catch(console.error);
  }
}

import { fal } from "@fal-ai/client";
import dotenv from "dotenv";

dotenv.config();

// Configure FAL client with API key
fal.config({
  credentials: process.env.FAL_KEY
});

async function generateKlingVideo(prompt, options = {}) {
  try {
    console.log("Starting Kling video generation...");
    console.log("Prompt:", prompt);

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
          console.log("Status: IN_PROGRESS");
          if (update.logs) {
            update.logs.map((log) => log.message).forEach(console.log);
          }
        } else if (update.status === "COMPLETED") {
          console.log("Status: COMPLETED");
        }
      },
    });

    console.log("\n=== Generation Complete ===");
    console.log("Video URL:", result.data.video?.url);
    console.log("Request ID:", result.requestId);
    console.log("Full result:", JSON.stringify(result.data, null, 2));

    return result;
  } catch (error) {
    console.error("\n=== Error Generating Video ===");
    console.error("Error type:", error.name);
    console.error("Error message:", error.message);

    if (error.body) {
      console.error("Error details:", JSON.stringify(error.body, null, 2));
    }

    if (error.status === 401) {
      console.error("\nAuthentication failed. Please check your FAL_KEY in .env file");
    } else if (error.status === 400) {
      console.error("\nBad request. Please check your prompt and options");
    } else if (error.status === 429) {
      console.error("\nRate limit exceeded. Please wait before trying again");
    }

    throw error;
  }
}

// Example usage
const examplePrompt = "A high-quality 3D render of a cute fluffy monster eating a giant donut; the fur simulation is incredibly detailed, the donut glaze is sticky and reflective, bright daylight lighting, shallow depth of field.";

generateKlingVideo(examplePrompt, {
  duration: "5",
  aspectRatio: "16:9"
});

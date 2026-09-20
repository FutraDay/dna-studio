import type { ImageProvider } from "./types";

export type ImageProviderType = "openai" | "stability" | "replicate" | "gemini" | "comfyui";

let cached: ImageProvider | null = null;
let cachedKey: string | null = null;

export async function getImageProvider(): Promise<ImageProvider> {
  let providerType: string;
  let apiKey: string | undefined;
  let comfyUrl: string | undefined;

  try {
    const { resolveSettings } = await import("@/lib/settings/resolve");
    const settings = await resolveSettings();
    providerType = settings.imageProvider;
    apiKey = settings.imageApiKey || undefined;
    comfyUrl = settings.comfyUrl || undefined;
  } catch {
    const localOnly = /^(?:1|true|yes)$/i.test(process.env.LOCAL_IMAGE_ONLY || "");
    providerType = localOnly ? "comfyui" : process.env.IMAGE_PROVIDER || "openai";
    comfyUrl = process.env.COMFYUI_BASE_URL || undefined;
  }

  const cacheKey = `${providerType}:${providerType === "comfyui" ? comfyUrl || "default" : apiKey || "env"}`;
  if (cached && cachedKey === cacheKey) return cached;

  switch (providerType) {
    case "openai": {
      const { OpenAIImageProvider } = await import("./providers/openai");
      cached = new OpenAIImageProvider(apiKey);
      break;
    }
    case "stability": {
      const { StabilityProvider } = await import("./providers/stability");
      cached = new StabilityProvider(apiKey);
      break;
    }
    case "replicate": {
      const { ReplicateProvider } = await import("./providers/replicate");
      cached = new ReplicateProvider(apiKey);
      break;
    }
    case "gemini": {
      const { GeminiImageProvider } = await import("./providers/gemini");
      cached = new GeminiImageProvider(apiKey);
      break;
    }
    case "comfyui": {
      const { ComfyUIProvider } = await import("./providers/comfyui");
      cached = new ComfyUIProvider(comfyUrl);
      break;
    }
    default:
      throw new Error(`Unknown image provider: ${providerType}`);
  }

  cachedKey = cacheKey;
  return cached!;
}

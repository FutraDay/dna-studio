import type {
  ImageGenerateOptions,
  ImageGenerateResult,
  ImageProvider,
  ImageSize,
} from "../types";

const DEFAULT_BASE_URL = "http://localhost:8188";
const GENERATION_TIMEOUT_MS = 180_000;
const POLL_INTERVAL_MS = 500;

const LOCAL_DIMENSIONS: Record<ImageSize, { width: number; height: number }> = {
  "1024x1024": { width: 768, height: 768 },
  "1024x1792": { width: 576, height: 1024 },
  "1792x1024": { width: 1024, height: 576 },
};

type ComfyImage = {
  filename: string;
  subfolder?: string;
  type?: string;
};

type ComfyHistory = Record<
  string,
  {
    outputs?: Record<string, { images?: ComfyImage[] }>;
    status?: { status_str?: string };
  }
>;

function baseOrigin(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("ComfyUI base URL is invalid.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("ComfyUI base URL must use http:// or https://.");
  }
  return parsed.origin;
}

function proxyUrl(image: ComfyImage): string {
  const params = new URLSearchParams({
    filename: image.filename,
    subfolder: image.subfolder || "",
    type: image.type || "output",
  });
  return `/api/images/comfyui?${params.toString()}`;
}

export class ComfyUIProvider implements ImageProvider {
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseOrigin(baseUrl || process.env.COMFYUI_BASE_URL || DEFAULT_BASE_URL);
  }

  private async checkpointName(): Promise<string> {
    const response = await fetch(`${this.baseUrl}/object_info/CheckpointLoaderSimple`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`ComfyUI checkpoint lookup failed (${response.status}).`);
    }

    const data = (await response.json()) as {
      CheckpointLoaderSimple?: {
        input?: { required?: { ckpt_name?: [string[]] } };
      };
    };
    const available = data.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] || [];
    if (available.length === 0) {
      throw new Error("ComfyUI has no checkpoint models installed.");
    }

    const configured = process.env.COMFYUI_CHECKPOINT?.trim();
    if (configured) {
      if (!available.includes(configured)) {
        throw new Error(`Configured ComfyUI checkpoint is not installed: ${configured}`);
      }
      return configured;
    }

    return available.includes("DreamShaper_8_pruned.safetensors")
      ? "DreamShaper_8_pruned.safetensors"
      : available[0];
  }

  async generate(
    prompt: string,
    options?: ImageGenerateOptions
  ): Promise<ImageGenerateResult> {
    const size = options?.size ?? "1024x1024";
    const { width, height } = LOCAL_DIMENSIONS[size];
    const checkpoint = await this.checkpointName();
    const seed = Math.floor(Math.random() * 2_147_483_647);

    const workflow = {
      "1": {
        class_type: "CheckpointLoaderSimple",
        inputs: { ckpt_name: checkpoint },
      },
      "2": {
        class_type: "CLIPTextEncode",
        inputs: { text: prompt, clip: ["1", 1] },
      },
      "3": {
        class_type: "CLIPTextEncode",
        inputs: {
          text: "readable text, letters, numbers, words, watermark, logo, signature, chart, graph, infographic, dashboard, flowchart, diagram, fake UI, interface text, sci-fi HUD, robot, cyborg, blurry, distorted, malformed, low quality, low resolution, duplicate people, extra fingers, bad hands",
          clip: ["1", 1],
        },
      },
      "4": {
        class_type: "EmptyLatentImage",
        inputs: { width, height, batch_size: 1 },
      },
      "5": {
        class_type: "KSampler",
        inputs: {
          seed,
          steps: 20,
          cfg: 6.5,
          sampler_name: "dpmpp_2m",
          scheduler: "karras",
          denoise: 1,
          model: ["1", 0],
          positive: ["2", 0],
          negative: ["3", 0],
          latent_image: ["4", 0],
        },
      },
      "6": {
        class_type: "VAEDecode",
        inputs: { samples: ["5", 0], vae: ["1", 2] },
      },
      "7": {
        class_type: "SaveImage",
        inputs: { filename_prefix: "DNAStudio", images: ["6", 0] },
      },
    };

    const queued = await fetch(`${this.baseUrl}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: workflow }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!queued.ok) {
      const detail = (await queued.text()).slice(0, 500);
      throw new Error(`ComfyUI rejected the workflow (${queued.status}): ${detail}`);
    }

    const { prompt_id: promptId } = (await queued.json()) as { prompt_id?: string };
    if (!promptId) throw new Error("ComfyUI did not return a prompt id.");

    const deadline = Date.now() + GENERATION_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      const historyResponse = await fetch(`${this.baseUrl}/history/${encodeURIComponent(promptId)}`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!historyResponse.ok) continue;

      const history = (await historyResponse.json()) as ComfyHistory;
      const entry = history[promptId];
      if (!entry) continue;
      if (entry.status?.status_str === "error") {
        throw new Error("ComfyUI reported an image-generation error.");
      }

      for (const output of Object.values(entry.outputs || {})) {
        const image = output.images?.[0];
        if (image?.filename) return { url: proxyUrl(image) };
      }
    }

    throw new Error("ComfyUI image generation timed out.");
  }
}
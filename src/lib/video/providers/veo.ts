import type {
  VideoProvider,
  VideoAvatar,
  VideoGenerateOptions,
  VideoGenerateResult,
} from "../types";
import { prisma } from "@/lib/db";

const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta";

export class VeoProvider implements VideoProvider {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.GOOGLE_API_KEY || "";
  }

  private headers() {
    return {
      "x-goog-api-key": this.apiKey,
      "Content-Type": "application/json",
    };
  }

  async listAvatars(): Promise<VideoAvatar[]> {
    // Load characters from the database
    try {
      const characters = await prisma.uGCCharacter.findMany({
        where: { active: true },
        orderBy: { sortOrder: "asc" },
      });

      return characters.map((c) => ({
        id: c.id,
        name: c.name,
        thumbnailUrl: c.previewVideoUrl || c.thumbnailUrl || "",
        gender: c.gender as "male" | "female",
        style: c.style,
      }));
    } catch {
      return [];
    }
  }

  async generate(options: VideoGenerateOptions): Promise<VideoGenerateResult> {
    // Look up the character's appearance description for the prompt
    let characterDesc = "";
    try {
      const character = await prisma.uGCCharacter.findUnique({
        where: { id: options.avatarId },
      });
      if (character) {
        characterDesc = character.description;
      }
    } catch {
      // continue without character description
    }

    const aspectRatio =
      options.aspectRatio === "16:9"
        ? "16:9"
        : options.aspectRatio === "1:1"
          ? "16:9" // Veo doesn't support 1:1, use 16:9 and crop
          : "9:16";

    const prompt = this.buildPrompt(characterDesc, options.script);

    const body = {
      instances: [{ prompt }],
      parameters: {
        aspectRatio,
        personGeneration: "allow_all",
      },
    };

    const res = await fetch(
      `${GEMINI_API}/models/veo-3.1-generate-preview:predictLongRunning`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const errMsg = (err as { error?: { message?: string } }).error?.message || `${res.status}`;
      throw new Error(`Veo generation error: ${errMsg}`);
    }

    const data = await res.json();
    const operationName = data.name;

    if (!operationName) {
      throw new Error("Veo did not return an operation name");
    }

    return {
      videoId: operationName, // the operation name IS our video ID for polling
      status: "queued",
    };
  }

  async getStatus(videoId: string): Promise<VideoGenerateResult> {
    const res = await fetch(`${GEMINI_API}/${videoId}`, {
      headers: this.headers(),
    });

    if (!res.ok) {
      throw new Error(`Veo status error: ${res.status}`);
    }

    const data = await res.json();

    if (data.done) {
      const samples = data.response?.generateVideoResponse?.generatedSamples;
      const videoUri = samples?.[0]?.video?.uri;

      if (videoUri) {
        // Download the video through our proxy endpoint to avoid leaking the API key
        // The videoUri is like: https://generativelanguage.googleapis.com/v1beta/files/XXXX
        // We pass just the file ID to our download proxy
        const fileId = videoUri.split("/files/")[1];
        const downloadUrl = `/api/ugc/download?fileId=${encodeURIComponent(fileId)}`;

        return {
          videoId,
          status: "completed",
          videoUrl: downloadUrl,
        };
      }

      return {
        videoId,
        status: "failed",
        error: "Veo completed but returned no video",
      };
    }

    // Still processing
    return {
      videoId,
      status: "processing",
    };
  }

  private buildPrompt(characterDesc: string, script: string): string {
    if (characterDesc) {
      return `UGC-style selfie video of ${characterDesc} talking directly to camera in a casual, authentic way. They are enthusiastically speaking the following script: "${script}". Natural lighting, slight camera movement, genuine expressions, casual setting. Looks like a real social media creator, not a polished ad. The person is animated and engaging.`;
    }

    return `UGC-style selfie video of a person talking directly to camera about a product. They speak naturally and enthusiastically: "${script}". Natural lighting, casual setting, authentic feel like a real creator video on TikTok or Instagram Reels.`;
  }
}


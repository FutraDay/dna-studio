import OpenAI from "openai";
import type {
  ImageProvider,
  ImageGenerateOptions,
  ImageGenerateResult,
} from "../types";

export class OpenAIImageProvider implements ImageProvider {
  private client: OpenAI;

  constructor(apiKey?: string) {
    this.client = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY,
    });
  }

  async generate(
    prompt: string,
    options?: ImageGenerateOptions
  ): Promise<ImageGenerateResult> {
    const requestedSize = options?.size ?? "1024x1024";

    const size =
      requestedSize === "1792x1024"
        ? "1536x1024"
        : requestedSize === "1024x1792"
        ? "1024x1536"
        : "1024x1024";

    const response = await this.client.images.generate({
      model: "gpt-image-2",
      prompt,
      n: 1,
      size,
      quality: "medium",
      output_format: "png",
    });

    const base64 = response.data?.[0]?.b64_json;

    if (!base64) {
      throw new Error("OpenAI did not return image data.");
    }

    return {
      url: `data:image/png;base64,${base64}`,
    };
  }
}

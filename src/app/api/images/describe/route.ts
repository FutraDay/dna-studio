import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { resolveSettings } from "@/lib/settings/resolve";

const schema = z.object({
  imageUrl: z.string().min(1),
});

const SYSTEM_PROMPT =
  "You are a product photography expert. Analyze the product image and provide a highly detailed visual description that can be used to generate new product photography with AI image generators. Describe: the exact product type, shape, dimensions, colors (specific hex-like descriptions), materials, textures, surface finish, branding elements (logos, text, labels), and any distinctive design features. Be extremely specific — the description must be detailed enough to recreate the product visually.";

export async function POST(request: Request) {
  try {
    await requireSession();
    const body = await request.json();
    const { imageUrl } = schema.parse(body);

    const settings = await resolveSettings();
    let description: string;

    switch (settings.llmProvider) {
      case "openai":
        description = await describeWithOpenAI(imageUrl, settings.llmApiKey, settings.llmModel);
        break;
      case "gemini":
        description = await describeWithGemini(imageUrl, settings.llmApiKey, settings.llmModel);
        break;
      case "anthropic":
        description = await describeWithAnthropic(imageUrl, settings.llmApiKey, settings.llmModel);
        break;
      default:
        // Ollama and others — fall back to text-only (no vision)
        description = await describeWithTextOnly();
        break;
    }

    return NextResponse.json({ description });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[Image Describe] Failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to describe image" },
      { status: 500 }
    );
  }
}

/** Parse base64 data URL into media type and raw base64 */
function parseDataUrl(dataUrl: string): { mediaType: string; base64: string } | null {
  const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) return null;
  return { mediaType: match[1], base64: match[2] };
}

async function describeWithOpenAI(imageUrl: string, apiKey: string, model: string): Promise<string> {
  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({ apiKey });

  // Build image content — support both URLs and base64 data URLs
  const imageContent: { type: "image_url"; image_url: { url: string; detail: "high" } } = {
    type: "image_url",
    image_url: { url: imageUrl, detail: "high" },
  };

  const response = await client.chat.completions.create({
    model: model || "gpt-4o",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          imageContent,
          { type: "text", text: "Describe this product in detail for generating professional product photography." },
        ],
      },
    ],
    max_tokens: 800,
    temperature: 0.3,
  });

  return response.choices[0]?.message?.content || "";
}

async function describeWithGemini(imageUrl: string, apiKey: string, model: string): Promise<string> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(apiKey);
  const geminiModel = genAI.getGenerativeModel({ model: model || "gemini-2.0-flash" });

  const parsed = parseDataUrl(imageUrl);
  if (!parsed) throw new Error("Gemini vision requires a base64 image (data URL)");

  const result = await geminiModel.generateContent([
    SYSTEM_PROMPT + "\n\nDescribe this product in detail for generating professional product photography.",
    { inlineData: { mimeType: parsed.mediaType, data: parsed.base64 } },
  ]);

  return result.response.text();
}

async function describeWithAnthropic(imageUrl: string, apiKey: string, model: string): Promise<string> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey });

  const parsed = parseDataUrl(imageUrl);
  // Anthropic supports both base64 and URLs
  const imageBlock = parsed
    ? { type: "image" as const, source: { type: "base64" as const, media_type: parsed.mediaType as "image/png" | "image/jpeg" | "image/gif" | "image/webp", data: parsed.base64 } }
    : { type: "image" as const, source: { type: "url" as const, url: imageUrl } };

  const response = await client.messages.create({
    model: model || "claude-sonnet-4-20250514",
    max_tokens: 800,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          imageBlock,
          { type: "text", text: "Describe this product in detail for generating professional product photography." },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock && "text" in textBlock ? textBlock.text : "";
}

async function describeWithTextOnly(): Promise<string> {
  // Fallback for providers without vision — return a generic prompt
  const { getLLMProvider } = await import("@/lib/llm/client");
  const provider = await getLLMProvider();
  const response = await provider.generate(
    [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `The user uploaded a product image. Since vision is not available with the current LLM provider, please ask them to describe their product in the text field instead. Respond with a short message explaining this.`,
      },
    ],
    { maxTokens: 200, temperature: 0.3 }
  );
  return response.content;
}

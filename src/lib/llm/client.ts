export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

export interface LLMStreamChunk {
  content: string;
  done: boolean;
}

export interface LLMProvider {
  generate(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse>;
  stream(
    messages: LLMMessage[],
    options?: LLMOptions
  ): AsyncGenerator<LLMStreamChunk>;
}

export interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
}

export type ProviderType = "openai" | "anthropic" | "ollama" | "gemini";

let cachedProvider: LLMProvider | null = null;
let cachedCacheKey: string | null = null;

export async function getLLMProvider(): Promise<LLMProvider> {
  // Try to resolve from user settings, fall back to env vars
  let providerType: string;
  let apiKey: string | undefined;
  let model: string | undefined;
  let ollamaUrl: string | undefined;

  try {
    const { resolveSettings } = await import("@/lib/settings/resolve");
    const settings = await resolveSettings();
    providerType = settings.llmProvider;
    apiKey = settings.llmApiKey || undefined;
    model = settings.llmModel || undefined;
    ollamaUrl = settings.ollamaUrl || undefined;
  } catch {
    providerType = process.env.LLM_PROVIDER || "openai";
  }

  // Local development cost guard: when enabled, text generation must never
  // fall through to a paid hosted LLM even if user settings select one.
  if (/^(?:1|true|yes)$/i.test(process.env.LOCAL_LLM_ONLY || "")) {
    providerType = "ollama";
    apiKey = undefined;
    model = process.env.OLLAMA_MODEL || "llama3.1";
    ollamaUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  }

  const cacheKey = `${providerType}:${apiKey || "env"}:${model || "default"}:${ollamaUrl || "default"}`;
  if (cachedProvider && cachedCacheKey === cacheKey) {
    return cachedProvider;
  }

  switch (providerType) {
    case "openai": {
      const { OpenAIProvider } = await import("./providers/openai");
      cachedProvider = new OpenAIProvider(apiKey, model);
      break;
    }
    case "anthropic": {
      const { AnthropicProvider } = await import("./providers/anthropic");
      cachedProvider = new AnthropicProvider(apiKey, model);
      break;
    }
    case "ollama": {
      const { OllamaProvider } = await import("./providers/ollama");
      cachedProvider = new OllamaProvider(ollamaUrl, model);
      break;
    }
    case "gemini": {
      const { GeminiProvider } = await import("./providers/gemini");
      cachedProvider = new GeminiProvider(apiKey, model);
      break;
    }
    default:
      throw new Error(`Unknown LLM provider: ${providerType}`);
  }

  cachedCacheKey = cacheKey;
  return cachedProvider!;
}

export async function generateText(
  messages: LLMMessage[],
  options?: LLMOptions
): Promise<string> {
  const provider = await getLLMProvider();
  const response = await provider.generate(messages, options);
  return response.content;
}

export async function* streamText(
  messages: LLMMessage[],
  options?: LLMOptions
): AsyncGenerator<string> {
  const provider = await getLLMProvider();
  for await (const chunk of provider.stream(messages, options)) {
    yield chunk.content;
  }
}

export async function generateJSON<T>(
  messages: LLMMessage[],
  options?: LLMOptions
): Promise<T> {
  const content = await generateText(messages, {
    ...options,
    json: true,
    temperature: options?.temperature ?? 0,
  });
  // Extract the first JSON object from the response regardless of surrounding text
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error(
      `LLM did not return valid JSON. Response: ${content.slice(0, 300)}`
    );
  }
  return JSON.parse(match[0]) as T;
}

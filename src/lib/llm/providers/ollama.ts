import type {
  LLMProvider,
  LLMMessage,
  LLMResponse,
  LLMStreamChunk,
  LLMOptions,
} from "../client";

export class OllamaProvider implements LLMProvider {
  private baseUrl: string;
  private model: string;

  constructor(baseUrl?: string, model?: string) {
    this.baseUrl = baseUrl || process.env.OLLAMA_BASE_URL || "http://localhost:11434";
    this.model = model || process.env.OLLAMA_MODEL || "llama3.1";
  }

  async generate(
    messages: LLMMessage[],
    options?: LLMOptions
  ): Promise<LLMResponse> {
    // Use Ollama streaming internally even for non-streaming callers. Long local
    // generations can exceed Node/undici's response-headers timeout when
    // stream=false because Ollama sends headers only after inference completes.
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        stream: true,
        options: {
          temperature: options?.temperature ?? 0.7,
          num_predict: options?.maxTokens ?? 4096,
          ...(options?.contextTokens ? { num_ctx: options.contextTokens } : {}),
        },
        ...(options?.json && { format: "json" }),
      }),
    });

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let promptTokens = 0;
    let completionTokens = 0;

    const consume = (line: string) => {
      if (!line.trim()) return;
      const data = JSON.parse(line);
      if (data.message?.content) content += data.message.content;
      if (typeof data.prompt_eval_count === "number") promptTokens = data.prompt_eval_count;
      if (typeof data.eval_count === "number") completionTokens = data.eval_count;
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) consume(line);
    }
    buffer += decoder.decode();
    if (buffer.trim()) consume(buffer);

    return {
      content,
      usage: completionTokens
        ? { promptTokens, completionTokens }
        : undefined,
    };
  }

  async *stream(
    messages: LLMMessage[],
    options?: LLMOptions
  ): AsyncGenerator<LLMStreamChunk> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        stream: true,
        options: {
          temperature: options?.temperature ?? 0.7,
          num_predict: options?.maxTokens ?? 4096,
          ...(options?.contextTokens ? { num_ctx: options.contextTokens } : {}),
        },
        ...(options?.json && { format: "json" }),
      }),
    });

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        const data = JSON.parse(line);
        if (data.message?.content) {
          yield { content: data.message.content, done: data.done || false };
        }
      }
    }
  }
}

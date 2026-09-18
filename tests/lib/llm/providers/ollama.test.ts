import { beforeEach, describe, expect, it, vi } from "vitest";
import { OllamaProvider } from "@/lib/llm/providers/ollama";

const fetchMock = vi.fn();

const streamResponse = (lines: string[]) => {
  const encoder = new TextEncoder();
  let i = 0;
  return {
    body: {
      getReader: () => ({
        read: async () =>
          i < lines.length
            ? { done: false, value: encoder.encode(lines[i++]) }
            : { done: true, value: undefined },
      }),
    },
  };
};

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(
    streamResponse(['{"message":{"content":"hello"},"done":true}\n'])
  );
});

const bodyOf = (call = 0) => JSON.parse(fetchMock.mock.calls[call][1].body);

describe("OllamaProvider", () => {
  it("defaults to the local ollama server and llama3.1", async () => {
    await new OllamaProvider().generate([{ role: "user", content: "hi" }]);

    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:11434/api/chat");
    expect(bodyOf().model).toBe("llama3.1");
  });

  it("uses OLLAMA_BASE_URL and OLLAMA_MODEL when set", async () => {
    vi.stubEnv("OLLAMA_BASE_URL", "http://ollama:11434");
    vi.stubEnv("OLLAMA_MODEL", "mistral");

    await new OllamaProvider().generate([{ role: "user", content: "hi" }]);

    expect(fetchMock.mock.calls[0][0]).toBe("http://ollama:11434/api/chat");
    expect(bodyOf().model).toBe("mistral");
  });

  it("prefers explicit constructor arguments", async () => {
    vi.stubEnv("OLLAMA_BASE_URL", "http://env:11434");
    await new OllamaProvider("http://explicit:11434", "phi").generate([
      { role: "user", content: "hi" },
    ]);

    expect(fetchMock.mock.calls[0][0]).toBe("http://explicit:11434/api/chat");
    expect(bodyOf().model).toBe("phi");
  });

  it("returns the message content", async () => {
    const result = await new OllamaProvider().generate([{ role: "user", content: "hi" }]);
    expect(result.content).toBe("hello");
  });

  it("returns an empty string when ollama sends no message", async () => {
    fetchMock.mockResolvedValue(streamResponse(['{"done":true}\n']));
    const result = await new OllamaProvider().generate([{ role: "user", content: "hi" }]);
    expect(result.content).toBe("");
  });

  it("maps eval counts to token usage", async () => {
    fetchMock.mockResolvedValue(
      streamResponse([
        '{"message":{"content":"hi"},"done":false}\n',
        '{"done":true,"eval_count":7,"prompt_eval_count":3}\n',
      ])
    );
    const result = await new OllamaProvider().generate([{ role: "user", content: "hi" }]);
    expect(result.usage).toEqual({ promptTokens: 3, completionTokens: 7 });
  });

  it("omits usage when ollama reports no eval count", async () => {
    const result = await new OllamaProvider().generate([{ role: "user", content: "hi" }]);
    expect(result.usage).toBeUndefined();
  });

  it("streams internally for a plain generate call to avoid long-response header timeouts", async () => {
    await new OllamaProvider().generate([{ role: "user", content: "hi" }]);
    expect(bodyOf().stream).toBe(true);
  });

  it("maps options onto ollama's option names", async () => {
    await new OllamaProvider().generate([{ role: "user", content: "hi" }], {
      temperature: 0.2,
      maxTokens: 256,
      contextTokens: 16384,
    });
    expect(bodyOf().options).toEqual({
      temperature: 0.2,
      num_predict: 256,
      num_ctx: 16384,
    });
  });

  it("asks for JSON format only when requested", async () => {
    await new OllamaProvider().generate([{ role: "user", content: "hi" }]);
    expect(bodyOf(0).format).toBeUndefined();

    await new OllamaProvider().generate([{ role: "user", content: "hi" }], { json: true });
    expect(bodyOf(1).format).toBe("json");
  });

  it("reassembles streamed generate output and usage across reads", async () => {
    fetchMock.mockResolvedValue(
      streamResponse([
        '{"message":{"content":"Hel',
        'lo"},"done":false}\n{"message":{"content":"!"},"done":true,"eval_count":9,"prompt_eval_count":4}\n',
      ])
    );

    const result = await new OllamaProvider().generate([{ role: "user", content: "hi" }]);
    expect(result).toEqual({
      content: "Hello!",
      usage: { promptTokens: 4, completionTokens: 9 },
    });
  });

  it("yields each streamed line", async () => {
    fetchMock.mockResolvedValue(
      streamResponse([
        '{"message":{"content":"Hel"},"done":false}\n',
        '{"message":{"content":"lo"},"done":true}\n',
      ])
    );

    const chunks = [];
    for await (const chunk of new OllamaProvider().stream([{ role: "user", content: "hi" }])) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      { content: "Hel", done: false },
      { content: "lo", done: true },
    ]);
  });

  it("reassembles a JSON object split across two reads", async () => {
    fetchMock.mockResolvedValue(
      streamResponse(['{"message":{"content":"Hel', 'lo"},"done":true}\n'])
    );

    const chunks = [];
    for await (const chunk of new OllamaProvider().stream([{ role: "user", content: "hi" }])) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([{ content: "Hello", done: true }]);
  });

  it("throws when the response has no body to read", async () => {
    fetchMock.mockResolvedValue({ body: null });

    const iterator = new OllamaProvider().stream([{ role: "user", content: "hi" }]);
    await expect(iterator.next()).rejects.toThrow("No response body");
  });
});

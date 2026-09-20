import { readFileSync } from "node:fs";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { PROVIDERS, providersOfKind, findProvider } from "@/lib/providers/registry";

describe("provider registry", () => {
  it("covers every provider the clients support", () => {
    expect(providersOfKind("llm").map((p) => p.id).sort()).toEqual(
      ["anthropic", "gemini", "ollama", "openai"]
    );
    expect(providersOfKind("image").map((p) => p.id).sort()).toEqual(
      ["comfyui", "gemini", "openai", "replicate", "stability"]
    );
    expect(providersOfKind("video").map((p) => p.id).sort()).toEqual(
      ["did", "heygen", "veo"]
    );
  });

  it("gives every provider an id unique within its kind", () => {
    for (const kind of ["llm", "image", "video"] as const) {
      const ids = providersOfKind(kind).map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  // This is the check that would have caught video generation going missing.
  it("documents every environment variable it references in .env.example", () => {
    const envExample = readFileSync(".env.example", "utf8");
    const missing = PROVIDERS
      .map((p) => p.credential.envVar)
      .filter((v): v is string => Boolean(v))
      .filter((v) => !envExample.includes(v));
    expect(missing).toEqual([]);
  });

  it("routes hosted providers to keys and local providers to URLs", () => {
    expect(
      providersOfKind("image")
        .filter((p) => p.id !== "comfyui")
        .every((p) => p.credential.field === "imageApiKey")
    ).toBe(true);
    expect(findProvider("image", "comfyui")?.credential.field).toBe("comfyUrl");
    expect(providersOfKind("video").every((p) => p.credential.field === "videoApiKey")).toBe(true);
  });

  it("gives ComfyUI a local URL credential and no API key", () => {
    const comfy = findProvider("image", "comfyui")!;
    expect(comfy.credential.type).toBe("url");
    expect(comfy.credential.field).toBe("comfyUrl");
    expect(comfy.credential.envVar).toBe("COMFYUI_BASE_URL");
  });

  it("gives ollama a url credential and no api key", () => {
    const ollama = findProvider("llm", "ollama")!;
    expect(ollama.credential.type).toBe("url");
    expect(ollama.credential.field).toBe("ollamaUrl");
    expect(ollama.credential.envVar).toBe("OLLAMA_BASE_URL");
  });

  it("returns undefined for an unknown provider", () => {
    expect(findProvider("llm", "hal9000")).toBeUndefined();
  });

  it("gives every provider a label, model label and placeholder", () => {
    for (const p of PROVIDERS) {
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.modelLabel.length).toBeGreaterThan(0);
      expect(p.credential.placeholder.length).toBeGreaterThan(0);
    }
  });
});

describe("provider test()", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  it("resolves when the provider accepts the key", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    await expect(findProvider("llm", "openai")!.test("sk-good")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/models",
      { headers: { Authorization: "Bearer sk-good" }, signal: expect.any(AbortSignal) }
    );
  });

  it.each([
    [401, /rejected that key/],
    [403, /rejected that key/],
    [429, /rate limiting/],
    [500, /answered 500/],
  ])("maps status %i to a human message", async (status, pattern) => {
    fetchMock.mockResolvedValue({ ok: false, status });
    await expect(findProvider("llm", "openai")!.test("sk-bad")).rejects.toThrow(pattern);
  });

  it("reports an unreachable host rather than a raw network error", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(findProvider("llm", "ollama")!.test("http://nope:11434")).rejects.toThrow(
      "Could not reach Ollama."
    );
  });

  it("never puts the credential in the thrown message", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 });
    const err = await findProvider("llm", "openai")!.test("sk-supersecret").catch((e: Error) => e.message);
    expect(err).not.toContain("sk-supersecret");
  });

  it("normalises a trailing slash on the ollama url", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    await findProvider("llm", "ollama")!.test("http://localhost:11434/");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:11434/api/tags",
      { headers: {}, signal: expect.any(AbortSignal) }
    );
  });

  it("bounds every provider test with a timeout signal", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    await findProvider("llm", "openai")!.test("sk-good");
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});

// The Ollama test is the one path where a signed-in user names the host the
// server calls. It must not become a general-purpose probe.
describe("ComfyUI url hardening", () => {
  const fetchMock = vi.fn();
  const comfy = findProvider("image", "comfyui")!;

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
  });

  it("rejects non-http schemes without calling out", async () => {
    await expect(comfy.test("file:///etc/passwd")).rejects.toThrow(/http/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("normalises the configured URL to the ComfyUI health endpoint", async () => {
    await comfy.test("http://localhost:8188/custom/path?probe=1#fragment");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8188/system_stats",
      { headers: {}, signal: expect.any(AbortSignal) }
    );
  });

  it("reports an unreachable ComfyUI instance without leaking the URL", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const message = await comfy.test("http://secret-host:8188").catch((error: Error) => error.message);
    expect(message).toBe("Could not reach ComfyUI.");
    expect(message).not.toContain("secret-host");
  });
});

describe("ollama url hardening", () => {
  const fetchMock = vi.fn();
  const ollama = findProvider("llm", "ollama")!;

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
  });

  it("rejects a string that is not a URL, without calling out", async () => {
    await expect(ollama.test("not a url at all")).rejects.toThrow(
      "That does not look like a valid URL."
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a non-http scheme, without calling out", async () => {
    await expect(ollama.test("file:///etc/passwd")).rejects.toThrow(/http/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a scheme-less host, without calling out", async () => {
    await expect(ollama.test("localhost:11434")).rejects.toThrow(/http/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores a fragment that would otherwise truncate the /api/tags suffix", async () => {
    await ollama.test("http://localhost:11434/#");
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:11434/api/tags");
  });

  it("ignores an attacker-chosen path and query", async () => {
    await ollama.test("http://localhost:9200/_cluster/health?pretty=1");
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:9200/api/tags");
  });

  it("still allows an https host", async () => {
    await expect(ollama.test("https://ollama.example.com")).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][0]).toBe("https://ollama.example.com/api/tags");
  });
});

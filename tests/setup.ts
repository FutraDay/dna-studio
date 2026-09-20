import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";

if (typeof window !== "undefined") {
  Object.defineProperty(window, "scrollTo", {
    configurable: true,
    value: vi.fn(),
    writable: true,
  });
}

// Provider modules read configuration from process.env at call time, so every
// test starts from a known-empty environment rather than inheriting the
// developer's real .env.
const PROVIDER_ENV_KEYS = [
  "LLM_PROVIDER",
  "LOCAL_LLM_ONLY",
  "IMAGE_PROVIDER",
  "LOCAL_IMAGE_ONLY",
  "COMFYUI_BASE_URL",
  "COMFYUI_CHECKPOINT",
  "VIDEO_PROVIDER",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_MODEL",
  "GOOGLE_API_KEY",
  "GEMINI_MODEL",
  "GEMINI_IMAGE_MODEL",
  "OLLAMA_BASE_URL",
  "OLLAMA_MODEL",
  "STABILITY_API_KEY",
  "REPLICATE_API_TOKEN",
  "REPLICATE_MODEL",
  "HEYGEN_API_KEY",
  "DID_API_KEY",
];

for (const key of PROVIDER_ENV_KEYS) {
  delete process.env[key];
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

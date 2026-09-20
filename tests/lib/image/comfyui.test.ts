import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ComfyUIProvider } from "@/lib/image/providers/comfyui";

const checkpoints = [
  "DreamShaper8_LCM_INPAINTING.inpainting.safetensors",
  "DreamShaper_8_pruned.safetensors",
];

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  );
}

describe("ComfyUIProvider", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("queues a local workflow and returns an authenticated proxy URL", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/object_info/CheckpointLoaderSimple")) {
        return json({
          CheckpointLoaderSimple: {
            input: { required: { ckpt_name: [checkpoints] } },
          },
        });
      }
      if (url.endsWith("/prompt")) {
        const body = JSON.parse(String(init?.body)) as { prompt: Record<string, { inputs: Record<string, unknown> }> };
        expect(body.prompt["1"].inputs.ckpt_name).toBe("DreamShaper_8_pruned.safetensors");
        expect(body.prompt["4"].inputs).toMatchObject({ width: 768, height: 768, batch_size: 1 });
        return json({ prompt_id: "prompt-1" });
      }
      if (url.endsWith("/history/prompt-1")) {
        return json({
          "prompt-1": {
            outputs: {
              "7": {
                images: [{ filename: "DNAStudio_00001_.png", subfolder: "", type: "output" }],
              },
            },
          },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const result = await new ComfyUIProvider("http://localhost:8188/").generate("premium product photograph");

    expect(result.url).toContain("/api/images/comfyui?");
    expect(result.url).toContain("filename=DNAStudio_00001_.png");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  }, 5_000);

  it("honours an explicitly configured checkpoint", async () => {
    vi.stubEnv("COMFYUI_CHECKPOINT", checkpoints[0]);
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/object_info/CheckpointLoaderSimple")) {
        return json({ CheckpointLoaderSimple: { input: { required: { ckpt_name: [checkpoints] } } } });
      }
      if (url.endsWith("/prompt")) {
        const body = JSON.parse(String(init?.body)) as { prompt: Record<string, { inputs: Record<string, unknown> }> };
        expect(body.prompt["1"].inputs.ckpt_name).toBe(checkpoints[0]);
        return json({ prompt_id: "prompt-2" });
      }
      return json({
        "prompt-2": {
          outputs: { "7": { images: [{ filename: "DNAStudio_00002_.png", type: "output" }] } },
        },
      });
    });

    await expect(new ComfyUIProvider().generate("test")).resolves.toMatchObject({
      url: expect.stringContaining("DNAStudio_00002_.png"),
    });
  }, 5_000);

  it("fails safely when the configured checkpoint is not installed", async () => {
    vi.stubEnv("COMFYUI_CHECKPOINT", "missing.safetensors");
    fetchMock.mockImplementation(() =>
      json({ CheckpointLoaderSimple: { input: { required: { ckpt_name: [checkpoints] } } } })
    );

    await expect(new ComfyUIProvider().generate("test")).rejects.toThrow(
      "Configured ComfyUI checkpoint is not installed"
    );
  });
});
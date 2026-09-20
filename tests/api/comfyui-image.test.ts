import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  resolveSettings: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/settings/resolve", () => ({ resolveSettings: mocks.resolveSettings }));

import { GET } from "@/app/api/images/comfyui/route";

const request = (query: string) =>
  new Request(`http://localhost/api/images/comfyui?${query}`);

describe("GET /api/images/comfyui", () => {
  beforeEach(() => {
    mocks.requireSession.mockResolvedValue({ user: { id: "user_1" } });
    mocks.resolveSettings.mockResolvedValue({
      imageProvider: "openai",
      comfyUrl: "http://host.docker.internal:8188",
    });
  });

  it("streams an authenticated local image even after the active provider changes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      request("filename=DNAStudio_00001_.png&subfolder=&type=output")
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(fetchMock.mock.calls[0][0].toString()).toBe(
      "http://host.docker.internal:8188/view?filename=DNAStudio_00001_.png&subfolder=&type=output"
    );
  });

  it("requires authentication", async () => {
    mocks.requireSession.mockRejectedValue(new Error("Unauthorized"));
    vi.stubGlobal("fetch", vi.fn());

    expect((await GET(request("filename=x.png"))).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects traversal in the filename without calling ComfyUI", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(request("filename=..%2Fsecret.png"));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 502 when the local output is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("missing", { status: 404 })));

    expect((await GET(request("filename=missing.png"))).status).toBe(502);
  });
});
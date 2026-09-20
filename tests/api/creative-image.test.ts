import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  resolveSettings: vi.fn(),
  assetFindFirst: vi.fn(),
  assetUpdate: vi.fn(),
  buildCreativeCopy: vi.fn(),
  renderProfessionalCreative: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/settings/resolve", () => ({ resolveSettings: mocks.resolveSettings }));
vi.mock("@/lib/db", () => ({
  prisma: {
    asset: {
      findFirst: mocks.assetFindFirst,
      update: mocks.assetUpdate,
    },
  },
}));
vi.mock("@/lib/image/creative-composer", () => ({
  buildCreativeCopy: mocks.buildCreativeCopy,
  renderProfessionalCreative: mocks.renderProfessionalCreative,
}));

import { GET, POST } from "@/app/api/images/creative/route";

const rawImage =
  "/api/images/comfyui?filename=DNAStudio_00001_.png&subfolder=&type=output";
const baseAsset = {
  id: "asset_1",
  platform: "linkedin",
  caption: "Repetitive admin steals time. Build around the real workflow.",
  imageUrl: rawImage,
  campaign: {
    concepts: [],
    brand: { dna: { name: "FutraDay", colors: [] } },
  },
};

const post = (body: unknown) =>
  new Request("http://localhost/api/images/creative", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  mocks.requireSession.mockResolvedValue({ user: { id: "user_1" } });
  mocks.resolveSettings.mockResolvedValue({ comfyUrl: "http://host.docker.internal:8188" });
  mocks.assetFindFirst.mockResolvedValue(baseAsset);
  mocks.assetUpdate.mockResolvedValue({ id: "asset_1" });
  mocks.buildCreativeCopy.mockReturnValue({ brandName: "FutraDay" });
  mocks.renderProfessionalCreative.mockResolvedValue(Buffer.from([137, 80, 78, 71, 1, 2, 3]));
});

describe("POST /api/images/creative", () => {
  it("turns an existing local background into a persisted professional creative URL", async () => {
    const response = await POST(post({ assetId: "asset_1", preset: "professional" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.url).toContain("/api/images/creative?");
    expect(body.url).toContain("filename=DNAStudio_00001_.png");
    expect(mocks.assetUpdate).toHaveBeenCalledWith({
      where: { id: "asset_1" },
      data: { imageUrl: expect.stringContaining("/api/images/creative?") },
    });
  });

  it("requires a local ComfyUI background before composing", async () => {
    mocks.assetFindFirst.mockResolvedValue({ ...baseAsset, imageUrl: "https://cdn.example.com/image.png" });
    const response = await POST(post({ assetId: "asset_1" }));

    expect(response.status).toBe(409);
    expect(mocks.assetUpdate).not.toHaveBeenCalled();
  });
});

describe("GET /api/images/creative", () => {
  it("renders the stored local background with deterministic brand copy", async () => {
    const creativeUrl =
      "/api/images/creative?assetId=asset_1&filename=DNAStudio_00001_.png&subfolder=&type=output&preset=professional&v=1";
    mocks.assetFindFirst.mockResolvedValue({ ...baseAsset, imageUrl: creativeUrl });
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new Request(`http://localhost${creativeUrl}`));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(fetchMock.mock.calls[0][0].toString()).toBe(
      "http://host.docker.internal:8188/view?filename=DNAStudio_00001_.png&subfolder=&type=output"
    );
    expect(mocks.buildCreativeCopy).toHaveBeenCalledWith(
      expect.objectContaining({ platform: "linkedin", caption: baseAsset.caption })
    );
    expect(mocks.renderProfessionalCreative).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({ brandName: "FutraDay" })
    );
  });

  it("rejects a source filename that no longer matches the asset", async () => {
    mocks.assetFindFirst.mockResolvedValue({
      ...baseAsset,
      imageUrl:
        "/api/images/creative?assetId=asset_1&filename=expected.png&subfolder=&type=output&preset=professional",
    });
    vi.stubGlobal("fetch", vi.fn());

    const response = await GET(
      new Request(
        "http://localhost/api/images/creative?assetId=asset_1&filename=other.png&subfolder=&type=output&preset=professional"
      )
    );

    expect(response.status).toBe(409);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    mocks.requireSession.mockRejectedValue(new Error("Unauthorized"));
    const response = await GET(
      new Request(
        "http://localhost/api/images/creative?assetId=asset_1&filename=x.png&subfolder=&type=output&preset=professional"
      )
    );
    expect(response.status).toBe(401);
  });
});
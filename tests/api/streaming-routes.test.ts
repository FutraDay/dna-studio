import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => {
  const model = () => ({ findFirst: vi.fn(), create: vi.fn() });
  return { prisma: { brand: model(), campaign: model() } };
});
vi.mock("@/lib/auth/session", () => ({ requireSession: vi.fn(), getSession: vi.fn() }));
vi.mock("@/lib/brand-dna/crawler", () => ({ crawlBrandDNA: vi.fn() }));
vi.mock("@/lib/campaigns/generator", () => ({ streamCampaign: vi.fn(), repairCampaign: vi.fn() }));
vi.mock("@/lib/workspaces/access", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/workspaces/access")
  >("@/lib/workspaces/access");
  return {
    ...actual,
    ensurePersonalWorkspace: vi.fn(),
    requireWorkspaceRole: vi.fn(),
  };
});

import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { crawlBrandDNA } from "@/lib/brand-dna/crawler";
import { repairCampaign, streamCampaign } from "@/lib/campaigns/generator";
import { POST as analyze } from "@/app/api/brands/analyze/route";
import { POST as generate } from "@/app/api/campaigns/generate/route";
import { makeBrandDNA } from "../fixtures/brand-dna";
import {
  ensurePersonalWorkspace,
  requireWorkspaceRole,
} from "@/lib/workspaces/access";

const brand = vi.mocked(prisma.brand);
const campaign = vi.mocked(prisma.campaign);
const session = vi.mocked(requireSession);
const crawl = vi.mocked(crawlBrandDNA);
const stream = vi.mocked(streamCampaign);
const repair = vi.mocked(repairCampaign);
const ensureWorkspace = vi.mocked(ensurePersonalWorkspace);
const workspaceRole = vi.mocked(requireWorkspaceRole);

const post = (url: string, body: unknown) =>
  new Request(`http://localhost${url}`, { method: "POST", body: JSON.stringify(body) });

/** Collect an SSE body into the list of decoded `data:` payloads. */
async function readEvents(response: Response) {
  const text = await response.text();
  return text
    .split("\n\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice("data: ".length)));
}

beforeEach(() => {
  session.mockResolvedValue({ user: { id: "user_1", email: "a@b.c" } } as never);
  ensureWorkspace.mockResolvedValue({
    id: "ws_1",
    name: "Personal Workspace",
  } as never);
  workspaceRole.mockResolvedValue({
    id: "membership_1",
    role: "owner",
    workspace: {
      id: "ws_1",
      name: "Personal Workspace",
      ownerId: "user_1",
    },
  } as never);
});

describe("POST /api/brands/analyze", () => {
  const dna = makeBrandDNA();

  beforeEach(() => {
    crawl.mockResolvedValue(dna as never);
    brand.create.mockResolvedValue({ id: "brand_1", name: dna.name } as never);
  });

  it("answers 400 for a malformed URL without crawling", async () => {
    const response = await analyze(post("/api/brands/analyze", { url: "not a url" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "Invalid URL" });
    expect(crawl).not.toHaveBeenCalled();
  });

  it("answers 401 when signed out", async () => {
    session.mockRejectedValue(new Error("Unauthorized"));
    const response = await analyze(post("/api/brands/analyze", { url: "https://acme.coffee" }));
    expect(response.status).toBe(401);
  });

  it("responds as an event stream", async () => {
    const response = await analyze(post("/api/brands/analyze", { url: "https://acme.coffee" }));

    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(response.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("forwards crawl progress and finishes with the saved brand", async () => {
    crawl.mockImplementation(async (_url, onProgress) => {
      onProgress!({ step: "fetch", status: "running" });
      onProgress!({ step: "fetch", status: "done" });
      return dna as never;
    });

    const events = await readEvents(
      await analyze(post("/api/brands/analyze", { url: "https://acme.coffee" }))
    );

    expect(events.slice(0, 2)).toEqual([
      { type: "progress", step: "fetch", status: "running" },
      { type: "progress", step: "fetch", status: "done" },
    ]);
    expect(events.at(-1)).toMatchObject({ type: "complete" });
  });

  it("saves the brand against the signed-in user, flattening the DNA", async () => {
    await readEvents(await analyze(post("/api/brands/analyze", { url: "https://acme.coffee" })));

    expect(brand.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user_1",
        workspaceId: "ws_1",
        name: "Acme Coffee",
        colors: ["#6F4E37", "#C0A080"],
        fonts: ["Playfair Display", "Inter"],
        tone: "friendly",
        industry: "Food & Beverage",
        audience: "Home brewers",
      }),
    });
  });

  it("places a new brand in an explicitly selected managed workspace", async () => {
    workspaceRole.mockResolvedValue({
      id: "membership_team",
      role: "admin",
      workspace: {
        id: "ws_team",
        name: "Team Workspace",
        ownerId: "owner_2",
      },
    } as never);

    await readEvents(
      await analyze(
        post("/api/brands/analyze", {
          url: "https://acme.coffee",
          workspaceId: "ws_team",
        })
      )
    );

    expect(workspaceRole).toHaveBeenCalledWith(
      "user_1",
      "ws_team",
      ["owner", "admin"]
    );
    expect(brand.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user_1",
        workspaceId: "ws_team",
      }),
    });
  });

  it("rejects brand placement when the user cannot manage that workspace", async () => {
    workspaceRole.mockResolvedValue(null as never);

    const response = await analyze(
      post("/api/brands/analyze", {
        url: "https://acme.coffee",
        workspaceId: "ws_team",
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Owner or admin permission required for that workspace",
    });
    expect(crawl).not.toHaveBeenCalled();
    expect(brand.create).not.toHaveBeenCalled();
  });

  it("reports a crawl failure as an error event rather than a broken stream", async () => {
    crawl.mockRejectedValue(new Error("site unreachable"));

    const events = await readEvents(
      await analyze(post("/api/brands/analyze", { url: "https://acme.coffee" }))
    );

    expect(events).toEqual([{ type: "error", message: "site unreachable" }]);
    expect(brand.create).not.toHaveBeenCalled();
  });

  it("reports a save failure as an error event", async () => {
    brand.create.mockRejectedValue(new Error("db down"));

    const events = await readEvents(
      await analyze(post("/api/brands/analyze", { url: "https://acme.coffee" }))
    );

    expect(events.at(-1)).toEqual({ type: "error", message: "db down" });
  });
});

describe("POST /api/campaigns/generate", () => {
  const validBody = {
    brandId: "brand_1",
    goal: "Launch cold brew",
    platforms: ["instagram"],
  };

  const STRATEGIES = [
    "problem_awareness",
    "education",
    "proof_trust",
    "solution_product",
    "conversion",
  ] as const;
  const CAPTIONS = [
    "Missed follow-ups can leave worthwhile coffee orders sitting idle.",
    "Map the brewing handoff before automating repetitive preparation steps.",
    "Use a transparent roast process demo to evaluate consistency without invented claims.",
    "Connect ordering and fulfilment around the workflow your cafe already uses.",
    "Compare scattered subscriptions with one tailored operating approach before deciding.",
  ];
  const CONCEPTS = {
    concepts: Array.from({ length: 5 }, (_, index) => ({
      name: `Concept ${index + 1}`,
      strategy: STRATEGIES[index],
      assets: [
        {
          platform: "instagram",
          caption: CAPTIONS[index],
          hashtags: [`coffee-${index + 1}`],
          imagePrompt: [
            "barista serving a customer",
            "coffee beans on a roastery table",
            "before and after cafe counter",
            "roaster checking fresh beans",
            "cafe owner opening the shop",
          ][index],
        },
      ],
    })),
  };

  beforeEach(() => {
    brand.findFirst.mockResolvedValue({ id: "brand_1", dna: makeBrandDNA() } as never);
    campaign.create.mockResolvedValue({ id: "camp_1", assets: [] } as never);
    stream.mockImplementation(async function* () {
      yield JSON.stringify(CONCEPTS);
    } as never);
    repair.mockResolvedValue(CONCEPTS as never);
  });

  it.each([
    ["a missing goal", { brandId: "brand_1", platforms: ["instagram"] }],
    ["an empty goal", { ...validBody, goal: "" }],
    ["an unsupported platform", { ...validBody, platforms: ["myspace"] }],
    ["no selected platforms", { ...validBody, platforms: [] }],
  ])("answers 400 for %s", async (_label, body) => {
    const response = await generate(post("/api/campaigns/generate", body));
    expect(response.status).toBe(400);
  });

  it("answers 404 for a brand the user does not own", async () => {
    brand.findFirst.mockResolvedValue(null as never);
    const response = await generate(post("/api/campaigns/generate", validBody));
    expect(response.status).toBe(404);
  });

  it("answers 401 when signed out", async () => {
    session.mockRejectedValue(new Error("Unauthorized"));
    expect((await generate(post("/api/campaigns/generate", validBody))).status).toBe(401);
  });

  it("streams model chunks then the saved campaign", async () => {
    stream.mockImplementation(async function* () {
      yield '{"concepts":';
      yield JSON.stringify(CONCEPTS.concepts) + "}";
    } as never);

    const events = await readEvents(await generate(post("/api/campaigns/generate", validBody)));

    expect(events.filter((e) => e.type === "chunk")).toHaveLength(2);
    expect(events.at(-1)).toMatchObject({ type: "complete" });
  });

  it("creates one asset per concept asset", async () => {
    await readEvents(await generate(post("/api/campaigns/generate", validBody)));

    const created = campaign.create.mock.calls[0][0] as unknown as {
      data: {
        brandId: string;
        userId: string;
        goal: string;
        assets: { create: Array<{ platform: string; caption: string; status: string }> };
      };
    };
    expect(created.data.brandId).toBe("brand_1");
    expect(created.data.userId).toBe("user_1");
    expect(created.data.goal).toBe("Launch cold brew");
    expect(created.data.assets.create).toHaveLength(5);
    expect(created.data.assets.create[0]).toMatchObject({
      platform: "instagram",
      caption: CAPTIONS[0],
      status: "draft",
    });
  });
  it("stores a null image prompt when the model omits one", async () => {
    stream.mockImplementation(async function* () {
      yield JSON.stringify({
        concepts: Array.from({ length: 5 }, (_, index) => ({
          name: `Concept ${index + 1}`,
          strategy: STRATEGIES[index],
          assets: [
            {
              platform: "instagram",
              caption: CAPTIONS[index],
              hashtags: [],
            },
          ],
        })),
      });
    } as never);

    await readEvents(await generate(post("/api/campaigns/generate", validBody)));

    const created = campaign.create.mock.calls[0][0] as unknown as {
      data: { assets: { create: { imagePrompt: string | null }[] } };
    };
    expect(created.data.assets.create[0].imagePrompt).toBeNull();
  });
  it("repairs incomplete campaign coverage before saving", async () => {
    const incomplete = { concepts: CONCEPTS.concepts.slice(0, 2) };
    stream.mockImplementation(async function* () {
      yield JSON.stringify(incomplete);
    } as never);

    const events = await readEvents(await generate(post("/api/campaigns/generate", validBody)));

    expect(repair).toHaveBeenCalledWith(
      expect.anything(),
      "Launch cold brew",
      ["instagram"],
      "English",
      expect.objectContaining({ concepts: expect.any(Array) }),
      expect.arrayContaining([
        expect.objectContaining({ code: "concept_count" }),
      ])
    );
    expect(events.at(-1)).toMatchObject({ type: "complete" });
    expect(campaign.create).toHaveBeenCalled();
  });
  it("repairs fabricated company evidence deterministically before saving", async () => {
    const invalid = JSON.parse(JSON.stringify(CONCEPTS));
    invalid.concepts[0].assets[0].caption = "See how XYZ Co. boosted efficiency with automation.";
    stream.mockImplementation(async function* () {
      yield JSON.stringify(invalid);
    } as never);

    const events = await readEvents(await generate(post("/api/campaigns/generate", validBody)));

    expect(repair).not.toHaveBeenCalled();
    expect(events.at(-1)).toMatchObject({ type: "complete" });
    expect(campaign.create).toHaveBeenCalled();
    const created = campaign.create.mock.calls[0][0] as unknown as {
      data: { assets: { create: Array<{ caption: string }> } };
    };
    expect(created.data.assets.create[0].caption).not.toContain("XYZ Co.");
  });

  it("retries repair when a structural integrity issue remains", async () => {
    const invalid = { concepts: CONCEPTS.concepts.slice(0, 2) };
    stream.mockImplementation(async function* () {
      yield JSON.stringify(invalid);
    } as never);
    repair
      .mockResolvedValueOnce(invalid as never)
      .mockResolvedValueOnce(CONCEPTS as never);

    const events = await readEvents(await generate(post("/api/campaigns/generate", validBody)));

    expect(repair).toHaveBeenCalledTimes(2);
    expect(events.at(-1)).toMatchObject({ type: "complete" });
    expect(campaign.create).toHaveBeenCalled();
  });

  it("repairs editorial quality warnings deterministically before saving", async () => {
    const editorialInvalid = JSON.parse(JSON.stringify(CONCEPTS));
    editorialInvalid.concepts.slice(0, 3).forEach((concept: { assets: Array<{ caption: string }> }, index: number) => {
      concept.assets[0].caption = `Discover how your workflow improves with angle ${index + 1}.`;
    });
    stream.mockImplementation(async function* () {
      yield JSON.stringify(editorialInvalid);
    } as never);

    const events = await readEvents(await generate(post("/api/campaigns/generate", validBody)));

    expect(repair).not.toHaveBeenCalled();
    expect(events.at(-1)).toMatchObject({ type: "complete" });
    expect(campaign.create).toHaveBeenCalled();
  });

  it("rejects a campaign when structural repair still fails quality checks", async () => {
    const invalid = { concepts: CONCEPTS.concepts.slice(0, 2) };
    stream.mockImplementation(async function* () {
      yield JSON.stringify(invalid);
    } as never);
    repair.mockResolvedValue(invalid as never);

    const events = await readEvents(await generate(post("/api/campaigns/generate", validBody)));

    expect(events.at(-1)).toMatchObject({ type: "error" });
    expect(events.at(-1).message).toContain("Campaign quality check failed");
    expect(events.at(-1).message).toContain("Expected exactly 5 campaign concepts");
    expect(repair).toHaveBeenCalledTimes(3);
    expect(campaign.create).not.toHaveBeenCalled();
  });

  it("reports an error event when the model returns no JSON", async () => {
    stream.mockImplementation(async function* () {
      yield "I cannot help with that.";
    } as never);

    const events = await readEvents(await generate(post("/api/campaigns/generate", validBody)));

    expect(events.at(-1)).toEqual({
      type: "error",
      message: "LLM did not return valid JSON for campaign",
    });
    expect(campaign.create).not.toHaveBeenCalled();
  });

  it("defaults the language to English", async () => {
    await readEvents(await generate(post("/api/campaigns/generate", validBody)));
    expect(stream).toHaveBeenCalledWith(expect.anything(), "Launch cold brew", ["instagram"], "English");
  });

  it("passes a requested language through", async () => {
    await readEvents(
      await generate(post("/api/campaigns/generate", { ...validBody, language: "Arabic" }))
    );
    expect(stream).toHaveBeenCalledWith(expect.anything(), "Launch cold brew", ["instagram"], "Arabic");
  });
});

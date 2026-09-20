import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    campaign: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    asset: {
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { GET, PATCH } from "@/app/api/campaigns/[id]/route";

const session = vi.mocked(requireSession);
const campaign = vi.mocked(prisma.campaign);
const asset = vi.mocked(prisma.asset);
const transaction = vi.mocked(prisma.$transaction);

const params = { params: Promise.resolve({ id: "camp_1" }) };
const request = (body: unknown) =>
  new Request("http://localhost/api/campaigns/camp_1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const storedCampaign = {
  id: "camp_1",
  userId: "user_1",
  concepts: [
    {
      name: "Admin friction",
      description: "d",
      theme: "t",
      assets: [
        {
          platform: "linkedin",
          caption: "Original LinkedIn copy",
          hashtags: ["Operations"],
          cta: "Review it",
          imagePrompt: "prompt",
        },
      ],
    },
  ],
  assets: [
    {
      id: "asset_1",
      campaignId: "camp_1",
      platform: "linkedin",
      caption: "Original LinkedIn copy",
      hashtags: ["Operations"],
      imageUrl: null,
      imagePrompt: "prompt",
      status: "draft",
      scheduledAt: null,
      publishedAt: null,
    },
  ],
  brand: { id: "brand_1", name: "FutraDay" },
};

beforeEach(() => {
  vi.clearAllMocks();
  session.mockResolvedValue({
    user: { id: "user_1", email: "owner@example.com" },
  } as never);
  campaign.findFirst.mockResolvedValue(storedCampaign as never);
  campaign.update.mockReturnValue(Promise.resolve({}) as never);
  asset.update.mockReturnValue(Promise.resolve({}) as never);
  transaction.mockResolvedValue([] as never);
});

describe("GET /api/campaigns/[id]", () => {
  it("scopes the campaign to the signed-in user and annotates concept indexes", async () => {
    const response = await GET(new Request("http://localhost"), params);
    expect(response.status).toBe(200);

    expect(campaign.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "camp_1",
          brand: {
            workspace: {
              members: {
                some: { userId: "user_1" },
              },
            },
          },
        },
      })
    );

    const body = await response.json();
    expect(body.assets[0].conceptIndex).toBe(0);
  });

  it("answers 401 when signed out", async () => {
    session.mockRejectedValue(new Error("Unauthorized"));
    expect((await GET(new Request("http://localhost"), params)).status).toBe(401);
  });
});

describe("PATCH /api/campaigns/[id]", () => {
  it("persists the asset caption and keeps campaign concepts in sync", async () => {
    const response = await PATCH(
      request({ assetId: "asset_1", caption: "Updated professional LinkedIn copy." }),
      params
    );

    expect(response.status).toBe(200);
    expect(asset.update).toHaveBeenCalledWith({
      where: { id: "asset_1" },
      data: { caption: "Updated professional LinkedIn copy." },
    });
    expect(campaign.update).toHaveBeenCalledWith({
      where: { id: "camp_1" },
      data: {
        concepts: [
          expect.objectContaining({
            assets: [
              expect.objectContaining({
                platform: "linkedin",
                caption: "Updated professional LinkedIn copy.",
              }),
            ],
          }),
        ],
      },
    });
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("rejects an asset that is not part of the owned campaign", async () => {
    const response = await PATCH(
      request({ assetId: "not_mine", caption: "Updated copy" }),
      params
    );
    expect(response.status).toBe(404);
    expect(asset.update).not.toHaveBeenCalled();
  });

  it("rejects empty captions", async () => {
    const response = await PATCH(
      request({ assetId: "asset_1", caption: "   " }),
      params
    );
    expect(response.status).toBe(400);
    expect(campaign.findFirst).not.toHaveBeenCalled();
  });

  it("enforces the X/Twitter character limit", async () => {
    campaign.findFirst.mockResolvedValue({
      ...storedCampaign,
      assets: [
        {
          ...storedCampaign.assets[0],
          platform: "twitter",
          caption: "Original X copy",
        },
      ],
      concepts: [
        {
          ...storedCampaign.concepts[0],
          assets: [
            {
              ...storedCampaign.concepts[0].assets[0],
              platform: "twitter",
              caption: "Original X copy",
            },
          ],
        },
      ],
    } as never);

    const response = await PATCH(
      request({ assetId: "asset_1", caption: "x".repeat(281) }),
      params
    );
    expect(response.status).toBe(400);
    expect(asset.update).not.toHaveBeenCalled();
  });

  it("answers 401 when signed out", async () => {
    session.mockRejectedValue(new Error("Unauthorized"));
    expect(
      (
        await PATCH(
          request({ assetId: "asset_1", caption: "Updated copy" }),
          params
        )
      ).status
    ).toBe(401);
  });
});

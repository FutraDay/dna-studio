import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    campaign: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { PATCH, POST } from "@/app/api/campaigns/[id]/variants/route";

const session = vi.mocked(requireSession);
const campaign = vi.mocked(prisma.campaign);
const transaction = vi.mocked(prisma.$transaction);

const params = { params: Promise.resolve({ id: "camp_a" }) };

const sourceCampaign = {
  id: "camp_a",
  brandId: "brand_1",
  userId: "user_1",
  goal: "Generate qualified leads",
  concepts: [
    {
      name: "Admin tax",
      description: "Manual work creates invisible cost.",
      theme: "operations",
      assets: [
        {
          platform: "linkedin",
          caption: "Control copy",
          hashtags: ["operations"],
          cta: "Review the workflow",
          imagePrompt: "A clean office workflow scene",
        },
      ],
    },
  ],
  experimentId: null,
  variantLabel: null,
  isPreferredVariant: false,
  assets: [
    {
      id: "asset_a",
      campaignId: "camp_a",
      platform: "linkedin",
      caption: "Control copy",
      imageUrl: "https://cdn.example.com/control.png",
      imagePrompt: "A clean office workflow scene",
      hashtags: ["operations"],
      scheduledAt: new Date("2030-01-02T10:30:00.000Z"),
      publishedAt: new Date("2030-01-01T10:30:00.000Z"),
      status: "published",
    },
  ],
};

const variantA = {
  id: "camp_a",
  variantLabel: "A",
  isPreferredVariant: false,
  createdAt: new Date("2026-09-19T00:00:00.000Z"),
  updatedAt: new Date("2026-09-19T00:00:00.000Z"),
};

const variantB = {
  id: "camp_b",
  variantLabel: "B",
  isPreferredVariant: false,
  createdAt: new Date("2026-09-19T00:01:00.000Z"),
  updatedAt: new Date("2026-09-19T00:01:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  session.mockResolvedValue({
    user: { id: "user_1", email: "owner@example.com" },
  } as never);
  campaign.findFirst.mockResolvedValue(sourceCampaign as never);
  campaign.update.mockReturnValue(Promise.resolve({}) as never);
  campaign.updateMany.mockReturnValue(Promise.resolve({ count: 2 }) as never);
  campaign.create.mockReturnValue(Promise.resolve(variantB) as never);
  campaign.findMany.mockResolvedValue([variantA, variantB] as never);
  transaction.mockResolvedValue([{}, variantB] as never);
});

describe("POST /api/campaigns/[id]/variants", () => {
  it("creates Variant B without invoking generation and resets delivery state", async () => {
    const response = await POST(new Request("http://localhost"), params);

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.created).toBe(true);
    expect(body.variant.id).toBe("camp_b");

    expect(campaign.findFirst).toHaveBeenCalledWith({
      where: {
        id: "camp_a",
        brand: {
          workspace: {
            members: {
              some: { userId: "user_1" },
            },
          },
        },
      },
      include: { assets: true },
    });

    const createArgs = campaign.create.mock.calls[0][0] as never as {
      data: {
        experimentId: string;
        variantLabel: string;
        userId: string;
        assets: {
          create: Array<{
            caption: string;
            imageUrl: string | null;
            status: string;
            scheduledAt: Date | null;
            publishedAt: Date | null;
          }>;
        };
      };
    };

    expect(createArgs.data.experimentId).toEqual(expect.any(String));
    expect(createArgs.data.variantLabel).toBe("B");
    expect(createArgs.data.userId).toBe("user_1");
    expect(createArgs.data.assets.create).toEqual([
      expect.objectContaining({
        caption: "Control copy",
        imageUrl: "https://cdn.example.com/control.png",
        status: "draft",
        scheduledAt: null,
        publishedAt: null,
      }),
    ]);
  });

  it("turns the source campaign into Variant A in the same experiment", async () => {
    await POST(new Request("http://localhost"), params);

    const updateArgs = campaign.update.mock.calls[0][0] as never as {
      where: { id: string };
      data: { experimentId: string; variantLabel: string };
    };
    const createArgs = campaign.create.mock.calls[0][0] as never as {
      data: { experimentId: string };
    };

    expect(updateArgs.where).toEqual({ id: "camp_a" });
    expect(updateArgs.data.variantLabel).toBe("A");
    expect(createArgs.data.experimentId).toBe(updateArgs.data.experimentId);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("is idempotent when Variant B already exists", async () => {
    campaign.findFirst.mockResolvedValue({
      ...sourceCampaign,
      experimentId: "exp_1",
      variantLabel: "A",
    } as never);
    campaign.findMany.mockResolvedValue([variantA, variantB] as never);

    const response = await POST(new Request("http://localhost"), params);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      created: false,
      experimentId: "exp_1",
      variant: expect.objectContaining({ id: "camp_b", variantLabel: "B" }),
      variants: expect.any(Array),
    });
    expect(campaign.create).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("answers 404 for a campaign the user does not own", async () => {
    campaign.findFirst.mockResolvedValue(null as never);

    expect((await POST(new Request("http://localhost"), params)).status).toBe(404);
    expect(campaign.create).not.toHaveBeenCalled();
  });

  it("answers 401 when signed out", async () => {
    session.mockRejectedValue(new Error("Unauthorized"));

    expect((await POST(new Request("http://localhost"), params)).status).toBe(401);
  });
});

describe("PATCH /api/campaigns/[id]/variants", () => {
  const patchRequest = (preferredCampaignId: string) =>
    new Request("http://localhost/api/campaigns/camp_a/variants", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferredCampaignId }),
    });

  it("marks exactly one campaign in the experiment as preferred", async () => {
    campaign.findFirst
      .mockResolvedValueOnce({ experimentId: "exp_1" } as never)
      .mockResolvedValueOnce({ id: "camp_b" } as never);
    campaign.findMany.mockResolvedValue([
      variantA,
      { ...variantB, isPreferredVariant: true },
    ] as never);
    transaction.mockResolvedValue([{ count: 2 }, {}] as never);

    const response = await PATCH(patchRequest("camp_b"), params);

    expect(response.status).toBe(200);
    expect(campaign.updateMany).toHaveBeenCalledWith({
      where: {
        experimentId: "exp_1",
        brand: {
          workspace: {
            members: {
              some: { userId: "user_1" },
            },
          },
        },
      },
      data: { isPreferredVariant: false },
    });
    expect(campaign.update).toHaveBeenCalledWith({
      where: { id: "camp_b" },
      data: { isPreferredVariant: true },
    });
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("rejects preferred campaigns outside the current experiment", async () => {
    campaign.findFirst
      .mockResolvedValueOnce({ experimentId: "exp_1" } as never)
      .mockResolvedValueOnce(null as never);

    const response = await PATCH(patchRequest("other_campaign"), params);

    expect(response.status).toBe(404);
    expect(campaign.updateMany).not.toHaveBeenCalled();
  });

  it("rejects preference selection before an A/B test exists", async () => {
    campaign.findFirst.mockResolvedValueOnce({ experimentId: null } as never);

    const response = await PATCH(patchRequest("camp_a"), params);

    expect(response.status).toBe(409);
    expect(campaign.updateMany).not.toHaveBeenCalled();
  });

  it("validates the request body", async () => {
    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      params
    );

    expect(response.status).toBe(400);
    expect(campaign.findFirst).not.toHaveBeenCalled();
  });
});

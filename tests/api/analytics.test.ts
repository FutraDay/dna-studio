import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    brand: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    asset: {
      findMany: vi.fn(),
    },
    socialConnection: {
      findMany: vi.fn(),
    },
    postMetricSnapshot: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn(),
}));

vi.mock("@/lib/analytics/providers", () => ({
  fetchPostMetrics: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { fetchPostMetrics } from "@/lib/analytics/providers";
import { GET } from "@/app/api/analytics/route";
import { POST } from "@/app/api/analytics/refresh/route";

const session = vi.mocked(requireSession);
const brand = vi.mocked(prisma.brand);
const asset = vi.mocked(prisma.asset);
const socialConnection = vi.mocked(prisma.socialConnection);
const snapshot = vi.mocked(prisma.postMetricSnapshot);
const metricsProvider = vi.mocked(fetchPostMetrics);

const publishedAsset = {
  id: "asset_1",
  platform: "linkedin",
  caption: "Operational friction is expensive.",
  status: "published",
  publishedAt: new Date("2026-09-19T08:00:00.000Z"),
  createdAt: new Date("2026-09-18T08:00:00.000Z"),
  providerPostId: "urn:li:ugcPost:1",
  campaign: {
    id: "camp_a",
    goal: "Generate leads",
    experimentId: "exp_1",
    variantLabel: "A",
    isPreferredVariant: false,
    brand: { id: "brand_1", name: "FutraDay" },
  },
  metrics: [
    {
      impressions: 1000,
      reach: 750,
      likes: 40,
      comments: 8,
      shares: 6,
      clicks: 25,
      saves: 5,
      fetchedAt: new Date("2026-09-19T09:00:00.000Z"),
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  session.mockResolvedValue({
    user: { id: "user_1", email: "owner@example.com" },
  } as never);
  brand.findFirst.mockResolvedValue({ id: "brand_1" } as never);
  brand.findMany.mockResolvedValue([
    { id: "brand_1", name: "FutraDay" },
  ] as never);
  asset.findMany.mockResolvedValue([publishedAsset] as never);
  socialConnection.findMany.mockResolvedValue([
    {
      platform: "linkedin",
      accessToken: "token",
      refreshToken: null,
      accountId: "urn:li:person:1",
    },
  ] as never);
  snapshot.create.mockResolvedValue({ id: "metric_1" } as never);
  metricsProvider.mockResolvedValue({
    impressions: 1200,
    reach: 900,
    likes: 50,
    comments: 10,
    shares: 7,
    clicks: 30,
    saves: 6,
  });
});

describe("GET /api/analytics", () => {
  it("returns user-scoped post, platform and A/B aggregates", async () => {
    const response = await GET(
      new Request("http://localhost/api/analytics")
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(asset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "published",
          campaign: {
            brand: {
              workspace: {
                members: {
                  some: { userId: "user_1" },
                },
              },
            },
          },
        },
      })
    );
    expect(body.summary).toMatchObject({
      publishedPosts: 1,
      trackedPosts: 1,
      impressions: 1000,
      reach: 750,
      engagements: 84,
      engagementRate: 8.4,
    });
    expect(body.platforms[0]).toMatchObject({
      platform: "linkedin",
      posts: 1,
      trackedPosts: 1,
      impressions: 1000,
    });
    expect(body.experiments[0].variants[0]).toMatchObject({
      label: "A",
      posts: 1,
      trackedPosts: 1,
      impressions: 1000,
    });
  });

  it("filters analytics by an owned brand", async () => {
    await GET(
      new Request("http://localhost/api/analytics?brandId=brand_1")
    );

    expect(brand.findFirst).toHaveBeenCalledWith({
      where: {
        id: "brand_1",
        workspace: {
          members: {
            some: { userId: "user_1" },
          },
        },
      },
      select: { id: true },
    });
    expect(asset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "published",
          campaign: {
            brandId: "brand_1",
            brand: {
              workspace: {
                members: {
                  some: { userId: "user_1" },
                },
              },
            },
          },
        },
      })
    );
  });

  it("rejects another user's brand filter", async () => {
    brand.findFirst.mockResolvedValue(null as never);

    const response = await GET(
      new Request("http://localhost/api/analytics?brandId=other")
    );

    expect(response.status).toBe(404);
    expect(asset.findMany).not.toHaveBeenCalled();
  });

  it("handles published posts that have not been tracked yet", async () => {
    asset.findMany.mockResolvedValue([
      {
        ...publishedAsset,
        providerPostId: null,
        metrics: [],
      },
    ] as never);

    const body = await (
      await GET(new Request("http://localhost/api/analytics"))
    ).json();

    expect(body.summary).toMatchObject({
      publishedPosts: 1,
      trackedPosts: 0,
      refreshablePosts: 0,
      missingProviderPostId: 1,
      impressions: 0,
      engagementRate: 0,
    });
    expect(body.posts[0].tracked).toBe(false);
  });

  it("answers 401 when signed out", async () => {
    session.mockRejectedValue(new Error("Unauthorized"));

    expect(
      (await GET(new Request("http://localhost/api/analytics"))).status
    ).toBe(401);
  });
});

describe("POST /api/analytics/refresh", () => {
  const request = (body: unknown = {}) =>
    new Request("http://localhost/api/analytics/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  beforeEach(() => {
    asset.findMany.mockResolvedValue([
      {
        id: "asset_1",
        platform: "linkedin",
        providerPostId: "urn:li:ugcPost:1",
      },
    ] as never);
  });

  it("fetches provider metrics and stores a new snapshot", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      attempted: 1,
      refreshed: 1,
      skipped: 0,
      failed: 0,
      limit: 50,
    });

    expect(metricsProvider).toHaveBeenCalledWith({
      platform: "linkedin",
      providerPostId: "urn:li:ugcPost:1",
      connection: expect.objectContaining({
        accessToken: "token",
        accountId: "urn:li:person:1",
      }),
    });
    expect(snapshot.create).toHaveBeenCalledWith({
      data: {
        assetId: "asset_1",
        impressions: 1200,
        reach: 900,
        likes: 50,
        comments: 10,
        shares: 7,
        clicks: 30,
        saves: 6,
        source: "provider",
      },
    });
  });

  it("skips posts that predate provider-ID tracking", async () => {
    asset.findMany.mockResolvedValue([
      {
        id: "asset_old",
        platform: "facebook",
        providerPostId: null,
      },
    ] as never);

    const body = await (await POST(request())).json();

    expect(body).toMatchObject({
      attempted: 1,
      refreshed: 0,
      skipped: 1,
      failed: 0,
    });
    expect(metricsProvider).not.toHaveBeenCalled();
  });

  it("skips a platform with no connected account", async () => {
    socialConnection.findMany.mockResolvedValue([] as never);

    const body = await (await POST(request())).json();

    expect(body.skipped).toBe(1);
    expect(body.results[0].reason).toContain("No linkedin connection");
    expect(metricsProvider).not.toHaveBeenCalled();
  });

  it("preserves the run when one provider refresh fails", async () => {
    metricsProvider.mockRejectedValue(new Error("permission missing"));

    const body = await (await POST(request())).json();

    expect(body).toMatchObject({
      attempted: 1,
      refreshed: 0,
      skipped: 0,
      failed: 1,
    });
    expect(body.results[0]).toMatchObject({
      status: "failed",
      reason: "permission missing",
    });
    expect(snapshot.create).not.toHaveBeenCalled();
  });

  it("filters refreshes by an owned brand", async () => {
    await POST(request({ brandId: "brand_1" }));

    expect(brand.findFirst).toHaveBeenCalledWith({
      where: {
        id: "brand_1",
        workspace: {
          members: {
            some: { userId: "user_1" },
          },
        },
      },
      select: { id: true },
    });
    expect(asset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "published",
          campaign: {
            brandId: "brand_1",
            brand: {
              workspace: {
                members: {
                  some: { userId: "user_1" },
                },
              },
            },
          },
        },
      })
    );
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    brand: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    asset: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { GET } from "@/app/api/calendar/route";

const session = vi.mocked(requireSession);
const brand = vi.mocked(prisma.brand);
const asset = vi.mocked(prisma.asset);

const makeRequest = (
  extra = ""
) =>
  new Request(
    `http://localhost/api/calendar?start=2026-09-01T00:00:00.000Z&end=2026-10-01T00:00:00.000Z${extra}`
  );

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-19T12:00:00.000Z"));
  vi.clearAllMocks();

  session.mockResolvedValue({
    user: { id: "user_1", email: "owner@example.com" },
  } as never);

  brand.findFirst.mockResolvedValue({ id: "brand_1" } as never);
  brand.findMany.mockResolvedValue([
    { id: "brand_1", name: "FutraDay" },
  ] as never);

  asset.findMany.mockResolvedValue([
    {
      id: "scheduled_future",
      platform: "linkedin",
      caption: "Future queued post",
      status: "scheduled",
      imageUrl: null,
      scheduledAt: new Date("2026-09-21T08:00:00.000Z"),
      publishedAt: null,
      campaign: {
        id: "camp_1",
        goal: "Lead generation",
        variantLabel: "A",
        brand: { id: "brand_1", name: "FutraDay" },
      },
    },
    {
      id: "scheduled_overdue",
      platform: "facebook",
      caption: "Past queued post",
      status: "scheduled",
      imageUrl: null,
      scheduledAt: new Date("2026-09-18T08:00:00.000Z"),
      publishedAt: null,
      campaign: {
        id: "camp_1",
        goal: "Lead generation",
        variantLabel: "A",
        brand: { id: "brand_1", name: "FutraDay" },
      },
    },
    {
      id: "published",
      platform: "instagram",
      caption: "Published from queue",
      status: "published",
      imageUrl: "https://cdn.example/post.png",
      scheduledAt: new Date("2026-09-17T08:00:00.000Z"),
      publishedAt: new Date("2026-09-17T08:00:03.000Z"),
      campaign: {
        id: "camp_2",
        goal: "Awareness",
        variantLabel: null,
        brand: { id: "brand_1", name: "FutraDay" },
      },
    },
    {
      id: "failed",
      platform: "twitter",
      caption: "Failed queued post",
      status: "failed",
      imageUrl: null,
      scheduledAt: new Date("2026-09-16T08:00:00.000Z"),
      publishedAt: null,
      campaign: {
        id: "camp_3",
        goal: "Awareness",
        variantLabel: null,
        brand: { id: "brand_1", name: "FutraDay" },
      },
    },
  ] as never);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/calendar", () => {
  it("returns user-scoped scheduled history and queue summary", async () => {
    const response = await GET(makeRequest());

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(asset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          scheduledAt: {
            gte: new Date("2026-09-01T00:00:00.000Z"),
            lt: new Date("2026-10-01T00:00:00.000Z"),
          },
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

    expect(body.summary).toEqual({
      total: 4,
      scheduled: 2,
      published: 1,
      failed: 1,
      overdue: 1,
      upcoming: 1,
    });
    expect(body.posts.find((post: { id: string }) => post.id === "scheduled_overdue"))
      .toMatchObject({ overdue: true });
    expect(body.posts.find((post: { id: string }) => post.id === "scheduled_future"))
      .toMatchObject({ overdue: false });
  });

  it("applies owned brand and platform filters", async () => {
    await GET(makeRequest("&brandId=brand_1&platform=linkedin"));

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
          scheduledAt: expect.any(Object),
          platform: "linkedin",
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

  it("rejects a brand the signed-in user does not own", async () => {
    brand.findFirst.mockResolvedValue(null as never);

    const response = await GET(makeRequest("&brandId=other"));

    expect(response.status).toBe(404);
    expect(asset.findMany).not.toHaveBeenCalled();
  });

  it("rejects an end date before the start date", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/calendar?start=2026-10-01T00:00:00.000Z&end=2026-09-01T00:00:00.000Z"
      )
    );

    expect(response.status).toBe(400);
    expect(asset.findMany).not.toHaveBeenCalled();
  });

  it("rejects excessively large calendar ranges", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/calendar?start=2026-01-01T00:00:00.000Z&end=2026-12-31T00:00:00.000Z"
      )
    );

    expect(response.status).toBe(400);
    expect(asset.findMany).not.toHaveBeenCalled();
  });

  it("answers 400 for a malformed calendar query", async () => {
    const response = await GET(
      new Request("http://localhost/api/calendar?start=nope&end=also-nope")
    );

    expect(response.status).toBe(400);
  });

  it("answers 401 when signed out", async () => {
    session.mockRejectedValue(new Error("Unauthorized"));

    expect((await GET(makeRequest())).status).toBe(401);
  });
});

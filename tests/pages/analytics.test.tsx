// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

import AnalyticsPage from "@/app/analytics/page";

const analytics = {
  brands: [
    { id: "brand_1", name: "FutraDay" },
    { id: "brand_2", name: "NudgeWin" },
  ],
  activeBrandId: null,
  summary: {
    publishedPosts: 2,
    trackedPosts: 2,
    refreshablePosts: 2,
    missingProviderPostId: 0,
    lastSyncedAt: "2026-09-19T09:00:00.000Z",
    impressions: 1500,
    reach: 1000,
    likes: 45,
    comments: 8,
    shares: 7,
    clicks: 30,
    saves: 5,
    engagements: 95,
    engagementRate: 6.33,
  },
  platforms: [
    {
      platform: "linkedin",
      posts: 2,
      trackedPosts: 2,
      impressions: 1500,
      reach: 1000,
      likes: 45,
      comments: 8,
      shares: 7,
      clicks: 30,
      saves: 5,
      engagements: 95,
      engagementRate: 6.33,
    },
  ],
  experiments: [
    {
      id: "exp_1",
      goal: "Generate qualified leads",
      brand: { id: "brand_1", name: "FutraDay" },
      variants: [
        {
          campaignId: "camp_a",
          label: "A",
          preferred: false,
          posts: 1,
          trackedPosts: 1,
          impressions: 500,
          reach: 300,
          likes: 10,
          comments: 2,
          shares: 1,
          clicks: 5,
          saves: 1,
          engagements: 19,
          engagementRate: 3.8,
        },
        {
          campaignId: "camp_b",
          label: "B",
          preferred: true,
          posts: 1,
          trackedPosts: 1,
          impressions: 1000,
          reach: 700,
          likes: 35,
          comments: 6,
          shares: 6,
          clicks: 25,
          saves: 4,
          engagements: 76,
          engagementRate: 7.6,
        },
      ],
    },
  ],
  posts: [
    {
      id: "asset_b",
      platform: "linkedin",
      caption: "Variant B post copy",
      publishedAt: "2026-09-19T08:00:00.000Z",
      providerPostId: "urn:li:ugcPost:2",
      campaignId: "camp_b",
      campaignGoal: "Generate qualified leads",
      brand: { id: "brand_1", name: "FutraDay" },
      experimentId: "exp_1",
      variantLabel: "B",
      isPreferredVariant: true,
      tracked: true,
      lastSyncedAt: "2026-09-19T09:00:00.000Z",
      metrics: {
        impressions: 1000,
        reach: 700,
        likes: 35,
        comments: 6,
        shares: 6,
        clicks: 25,
        saves: 4,
        engagements: 76,
        engagementRate: 7.6,
      },
    },
  ],
};

const response = (data: unknown, ok = true) => ({
  ok,
  json: async () => data,
});

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Analytics page", () => {
  it("renders performance totals and A/B comparison", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response(analytics))
    );

    render(<AnalyticsPage />);

    expect(await screen.findByRole("heading", { name: "Analytics" })).toBeInTheDocument();
    expect(screen.getByText("1,500")).toBeInTheDocument();
    expect(screen.getByText("6.33%")).toBeInTheDocument();
    expect(screen.getByText("Variant A")).toBeInTheDocument();
    expect(screen.getByText("Variant B")).toBeInTheDocument();
    expect(screen.getByText("Variant B post copy")).toBeInTheDocument();
  });

  it("refreshes metrics without calling any AI generation endpoint", async () => {
    const user = userEvent.setup();
    let analyticsReads = 0;
    const fetchMock = vi.fn().mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url === "/api/analytics" && !init?.method) {
          analyticsReads += 1;
          return response(analytics);
        }

        if (url === "/api/analytics/refresh" && init?.method === "POST") {
          return response({
            attempted: 2,
            refreshed: 2,
            skipped: 0,
            failed: 0,
          });
        }

        throw new Error(`Unexpected fetch: ${url} ${init?.method ?? "GET"}`);
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<AnalyticsPage />);

    await user.click(
      await screen.findByRole("button", {
        name: /refresh metrics.*no ai credits/i,
      })
    );

    expect(
      await screen.findByText(/refresh complete: 2 updated/i)
    ).toBeInTheDocument();
    expect(analyticsReads).toBe(2);
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes("/api/campaigns/generate")
      )
    ).toBe(false);
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes("/api/images/generate")
      )
    ).toBe(false);
  });

  it("filters analytics by brand", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation(
      async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/analytics") return response(analytics);
        if (url === "/api/analytics?brandId=brand_2") {
          return response({
            ...analytics,
            activeBrandId: "brand_2",
            summary: {
              ...analytics.summary,
              publishedPosts: 0,
              trackedPosts: 0,
              refreshablePosts: 0,
              impressions: 0,
              reach: 0,
              engagements: 0,
              engagementRate: 0,
            },
            platforms: [],
            experiments: [],
            posts: [],
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<AnalyticsPage />);

    const select = await screen.findByRole("combobox", {
      name: /filter analytics by brand/i,
    });
    await user.selectOptions(select, "brand_2");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/analytics?brandId=brand_2"
      );
    });
    expect(
      await screen.findByText("No published posts yet")
    ).toBeInTheDocument();
  });
});

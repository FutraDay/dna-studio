import { describe, expect, it } from "vitest";
import {
  aggregatePostMetrics,
  engagementCount,
  engagementRate,
  extractProviderPostId,
  normalizePostMetrics,
} from "@/lib/analytics/metrics";

describe("analytics metrics", () => {
  it("normalizes invalid and negative values to zero", () => {
    expect(
      normalizePostMetrics({
        impressions: "120",
        reach: -3,
        likes: Number.NaN,
        comments: "4",
        shares: undefined,
        clicks: 2.4,
        saves: null,
      })
    ).toEqual({
      impressions: 120,
      reach: 0,
      likes: 0,
      comments: 4,
      shares: 0,
      clicks: 2,
      saves: 0,
    });
  });

  it("calculates engagement count and rate from supported actions", () => {
    const metrics = normalizePostMetrics({
      impressions: 200,
      likes: 10,
      comments: 5,
      shares: 3,
      clicks: 8,
      saves: 4,
    });

    expect(engagementCount(metrics)).toBe(30);
    expect(engagementRate(metrics)).toBe(15);
  });

  it("returns zero engagement rate without impressions", () => {
    expect(
      engagementRate(
        normalizePostMetrics({
          likes: 10,
          comments: 5,
        })
      )
    ).toBe(0);
  });

  it("aggregates multiple post snapshots", () => {
    const total = aggregatePostMetrics([
      normalizePostMetrics({ impressions: 100, likes: 10, clicks: 5 }),
      normalizePostMetrics({ impressions: 300, comments: 6, shares: 4 }),
    ]);

    expect(total).toEqual({
      impressions: 400,
      reach: 0,
      likes: 10,
      comments: 6,
      shares: 4,
      clicks: 5,
      saves: 0,
      engagements: 25,
      engagementRate: 6.25,
    });
  });

  it.each([
    [{ id: "fb_1" }, "fb_1"],
    [{ postId: "post_1" }, "post_1"],
    [{ data: { id: "tweet_1" } }, "tweet_1"],
    [{ data: { urn: "urn:li:ugcPost:1" } }, "urn:li:ugcPost:1"],
    [{}, null],
    [null, null],
  ])("extracts provider post IDs from common response shapes", (result, expected) => {
    expect(extractProviderPostId(result)).toBe(expected);
  });

  it("prefers Facebook post_id over a photo object id", () => {
    expect(
      extractProviderPostId(
        { id: "photo_1", post_id: "page_1_post_1" },
        "facebook"
      )
    ).toBe("page_1_post_1");
  });
});

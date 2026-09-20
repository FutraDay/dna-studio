import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchPostMetrics } from "@/lib/analytics/providers";

const fetchMock = vi.fn();

const response = (data: unknown, ok = true, status = ok ? 200 : 400) => ({
  ok,
  status,
  json: async () => data,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("TWITTER_API_KEY", "consumer");
  vi.stubEnv("TWITTER_API_SECRET", "consumer-secret");
  vi.stubEnv("LINKEDIN_VERSION", "202609");
});

describe("fetchPostMetrics", () => {
  it("normalizes X public metrics", async () => {
    fetchMock.mockResolvedValue(
      response({
        data: {
          public_metrics: {
            impression_count: 1000,
            like_count: 30,
            reply_count: 5,
            retweet_count: 7,
            quote_count: 3,
            bookmark_count: 4,
          },
        },
      })
    );

    const metrics = await fetchPostMetrics({
      platform: "twitter",
      providerPostId: "tweet_1",
      connection: {
        platform: "twitter",
        accessToken: "user-token",
        refreshToken: "user-secret",
        accountId: "acct",
      },
    });

    expect(metrics).toEqual({
      impressions: 1000,
      reach: 0,
      likes: 30,
      comments: 5,
      shares: 10,
      clicks: 0,
      saves: 4,
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/2/tweets/tweet_1?tweet.fields=public_metrics"
    );
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toMatch(/^OAuth /);
  });

  it("combines Facebook engagement and insight metrics", async () => {
    fetchMock.mockResolvedValue(
      response({
        shares: { count: 8 },
        comments: { summary: { total_count: 4 } },
        reactions: { summary: { total_count: 20 } },
        insights: {
          data: [
            { name: "post_impressions", values: [{ value: 500 }] },
            { name: "post_impressions_unique", values: [{ value: 350 }] },
            { name: "post_clicks", values: [{ value: 25 }] },
          ],
        },
      })
    );

    await expect(
      fetchPostMetrics({
        platform: "facebook",
        providerPostId: "page_1_99",
        connection: {
          platform: "facebook",
          accessToken: "fb-token",
          accountId: "page_1",
        },
      })
    ).resolves.toEqual({
      impressions: 500,
      reach: 350,
      likes: 20,
      comments: 4,
      shares: 8,
      clicks: 25,
      saves: 0,
    });
  });

  it("keeps Instagram basic metrics if insights are unavailable", async () => {
    fetchMock
      .mockResolvedValueOnce(
        response({ like_count: 17, comments_count: 3 })
      )
      .mockResolvedValueOnce(
        response({ error: { message: "Metric unavailable" } }, false, 400)
      );

    await expect(
      fetchPostMetrics({
        platform: "instagram",
        providerPostId: "ig_99",
        connection: {
          platform: "instagram",
          accessToken: "ig-token",
          accountId: "ig-account",
        },
      })
    ).resolves.toEqual({
      impressions: 0,
      reach: 0,
      likes: 17,
      comments: 3,
      shares: 0,
      clicks: 0,
      saves: 0,
    });
  });

  it("reads LinkedIn social action totals", async () => {
    fetchMock.mockResolvedValue(
      response({
        likesSummary: { aggregatedTotalLikes: 12 },
        commentsSummary: { aggregatedTotalComments: 6 },
      })
    );

    const metrics = await fetchPostMetrics({
      platform: "linkedin",
      providerPostId: "urn:li:ugcPost:123",
      connection: {
        platform: "linkedin",
        accessToken: "li-token",
        accountId: "urn:li:person:1",
      },
    });

    expect(metrics.likes).toBe(12);
    expect(metrics.comments).toBe(6);
    expect(fetchMock.mock.calls[0][1].headers["Linkedin-Version"]).toBe(
      "202609"
    );
  });

  it("fails clearly when X OAuth credentials are incomplete", async () => {
    vi.stubEnv("TWITTER_API_SECRET", "");

    await expect(
      fetchPostMetrics({
        platform: "twitter",
        providerPostId: "tweet_1",
        connection: {
          platform: "twitter",
          accessToken: "user-token",
          refreshToken: null,
          accountId: "acct",
        },
      })
    ).rejects.toThrow("X analytics credentials are incomplete");

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

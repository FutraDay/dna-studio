import crypto from "node:crypto";
import {
  emptyPostMetrics,
  normalizePostMetrics,
  type NormalizedPostMetrics,
} from "./metrics";

export interface MetricsConnection {
  platform: string;
  accessToken: string;
  refreshToken?: string | null;
  accountId: string;
}

interface FetchPostMetricsOptions {
  platform: string;
  providerPostId: string;
  connection: MetricsConnection;
}

type JsonObject = Record<string, unknown>;

function objectValue(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

async function fetchJson(
  input: string,
  init?: RequestInit
): Promise<JsonObject> {
  const response = await fetch(input, init);
  const data = objectValue(
    await response.json().catch(() => ({ error: "Invalid JSON response" }))
  );

  if (!response.ok || data.error) {
    const errorObject = objectValue(data.error);
    const message =
      (typeof errorObject.message === "string" && errorObject.message) ||
      (typeof data.message === "string" && data.message) ||
      `Provider request failed with HTTP ${response.status}`;
    throw new Error(message);
  }

  return data;
}

function lastInsightValue(
  data: JsonObject,
  metricName: string
): number {
  const rows = Array.isArray(data.data) ? data.data : [];
  const row = rows.find(
    (item) =>
      item &&
      typeof item === "object" &&
      !Array.isArray(item) &&
      (item as JsonObject).name === metricName
  ) as JsonObject | undefined;

  if (!row || !Array.isArray(row.values) || row.values.length === 0) return 0;
  const latest = objectValue(row.values[row.values.length - 1]);
  return typeof latest.value === "number"
    ? latest.value
    : Number(latest.value ?? 0) || 0;
}

function oauthEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}

function twitterAuthHeader(
  url: string,
  query: Record<string, string>,
  connection: MetricsConnection
): string {
  const apiKey = process.env.TWITTER_API_KEY ?? "";
  const apiSecret = process.env.TWITTER_API_SECRET ?? "";
  const accessTokenSecret = connection.refreshToken ?? "";

  if (!apiKey || !apiSecret || !connection.accessToken || !accessTokenSecret) {
    throw new Error("X analytics credentials are incomplete");
  }

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: apiKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: connection.accessToken,
    oauth_version: "1.0",
  };

  const signatureParams = { ...query, ...oauthParams };
  const normalized = Object.keys(signatureParams)
    .sort()
    .map(
      (key) =>
        `${oauthEncode(key)}=${oauthEncode(signatureParams[key])}`
    )
    .join("&");

  const signatureBase = [
    "GET",
    oauthEncode(url),
    oauthEncode(normalized),
  ].join("&");

  const signingKey = `${oauthEncode(apiSecret)}&${oauthEncode(
    accessTokenSecret
  )}`;

  oauthParams.oauth_signature = crypto
    .createHmac("sha1", signingKey)
    .update(signatureBase)
    .digest("base64");

  return (
    "OAuth " +
    Object.keys(oauthParams)
      .sort()
      .map(
        (key) =>
          `${oauthEncode(key)}="${oauthEncode(oauthParams[key])}"`
      )
      .join(", ")
  );
}

async function fetchTwitterMetrics(
  providerPostId: string,
  connection: MetricsConnection
): Promise<NormalizedPostMetrics> {
  const baseUrl = `https://api.twitter.com/2/tweets/${encodeURIComponent(
    providerPostId
  )}`;
  const query = { "tweet.fields": "public_metrics" };
  const url = `${baseUrl}?tweet.fields=public_metrics`;
  const data = await fetchJson(url, {
    headers: {
      Authorization: twitterAuthHeader(baseUrl, query, connection),
    },
  });

  const metrics = objectValue(objectValue(data.data).public_metrics);
  return normalizePostMetrics({
    impressions: metrics.impression_count,
    likes: metrics.like_count,
    comments: metrics.reply_count,
    shares:
      Number(metrics.retweet_count ?? 0) +
      Number(metrics.quote_count ?? 0),
    saves: metrics.bookmark_count,
  });
}

async function fetchFacebookMetrics(
  providerPostId: string,
  connection: MetricsConnection
): Promise<NormalizedPostMetrics> {
  const params = new URLSearchParams({
    fields:
      "shares,comments.limit(0).summary(true),reactions.limit(0).summary(true),insights.metric(post_impressions,post_impressions_unique,post_clicks)",
    access_token: connection.accessToken,
  });
  const data = await fetchJson(
    `https://graph.facebook.com/v19.0/${encodeURIComponent(
      providerPostId
    )}?${params.toString()}`
  );

  const comments = objectValue(data.comments);
  const reactions = objectValue(data.reactions);
  const shares = objectValue(data.shares);

  return normalizePostMetrics({
    impressions: lastInsightValue(
      objectValue(data.insights),
      "post_impressions"
    ),
    reach: lastInsightValue(
      objectValue(data.insights),
      "post_impressions_unique"
    ),
    clicks: lastInsightValue(objectValue(data.insights), "post_clicks"),
    likes: objectValue(reactions.summary).total_count,
    comments: objectValue(comments.summary).total_count,
    shares: shares.count,
  });
}

async function fetchInstagramMetrics(
  providerPostId: string,
  connection: MetricsConnection
): Promise<NormalizedPostMetrics> {
  const basicParams = new URLSearchParams({
    fields: "like_count,comments_count",
    access_token: connection.accessToken,
  });
  const basic = await fetchJson(
    `https://graph.facebook.com/v19.0/${encodeURIComponent(
      providerPostId
    )}?${basicParams.toString()}`
  );

  const metrics = emptyPostMetrics();
  metrics.likes = Number(basic.like_count ?? 0) || 0;
  metrics.comments = Number(basic.comments_count ?? 0) || 0;

  const insightParams = new URLSearchParams({
    metric: "reach,impressions,saved,shares",
    access_token: connection.accessToken,
  });

  try {
    const insights = await fetchJson(
      `https://graph.facebook.com/v19.0/${encodeURIComponent(
        providerPostId
      )}/insights?${insightParams.toString()}`
    );
    metrics.reach = lastInsightValue(insights, "reach");
    metrics.impressions = lastInsightValue(insights, "impressions");
    metrics.saves = lastInsightValue(insights, "saved");
    metrics.shares = lastInsightValue(insights, "shares");
  } catch {
    // Some media/account permission combinations expose only basic engagement.
    // Keep the available likes/comments instead of discarding the refresh.
  }

  return normalizePostMetrics(metrics);
}

async function fetchLinkedInMetrics(
  providerPostId: string,
  connection: MetricsConnection
): Promise<NormalizedPostMetrics> {
  const version = process.env.LINKEDIN_VERSION ?? "202609";
  const data = await fetchJson(
    `https://api.linkedin.com/rest/socialActions/${encodeURIComponent(
      providerPostId
    )}`,
    {
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        "Linkedin-Version": version,
        "X-Restli-Protocol-Version": "2.0.0",
      },
    }
  );

  const likes = objectValue(data.likesSummary);
  const comments = objectValue(data.commentsSummary);

  return normalizePostMetrics({
    likes: likes.aggregatedTotalLikes ?? likes.totalLikes,
    comments:
      comments.aggregatedTotalComments ??
      comments.totalFirstLevelComments,
  });
}

export async function fetchPostMetrics({
  platform,
  providerPostId,
  connection,
}: FetchPostMetricsOptions): Promise<NormalizedPostMetrics> {
  switch (platform) {
    case "twitter":
      return fetchTwitterMetrics(providerPostId, connection);
    case "facebook":
      return fetchFacebookMetrics(providerPostId, connection);
    case "instagram":
      return fetchInstagramMetrics(providerPostId, connection);
    case "linkedin":
      return fetchLinkedInMetrics(providerPostId, connection);
    default:
      throw new Error(`Analytics are not supported for ${platform}`);
  }
}

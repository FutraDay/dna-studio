export interface NormalizedPostMetrics {
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  clicks: number;
  saves: number;
}

export interface AggregatePostMetrics extends NormalizedPostMetrics {
  engagements: number;
  engagementRate: number;
}

const metricKeys: Array<keyof NormalizedPostMetrics> = [
  "impressions",
  "reach",
  "likes",
  "comments",
  "shares",
  "clicks",
  "saves",
];

export function emptyPostMetrics(): NormalizedPostMetrics {
  return {
    impressions: 0,
    reach: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    clicks: 0,
    saves: 0,
  };
}

export function asNonNegativeInt(value: unknown): number {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : 0;

  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.max(0, Math.round(number));
}

export function normalizePostMetrics(
  input: Partial<Record<keyof NormalizedPostMetrics, unknown>>
): NormalizedPostMetrics {
  const normalized = emptyPostMetrics();

  for (const key of metricKeys) {
    normalized[key] = asNonNegativeInt(input[key]);
  }

  return normalized;
}

export function engagementCount(metrics: NormalizedPostMetrics): number {
  return (
    metrics.likes +
    metrics.comments +
    metrics.shares +
    metrics.clicks +
    metrics.saves
  );
}

export function engagementRate(metrics: NormalizedPostMetrics): number {
  if (metrics.impressions <= 0) return 0;
  return Number(
    ((engagementCount(metrics) / metrics.impressions) * 100).toFixed(2)
  );
}

export function aggregatePostMetrics(
  metrics: NormalizedPostMetrics[]
): AggregatePostMetrics {
  const total = emptyPostMetrics();

  for (const item of metrics) {
    for (const key of metricKeys) {
      total[key] += item[key];
    }
  }

  return {
    ...total,
    engagements: engagementCount(total),
    engagementRate: engagementRate(total),
  };
}

export function extractProviderPostId(
  result: unknown,
  platform?: string
): string | null {
  if (!result || typeof result !== "object") return null;

  const object = result as Record<string, unknown>;
  const directCandidates =
    platform === "facebook"
      ? [
          object.post_id,
          object.postId,
          object.id,
          object.urn,
          object.activity,
        ]
      : [
          object.id,
          object.postId,
          object.post_id,
          object.urn,
          object.activity,
        ];

  for (const candidate of directCandidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  const data = object.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const nested = data as Record<string, unknown>;
    for (const candidate of [
      nested.id,
      nested.postId,
      nested.post_id,
      nested.urn,
      nested.activity,
    ]) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }
  }

  return null;
}

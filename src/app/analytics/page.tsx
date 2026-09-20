"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  BarChart3,
  CheckCircle2,
  Eye,
  FlaskConical,
  Gauge,
  Heart,
  Link2Off,
  Loader2,
  MousePointerClick,
  RefreshCw,
} from "lucide-react";

interface MetricSet {
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  clicks: number;
  saves: number;
  engagements: number;
  engagementRate: number;
}

interface AnalyticsPost {
  id: string;
  platform: string;
  caption: string;
  publishedAt: string | null;
  providerPostId: string | null;
  campaignId: string;
  campaignGoal: string;
  brand: { id: string; name: string };
  experimentId: string | null;
  variantLabel: string | null;
  isPreferredVariant: boolean;
  tracked: boolean;
  lastSyncedAt: string | null;
  metrics: MetricSet;
}

interface AnalyticsData {
  brands: Array<{ id: string; name: string }>;
  activeBrandId: string | null;
  summary: MetricSet & {
    publishedPosts: number;
    trackedPosts: number;
    refreshablePosts: number;
    missingProviderPostId: number;
    lastSyncedAt: string | null;
  };
  platforms: Array<
    MetricSet & {
      platform: string;
      posts: number;
      trackedPosts: number;
    }
  >;
  experiments: Array<{
    id: string;
    goal: string;
    brand: { id: string; name: string };
    variants: Array<
      MetricSet & {
        campaignId: string;
        label: string;
        preferred: boolean;
        posts: number;
        trackedPosts: number;
      }
    >;
  }>;
  posts: AnalyticsPost[];
}

interface RefreshResult {
  attempted: number;
  refreshed: number;
  skipped: number;
  failed: number;
}

const emptyData: AnalyticsData = {
  brands: [],
  activeBrandId: null,
  summary: {
    publishedPosts: 0,
    trackedPosts: 0,
    refreshablePosts: 0,
    missingProviderPostId: 0,
    lastSyncedAt: null,
    impressions: 0,
    reach: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    clicks: 0,
    saves: 0,
    engagements: 0,
    engagementRate: 0,
  },
  platforms: [],
  experiments: [],
  posts: [],
};

const platformLabels: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  twitter: "X",
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDate(value: string | null): string {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData>(emptyData);
  const [brandId, setBrandId] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState<RefreshResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = useCallback(async (selectedBrandId = brandId) => {
    setError(null);
    const query = selectedBrandId
      ? `?brandId=${encodeURIComponent(selectedBrandId)}`
      : "";
    const response = await fetch(`/api/analytics${query}`);
    if (!response.ok) {
      setError("Couldn’t load analytics.");
      return false;
    }
    setData(await response.json());
    return true;
  }, [brandId]);

  useEffect(() => {
    loadAnalytics("")
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBrandChange = async (nextBrandId: string) => {
    setBrandId(nextBrandId);
    setLoading(true);
    await loadAnalytics(nextBrandId);
    setLoading(false);
  };

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshResult(null);
    setError(null);

    try {
      const response = await fetch("/api/analytics/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(brandId ? { brandId } : {}),
      });

      if (!response.ok) {
        setError("Metric refresh failed. Existing analytics were preserved.");
        return;
      }

      setRefreshResult(await response.json());
      await loadAnalytics();
    } finally {
      setRefreshing(false);
    }
  };

  const maxPlatformImpressions = useMemo(
    () => Math.max(1, ...data.platforms.map((item) => item.impressions)),
    [data.platforms]
  );

  if (loading) {
    return (
      <AppShell>
        <div className="max-w-7xl mx-auto min-h-[60vh] flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-accent animate-spin" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5 mb-8">
          <div>
            <div className="flex items-center gap-2 text-xs text-accent mb-3">
              <BarChart3 className="w-4 h-4" />
              Performance
            </div>
            <h1 className="text-3xl font-[family-name:var(--font-heading)] italic mb-2">
              Analytics
            </h1>
            <p className="text-sm text-muted max-w-2xl">
              Track published post performance, compare platforms and measure
              A/B campaign variants from one place.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={brandId}
              onChange={(event) => handleBrandChange(event.target.value)}
              aria-label="Filter analytics by brand"
              className="min-w-48 rounded-lg border border-border bg-card px-3.5 py-2 text-sm text-foreground outline-none focus:border-accent/60"
            >
              <option value="">All brands</option>
              {data.brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
            <Button
              variant="secondary"
              onClick={handleRefresh}
              loading={refreshing}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh metrics · No AI credits
            </Button>
          </div>
        </div>

        {error && (
          <div className="mb-5 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        {refreshResult && (
          <div className="mb-5 rounded-lg border border-accent/20 bg-accent-muted px-4 py-3 text-xs text-accent">
            Refresh complete: {refreshResult.refreshed} updated,{" "}
            {refreshResult.skipped} skipped, {refreshResult.failed} failed.
            Existing snapshots were preserved.
          </div>
        )}

        {data.summary.missingProviderPostId > 0 && (
          <div className="mb-5 flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3">
            <Link2Off className="w-4 h-4 text-muted mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium">
                {data.summary.missingProviderPostId} older published{" "}
                {data.summary.missingProviderPostId === 1 ? "post" : "posts"} cannot
                be refreshed automatically.
              </p>
              <p className="text-[11px] text-muted mt-1">
                DNA Studio now stores provider post IDs automatically for future
                publishes. Older posts remain listed but may not have live metrics.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-8">
          <Card className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted mb-3">
              <Eye className="w-3.5 h-3.5" />
              Impressions
            </div>
            <p className="text-2xl font-semibold">
              {formatNumber(data.summary.impressions)}
            </p>
            <p className="text-[11px] text-muted mt-1">
              Reach {formatNumber(data.summary.reach)}
            </p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted mb-3">
              <Heart className="w-3.5 h-3.5" />
              Engagements
            </div>
            <p className="text-2xl font-semibold">
              {formatNumber(data.summary.engagements)}
            </p>
            <p className="text-[11px] text-muted mt-1">
              Likes, comments, shares, clicks and saves
            </p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted mb-3">
              <Gauge className="w-3.5 h-3.5" />
              Engagement rate
            </div>
            <p className="text-2xl font-semibold">
              {data.summary.engagementRate.toFixed(2)}%
            </p>
            <p className="text-[11px] text-muted mt-1">
              Engagements ÷ impressions
            </p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted mb-3">
              <MousePointerClick className="w-3.5 h-3.5" />
              Tracking coverage
            </div>
            <p className="text-2xl font-semibold">
              {data.summary.trackedPosts}/{data.summary.publishedPosts}
            </p>
            <p className="text-[11px] text-muted mt-1">
              Last sync {formatDate(data.summary.lastSyncedAt)}
            </p>
          </Card>
        </div>

        {data.summary.publishedPosts === 0 ? (
          <Card className="p-10 text-center">
            <BarChart3 className="w-8 h-8 text-muted mx-auto mb-4" />
            <h2 className="text-base font-semibold">No published posts yet</h2>
            <p className="text-sm text-muted mt-2 max-w-md mx-auto">
              Analytics begins after a campaign post is published. Draft and
              scheduled posts are intentionally excluded from performance totals.
            </p>
          </Card>
        ) : (
          <div className="space-y-8">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <Card className="p-5">
                <div className="mb-5">
                  <h2 className="text-sm font-semibold">Platform performance</h2>
                  <p className="text-xs text-muted mt-1">
                    Latest stored snapshot for each published post.
                  </p>
                </div>

                <div className="space-y-5">
                  {data.platforms.map((platform) => {
                    const width =
                      platform.impressions > 0
                        ? Math.max(
                            4,
                            (platform.impressions /
                              maxPlatformImpressions) *
                              100
                          )
                        : 0;

                    return (
                      <div key={platform.platform}>
                        <div className="flex items-center justify-between gap-4 mb-2">
                          <div>
                            <p className="text-sm font-medium">
                              {platformLabels[platform.platform] ??
                                platform.platform}
                            </p>
                            <p className="text-[11px] text-muted">
                              {platform.trackedPosts}/{platform.posts} tracked
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium">
                              {formatNumber(platform.impressions)} impressions
                            </p>
                            <p className="text-[11px] text-muted">
                              {platform.engagementRate.toFixed(2)}% engagement
                            </p>
                          </div>
                        </div>
                        <div className="h-1.5 rounded-full bg-border overflow-hidden">
                          <div
                            className="h-full rounded-full bg-accent"
                            style={{ width: `${width}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              <Card className="p-5">
                <div className="mb-5">
                  <div className="flex items-center gap-2">
                    <FlaskConical className="w-4 h-4 text-accent" />
                    <h2 className="text-sm font-semibold">A/B performance</h2>
                  </div>
                  <p className="text-xs text-muted mt-1">
                    Measured results stay separate from the manually preferred
                    variant.
                  </p>
                </div>

                {data.experiments.length === 0 ? (
                  <div className="min-h-48 flex items-center justify-center text-center">
                    <div>
                      <p className="text-sm font-medium">
                        No published A/B variants yet
                      </p>
                      <p className="text-xs text-muted mt-2 max-w-sm">
                        Create Variant B from a campaign, publish the variants,
                        then refresh metrics here to compare them.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {data.experiments.slice(0, 4).map((experiment) => (
                      <div
                        key={experiment.id}
                        className="rounded-lg border border-border p-3"
                      >
                        <div className="mb-3">
                          <p className="text-xs font-medium">
                            {experiment.brand.name}
                          </p>
                          <p className="text-[11px] text-muted line-clamp-1 mt-0.5">
                            {experiment.goal}
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {experiment.variants.map((variant) => (
                            <div
                              key={variant.campaignId}
                              className="rounded-lg bg-background/40 border border-border p-3"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold">
                                  Variant {variant.label}
                                </span>
                                {variant.preferred && (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
                                )}
                              </div>
                              <p className="text-lg font-semibold mt-2">
                                {variant.engagementRate.toFixed(2)}%
                              </p>
                              <p className="text-[10px] text-muted">
                                {formatNumber(variant.impressions)} impressions ·{" "}
                                {variant.trackedPosts}/{variant.posts} tracked
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            <Card className="p-0 overflow-hidden">
              <div className="p-5 border-b border-border">
                <h2 className="text-sm font-semibold">Published posts</h2>
                <p className="text-xs text-muted mt-1">
                  Most recent posts with their latest stored performance snapshot.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left">
                  <thead>
                    <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted">
                      <th className="px-5 py-3 font-medium">Post</th>
                      <th className="px-4 py-3 font-medium">Platform</th>
                      <th className="px-4 py-3 font-medium">Impressions</th>
                      <th className="px-4 py-3 font-medium">Engagements</th>
                      <th className="px-4 py-3 font-medium">Rate</th>
                      <th className="px-4 py-3 font-medium">Synced</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.posts.slice(0, 50).map((post) => (
                      <tr
                        key={post.id}
                        className="border-b border-border/70 last:border-0"
                      >
                        <td className="px-5 py-4">
                          <p className="text-xs font-medium max-w-sm line-clamp-2">
                            {post.caption}
                          </p>
                          <p className="text-[10px] text-muted mt-1">
                            {post.brand.name}
                            {post.variantLabel
                              ? ` · Variant ${post.variantLabel}`
                              : ""}
                          </p>
                        </td>
                        <td className="px-4 py-4 text-xs">
                          {platformLabels[post.platform] ?? post.platform}
                        </td>
                        <td className="px-4 py-4 text-xs font-medium">
                          {post.tracked
                            ? formatNumber(post.metrics.impressions)
                            : "—"}
                        </td>
                        <td className="px-4 py-4 text-xs font-medium">
                          {post.tracked
                            ? formatNumber(post.metrics.engagements)
                            : "—"}
                        </td>
                        <td className="px-4 py-4 text-xs">
                          {post.tracked
                            ? `${post.metrics.engagementRate.toFixed(2)}%`
                            : "—"}
                        </td>
                        <td className="px-4 py-4">
                          {post.tracked ? (
                            <span className="text-[10px] text-muted">
                              {formatDate(post.lastSyncedAt)}
                            </span>
                          ) : post.providerPostId ? (
                            <span className="text-[10px] text-muted">
                              Ready to refresh
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted">
                              Provider ID unavailable
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}
      </div>
    </AppShell>
  );
}

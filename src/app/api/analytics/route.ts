import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import {
  aggregatePostMetrics,
  engagementCount,
  engagementRate,
  type NormalizedPostMetrics,
} from "@/lib/analytics/metrics";
import {
  brandAccessWhere,
  campaignAccessWhere,
} from "@/lib/workspaces/access";

function metricsFromSnapshot(
  snapshot:
    | {
        impressions: number;
        reach: number;
        likes: number;
        comments: number;
        shares: number;
        clicks: number;
        saves: number;
      }
    | undefined
): NormalizedPostMetrics {
  return {
    impressions: snapshot?.impressions ?? 0,
    reach: snapshot?.reach ?? 0,
    likes: snapshot?.likes ?? 0,
    comments: snapshot?.comments ?? 0,
    shares: snapshot?.shares ?? 0,
    clicks: snapshot?.clicks ?? 0,
    saves: snapshot?.saves ?? 0,
  };
}

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const url = new URL(request.url);
    const brandId = url.searchParams.get("brandId");

    if (brandId) {
      const brand = await prisma.brand.findFirst({
        where: brandAccessWhere(session.user.id, brandId),
        select: { id: true },
      });
      if (!brand) {
        return NextResponse.json({ error: "Brand not found" }, { status: 404 });
      }
    }

    const [brands, assets] = await Promise.all([
      prisma.brand.findMany({
        where: brandAccessWhere(session.user.id),
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.asset.findMany({
        where: {
          status: "published",
          campaign: {
            ...campaignAccessWhere(session.user.id),
            ...(brandId ? { brandId } : {}),
          },
        },
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        take: 500,
        include: {
          campaign: {
            select: {
              id: true,
              goal: true,
              experimentId: true,
              variantLabel: true,
              isPreferredVariant: true,
              brand: {
                select: { id: true, name: true },
              },
            },
          },
          metrics: {
            orderBy: { fetchedAt: "desc" },
            take: 1,
          },
        },
      }),
    ]);

    const posts = assets.map((asset) => {
      const latest = asset.metrics[0];
      const metrics = metricsFromSnapshot(latest);

      return {
        id: asset.id,
        platform: asset.platform,
        caption: asset.caption,
        status: asset.status,
        publishedAt: asset.publishedAt,
        providerPostId: asset.providerPostId,
        campaignId: asset.campaign.id,
        campaignGoal: asset.campaign.goal,
        brand: asset.campaign.brand,
        experimentId: asset.campaign.experimentId,
        variantLabel: asset.campaign.variantLabel,
        isPreferredVariant: asset.campaign.isPreferredVariant,
        tracked: Boolean(latest),
        lastSyncedAt: latest?.fetchedAt ?? null,
        metrics: {
          ...metrics,
          engagements: engagementCount(metrics),
          engagementRate: engagementRate(metrics),
        },
      };
    });

    const summaryMetrics = aggregatePostMetrics(
      posts.map((post) => post.metrics)
    );
    const trackedPosts = posts.filter((post) => post.tracked);
    const refreshablePosts = posts.filter((post) => post.providerPostId);
    const lastSyncedAt =
      trackedPosts
        .map((post) => post.lastSyncedAt)
        .filter((date): date is Date => Boolean(date))
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

    const platformIds = ["instagram", "facebook", "linkedin", "twitter"];
    const platforms = platformIds
      .map((platform) => {
        const platformPosts = posts.filter(
          (post) => post.platform === platform
        );
        if (platformPosts.length === 0) return null;

        const metrics = aggregatePostMetrics(
          platformPosts.map((post) => post.metrics)
        );

        return {
          platform,
          posts: platformPosts.length,
          trackedPosts: platformPosts.filter((post) => post.tracked).length,
          ...metrics,
        };
      })
      .filter(Boolean);

    const experimentMap = new Map<
      string,
      {
        id: string;
        goal: string;
        brand: { id: string; name: string };
        variants: Map<
          string,
          {
            campaignId: string;
            label: string;
            preferred: boolean;
            posts: typeof posts;
          }
        >;
      }
    >();

    for (const post of posts) {
      if (!post.experimentId || !post.variantLabel) continue;
      let experiment = experimentMap.get(post.experimentId);
      if (!experiment) {
        experiment = {
          id: post.experimentId,
          goal: post.campaignGoal,
          brand: post.brand,
          variants: new Map(),
        };
        experimentMap.set(post.experimentId, experiment);
      }

      let variant = experiment.variants.get(post.campaignId);
      if (!variant) {
        variant = {
          campaignId: post.campaignId,
          label: post.variantLabel,
          preferred: post.isPreferredVariant,
          posts: [],
        };
        experiment.variants.set(post.campaignId, variant);
      }
      variant.posts.push(post);
    }

    const experiments = [...experimentMap.values()].map((experiment) => ({
      id: experiment.id,
      goal: experiment.goal,
      brand: experiment.brand,
      variants: [...experiment.variants.values()]
        .map((variant) => {
          const metrics = aggregatePostMetrics(
            variant.posts.map((post) => post.metrics)
          );
          return {
            campaignId: variant.campaignId,
            label: variant.label,
            preferred: variant.preferred,
            posts: variant.posts.length,
            trackedPosts: variant.posts.filter((post) => post.tracked).length,
            ...metrics,
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label)),
    }));

    return NextResponse.json({
      brands,
      activeBrandId: brandId,
      summary: {
        publishedPosts: posts.length,
        trackedPosts: trackedPosts.length,
        refreshablePosts: refreshablePosts.length,
        missingProviderPostId: posts.length - refreshablePosts.length,
        lastSyncedAt,
        ...summaryMetrics,
      },
      platforms,
      experiments,
      posts,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

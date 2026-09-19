import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { fetchPostMetrics } from "@/lib/analytics/providers";

const refreshSchema = z.object({
  brandId: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = refreshSchema.parse(
      await request.json().catch(() => ({}))
    );

    if (body.brandId) {
      const brand = await prisma.brand.findFirst({
        where: { id: body.brandId, userId: session.user.id },
        select: { id: true },
      });
      if (!brand) {
        return NextResponse.json({ error: "Brand not found" }, { status: 404 });
      }
    }

    const [assets, connections] = await Promise.all([
      prisma.asset.findMany({
        where: {
          status: "published",
          campaign: {
            userId: session.user.id,
            ...(body.brandId ? { brandId: body.brandId } : {}),
          },
        },
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        take: 50,
        select: {
          id: true,
          platform: true,
          providerPostId: true,
        },
      }),
      prisma.socialConnection.findMany({
        where: { userId: session.user.id },
        select: {
          platform: true,
          accessToken: true,
          refreshToken: true,
          accountId: true,
        },
      }),
    ]);

    const connectionByPlatform = new Map(
      connections.map((connection) => [connection.platform, connection])
    );

    const results: Array<{
      assetId: string;
      platform: string;
      status: "refreshed" | "skipped" | "failed";
      reason?: string;
    }> = [];

    let refreshed = 0;
    let skipped = 0;
    let failed = 0;

    for (const asset of assets) {
      if (!asset.providerPostId) {
        skipped += 1;
        results.push({
          assetId: asset.id,
          platform: asset.platform,
          status: "skipped",
          reason: "No provider post ID is stored for this published post",
        });
        continue;
      }

      const connection = connectionByPlatform.get(asset.platform);
      if (!connection) {
        skipped += 1;
        results.push({
          assetId: asset.id,
          platform: asset.platform,
          status: "skipped",
          reason: `No ${asset.platform} connection is available`,
        });
        continue;
      }

      try {
        const metrics = await fetchPostMetrics({
          platform: asset.platform,
          providerPostId: asset.providerPostId,
          connection,
        });

        await prisma.postMetricSnapshot.create({
          data: {
            assetId: asset.id,
            ...metrics,
            source: "provider",
          },
        });

        refreshed += 1;
        results.push({
          assetId: asset.id,
          platform: asset.platform,
          status: "refreshed",
        });
      } catch (error) {
        failed += 1;
        results.push({
          assetId: asset.id,
          platform: asset.platform,
          status: "failed",
          reason:
            error instanceof Error ? error.message : "Metric refresh failed",
        });
      }
    }

    return NextResponse.json({
      attempted: assets.length,
      refreshed,
      skipped,
      failed,
      limit: 50,
      results,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: error.issues },
        { status: 400 }
      );
    }

    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

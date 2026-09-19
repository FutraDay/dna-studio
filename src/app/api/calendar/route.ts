import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

const calendarQuerySchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
  brandId: z.string().min(1).optional(),
  platform: z
    .enum(["instagram", "facebook", "linkedin", "twitter"])
    .optional(),
});

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const url = new URL(request.url);
    const query = calendarQuerySchema.parse({
      start: url.searchParams.get("start"),
      end: url.searchParams.get("end"),
      brandId: url.searchParams.get("brandId") || undefined,
      platform: url.searchParams.get("platform") || undefined,
    });

    const start = new Date(query.start);
    const end = new Date(query.end);

    if (end <= start) {
      return NextResponse.json(
        { error: "End must be after start" },
        { status: 400 }
      );
    }

    const spanMs = end.getTime() - start.getTime();
    if (spanMs > 1000 * 60 * 60 * 24 * 93) {
      return NextResponse.json(
        { error: "Calendar range cannot exceed 93 days" },
        { status: 400 }
      );
    }

    if (query.brandId) {
      const brand = await prisma.brand.findFirst({
        where: { id: query.brandId, userId: session.user.id },
        select: { id: true },
      });

      if (!brand) {
        return NextResponse.json({ error: "Brand not found" }, { status: 404 });
      }
    }

    const [brands, assets] = await Promise.all([
      prisma.brand.findMany({
        where: { userId: session.user.id },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.asset.findMany({
        where: {
          scheduledAt: {
            gte: start,
            lt: end,
          },
          ...(query.platform ? { platform: query.platform } : {}),
          campaign: {
            userId: session.user.id,
            ...(query.brandId ? { brandId: query.brandId } : {}),
          },
        },
        orderBy: { scheduledAt: "asc" },
        select: {
          id: true,
          platform: true,
          caption: true,
          status: true,
          imageUrl: true,
          scheduledAt: true,
          publishedAt: true,
          campaign: {
            select: {
              id: true,
              goal: true,
              variantLabel: true,
              brand: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const now = new Date();
    const posts = assets.map((asset) => ({
      id: asset.id,
      platform: asset.platform,
      caption: asset.caption,
      status: asset.status,
      imageUrl: asset.imageUrl,
      scheduledAt: asset.scheduledAt,
      publishedAt: asset.publishedAt,
      campaignId: asset.campaign.id,
      campaignGoal: asset.campaign.goal,
      variantLabel: asset.campaign.variantLabel,
      brand: asset.campaign.brand,
      overdue:
        asset.status === "scheduled" &&
        Boolean(asset.scheduledAt && asset.scheduledAt < now),
    }));

    return NextResponse.json({
      brands,
      range: {
        start,
        end,
      },
      filters: {
        brandId: query.brandId ?? null,
        platform: query.platform ?? null,
      },
      summary: {
        total: posts.length,
        scheduled: posts.filter((post) => post.status === "scheduled").length,
        published: posts.filter((post) => post.status === "published").length,
        failed: posts.filter((post) => post.status === "failed").length,
        overdue: posts.filter((post) => post.overdue).length,
        upcoming: posts.filter(
          (post) =>
            post.status === "scheduled" &&
            post.scheduledAt &&
            new Date(post.scheduledAt) >= now
        ).length,
      },
      posts,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid calendar query", details: error.issues },
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

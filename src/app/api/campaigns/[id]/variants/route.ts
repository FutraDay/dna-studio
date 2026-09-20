import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { campaignAccessWhere } from "@/lib/workspaces/access";

const preferredSchema = z.object({
  preferredCampaignId: z.string().min(1),
});

const variantSelect = {
  id: true,
  variantLabel: true,
  isPreferredVariant: true,
  createdAt: true,
  updatedAt: true,
} as const;

async function listVariants(userId: string, experimentId: string) {
  return prisma.campaign.findMany({
    where: {
      experimentId,
      ...campaignAccessWhere(userId),
    },
    orderBy: { variantLabel: "asc" },
    select: variantSelect,
  });
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;

    const source = await prisma.campaign.findFirst({
      where: campaignAccessWhere(session.user.id, id),
      include: { assets: true },
    });

    if (!source) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    if (source.experimentId) {
      const existingVariants = await listVariants(
        session.user.id,
        source.experimentId
      );
      const existingB = existingVariants.find(
        (variant) => variant.variantLabel === "B"
      );

      if (existingB) {
        return NextResponse.json({
          created: false,
          experimentId: source.experimentId,
          variant: existingB,
          variants: existingVariants,
        });
      }
    }

    const experimentId = source.experimentId ?? randomUUID();
    const sourceLabel = source.variantLabel ?? "A";

    const sourceUpdate = prisma.campaign.update({
      where: { id: source.id },
      data: {
        experimentId,
        variantLabel: sourceLabel,
        isPreferredVariant: source.isPreferredVariant,
      },
    });

    const variantCreate = prisma.campaign.create({
      data: {
        brandId: source.brandId,
        userId: session.user.id,
        goal: source.goal,
        concepts: source.concepts as Prisma.InputJsonValue,
        experimentId,
        variantLabel: "B",
        isPreferredVariant: false,
        assets: {
          create: source.assets.map((asset) => ({
            platform: asset.platform,
            caption: asset.caption,
            imageUrl: asset.imageUrl,
            imagePrompt: asset.imagePrompt,
            hashtags: asset.hashtags,
            status: "draft",
            scheduledAt: null,
            publishedAt: null,
          })),
        },
      },
      select: variantSelect,
    });

    const [, variant] = await prisma.$transaction([
      sourceUpdate,
      variantCreate,
    ]);

    const variants = await listVariants(session.user.id, experimentId);

    return NextResponse.json(
      {
        created: true,
        experimentId,
        variant,
        variants,
      },
      { status: 201 }
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      try {
        const session = await requireSession();
        const { id } = await params;
        const campaign = await prisma.campaign.findFirst({
          where: campaignAccessWhere(session.user.id, id),
        });
        if (campaign?.experimentId) {
          const variants = await listVariants(
            session.user.id,
            campaign.experimentId
          );
          const variant = variants.find((item) => item.variantLabel === "B");
          if (variant) {
            return NextResponse.json({
              created: false,
              experimentId: campaign.experimentId,
              variant,
              variants,
            });
          }
        }
      } catch {
        // Fall through to the generic error response below.
      }
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const body = preferredSchema.parse(await request.json());

    const current = await prisma.campaign.findFirst({
      where: campaignAccessWhere(session.user.id, id),
      select: { experimentId: true },
    });

    if (!current) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    if (!current.experimentId) {
      return NextResponse.json(
        { error: "Campaign is not part of an A/B test" },
        { status: 409 }
      );
    }

    const preferred = await prisma.campaign.findFirst({
      where: {
        id: body.preferredCampaignId,
        experimentId: current.experimentId,
        ...campaignAccessWhere(session.user.id),
      },
      select: { id: true },
    });

    if (!preferred) {
      return NextResponse.json(
        { error: "Variant not found in this A/B test" },
        { status: 404 }
      );
    }

    await prisma.$transaction([
      prisma.campaign.updateMany({
        where: {
          experimentId: current.experimentId,
          ...campaignAccessWhere(session.user.id),
        },
        data: { isPreferredVariant: false },
      }),
      prisma.campaign.update({
        where: { id: preferred.id },
        data: { isPreferredVariant: true },
      }),
    ]);

    const variants = await listVariants(
      session.user.id,
      current.experimentId
    );

    return NextResponse.json({
      experimentId: current.experimentId,
      preferredCampaignId: preferred.id,
      variants,
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

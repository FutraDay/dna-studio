import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

type ConceptAsset = {
  platform?: string;
  caption?: string;
  [key: string]: unknown;
};

type CampaignConcept = {
  name?: string;
  description?: string;
  theme?: string;
  assets?: ConceptAsset[];
  [key: string]: unknown;
};

function conceptsFromJson(value: Prisma.JsonValue): CampaignConcept[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((concept) => {
    if (!concept || typeof concept !== "object" || Array.isArray(concept)) {
      return [];
    }
    return [concept as unknown as CampaignConcept];
  });
}

function conceptIndexForAsset(
  concepts: CampaignConcept[],
  platform: string,
  caption: string
): number | null {
  const index = concepts.findIndex((concept) =>
    Array.isArray(concept.assets)
      ? concept.assets.some(
          (asset) => asset.platform === platform && asset.caption === caption
        )
      : false
  );
  return index >= 0 ? index : null;
}

function replaceConceptCaption(
  concepts: CampaignConcept[],
  platform: string,
  previousCaption: string,
  nextCaption: string
): { concepts: CampaignConcept[]; changed: boolean } {
  let changed = false;
  const updated = concepts.map((concept) => {
    if (!Array.isArray(concept.assets)) return concept;

    const assets = concept.assets.map((asset) => {
      if (
        !changed &&
        asset.platform === platform &&
        asset.caption === previousCaption
      ) {
        changed = true;
        return { ...asset, caption: nextCaption };
      }
      return asset;
    });

    return { ...concept, assets };
  });

  return { concepts: updated, changed };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;

    const campaign = await prisma.campaign.findFirst({
      where: { id, userId: session.user.id },
      include: {
        brand: true,
        assets: { orderBy: { platform: "asc" } },
      },
    });

    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    const concepts = conceptsFromJson(campaign.concepts);
    const experimentVariants = campaign.experimentId
      ? await prisma.campaign.findMany({
          where: {
            userId: session.user.id,
            experimentId: campaign.experimentId,
          },
          orderBy: { variantLabel: "asc" },
          select: {
            id: true,
            variantLabel: true,
            isPreferredVariant: true,
            createdAt: true,
            updatedAt: true,
          },
        })
      : [];

    return NextResponse.json({
      ...campaign,
      experiment: campaign.experimentId
        ? {
            id: campaign.experimentId,
            preferredCampaignId:
              experimentVariants.find((variant) => variant.isPreferredVariant)
                ?.id ?? null,
            variants: experimentVariants,
          }
        : null,
      assets: campaign.assets.map((asset) => ({
        ...asset,
        conceptIndex: conceptIndexForAsset(
          concepts,
          asset.platform,
          asset.caption
        ),
      })),
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const body = await request.json().catch(() => null);

    if (
      !body ||
      typeof body.assetId !== "string" ||
      typeof body.caption !== "string"
    ) {
      return NextResponse.json(
        { error: "assetId and caption are required" },
        { status: 400 }
      );
    }

    const caption = body.caption.trim();
    if (!caption) {
      return NextResponse.json(
        { error: "Caption cannot be empty" },
        { status: 400 }
      );
    }
    if (caption.length > 5000) {
      return NextResponse.json(
        { error: "Caption is too long" },
        { status: 400 }
      );
    }

    const campaign = await prisma.campaign.findFirst({
      where: { id, userId: session.user.id },
      include: { assets: true },
    });

    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    const asset = campaign.assets.find((item) => item.id === body.assetId);
    if (!asset) {
      return NextResponse.json(
        { error: "Asset not found" },
        { status: 404 }
      );
    }

    if (asset.platform === "twitter" && caption.length > 280) {
      return NextResponse.json(
        { error: "X/Twitter captions must be 280 characters or fewer" },
        { status: 400 }
      );
    }

    const concepts = conceptsFromJson(campaign.concepts);
    const conceptUpdate = replaceConceptCaption(
      concepts,
      asset.platform,
      asset.caption,
      caption
    );

    const operations: Prisma.PrismaPromise<unknown>[] = [
      prisma.asset.update({
        where: { id: asset.id },
        data: { caption },
      }),
    ];

    if (conceptUpdate.changed) {
      operations.push(
        prisma.campaign.update({
          where: { id: campaign.id },
          data: {
            concepts:
              conceptUpdate.concepts as unknown as Prisma.InputJsonValue,
          },
        })
      );
    }

    await prisma.$transaction(operations);

    return NextResponse.json({ ok: true, caption });
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

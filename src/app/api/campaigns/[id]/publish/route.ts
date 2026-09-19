import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { publishToFacebook, publishToInstagram } from "@/lib/social/meta";
import { publishToTwitter } from "@/lib/social/twitter";
import { publishToLinkedIn } from "@/lib/social/linkedin";
import { extractProviderPostId } from "@/lib/analytics/metrics";
import { campaignAccessWhere } from "@/lib/workspaces/access";
import { safeQueueWebhookEvents } from "@/lib/webhooks/queue";
import type { WebhookDispatch } from "@/lib/webhooks/events";

const publishSchema = z.object({
  assetIds: z.array(z.string()),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const body = await request.json();
    const { assetIds } = publishSchema.parse(body);

    const campaign = await prisma.campaign.findFirst({
      where: campaignAccessWhere(session.user.id, id),
      include: {
        assets: { where: { id: { in: assetIds } } },
        brand: {
          select: {
            id: true,
            name: true,
            workspaceId: true,
          },
        },
      },
    });

    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    const results = [];
    const webhookEvents: WebhookDispatch[] = [];

    for (const asset of campaign.assets) {
      const connection = await prisma.socialConnection.findFirst({
        where: { userId: session.user.id, platform: asset.platform },
      });

      if (!connection) {
        const message = `No ${asset.platform} account connected`;
        await prisma.asset.update({
          where: { id: asset.id },
          data: { status: "failed" },
        });
        results.push({
          assetId: asset.id,
          status: "failed",
          error: message,
        });
        webhookEvents.push({
          workspaceId: campaign.brand.workspaceId,
          event: "post.failed",
          data: {
            brand: {
              id: campaign.brand.id,
              name: campaign.brand.name,
            },
            campaign: {
              id: campaign.id,
              goal: campaign.goal,
            },
            post: {
              id: asset.id,
              platform: asset.platform,
              status: "failed",
            },
            error: message,
          },
        });
        continue;
      }

      try {
        let result;

        switch (asset.platform) {
          case "facebook":
            result = await publishToFacebook({
              accessToken: connection.accessToken,
              pageId: connection.accountId,
              message: `${asset.caption}\n\n${asset.hashtags.map((h) => `#${h}`).join(" ")}`,
              imageUrl: asset.imageUrl || undefined,
              platform: "facebook",
            });
            break;

          case "instagram":
            result = await publishToInstagram({
              accessToken: connection.accessToken,
              pageId: connection.accountId,
              message: `${asset.caption}\n\n${asset.hashtags.map((h) => `#${h}`).join(" ")}`,
              imageUrl: asset.imageUrl || undefined,
              platform: "instagram",
            });
            break;

          case "twitter":
            result = await publishToTwitter({
              apiKey: process.env.TWITTER_API_KEY || "",
              apiSecret: process.env.TWITTER_API_SECRET || "",
              accessToken: connection.accessToken,
              accessTokenSecret: connection.refreshToken || "",
              text: `${asset.caption}\n\n${asset.hashtags.map((h) => `#${h}`).join(" ")}`.slice(
                0,
                280
              ),
            });
            break;

          case "linkedin":
            result = await publishToLinkedIn({
              accessToken: connection.accessToken,
              personUrn: connection.accountId,
              text: `${asset.caption}\n\n${asset.hashtags.map((h) => `#${h}`).join(" ")}`,
              imageUrl: asset.imageUrl || undefined,
            });
            break;
        }

        const providerPostId = extractProviderPostId(
          result,
          asset.platform
        );
        const publishedAt = new Date();
        await prisma.asset.update({
          where: { id: asset.id },
          data: {
            status: "published",
            publishedAt,
            ...(providerPostId ? { providerPostId } : {}),
          },
        });

        results.push({
          assetId: asset.id,
          status: "published",
          result,
          providerPostId,
        });
        webhookEvents.push({
          workspaceId: campaign.brand.workspaceId,
          event: "post.published",
          data: {
            brand: {
              id: campaign.brand.id,
              name: campaign.brand.name,
            },
            campaign: {
              id: campaign.id,
              goal: campaign.goal,
            },
            post: {
              id: asset.id,
              platform: asset.platform,
              status: "published",
              providerPostId: providerPostId ?? null,
              publishedAt: publishedAt.toISOString(),
            },
          },
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Publish failed";
        await prisma.asset.update({
          where: { id: asset.id },
          data: { status: "failed" },
        });

        results.push({
          assetId: asset.id,
          status: "failed",
          error: message,
        });
        webhookEvents.push({
          workspaceId: campaign.brand.workspaceId,
          event: "post.failed",
          data: {
            brand: {
              id: campaign.brand.id,
              name: campaign.brand.name,
            },
            campaign: {
              id: campaign.id,
              goal: campaign.goal,
            },
            post: {
              id: asset.id,
              platform: asset.platform,
              status: "failed",
            },
            error: message,
          },
        });
      }
    }

    await safeQueueWebhookEvents(prisma, webhookEvents);

    return NextResponse.json({ results });
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

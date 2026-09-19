import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { publishToFacebook, publishToInstagram } from "@/lib/social/meta";
import { publishToTwitter } from "@/lib/social/twitter";
import { publishToLinkedIn } from "@/lib/social/linkedin";
import { extractProviderPostId } from "@/lib/analytics/metrics";

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
      where: { id, userId: session.user.id },
      include: { assets: { where: { id: { in: assetIds } } } },
    });

    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    const results = [];

    for (const asset of campaign.assets) {
      const connection = await prisma.socialConnection.findFirst({
        where: { userId: session.user.id, platform: asset.platform },
      });

      if (!connection) {
        results.push({
          assetId: asset.id,
          status: "failed",
          error: `No ${asset.platform} account connected`,
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
        await prisma.asset.update({
          where: { id: asset.id },
          data: {
            status: "published",
            publishedAt: new Date(),
            ...(providerPostId ? { providerPostId } : {}),
          },
        });

        results.push({
          assetId: asset.id,
          status: "published",
          result,
          providerPostId,
        });
      } catch (error) {
        await prisma.asset.update({
          where: { id: asset.id },
          data: { status: "failed" },
        });

        results.push({
          assetId: asset.id,
          status: "failed",
          error: error instanceof Error ? error.message : "Publish failed",
        });
      }
    }

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

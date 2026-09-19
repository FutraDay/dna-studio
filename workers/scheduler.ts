import { Worker } from "bullmq";
import { PrismaClient } from "@prisma/client";
import { extractProviderPostId } from "../src/lib/analytics/metrics";

const prisma = new PrismaClient();

const redisUrl = new URL(process.env.REDIS_URL || "redis://localhost:6379");

const worker = new Worker(
  "social-publish",
  async (job) => {
    const { assetId, userId } = job.data;

    console.log(`Publishing asset ${assetId}...`);

    const asset = await prisma.asset.findUnique({
      where: { id: assetId },
      include: { campaign: { include: { brand: true } } },
    });

    if (!asset) {
      throw new Error(`Asset ${assetId} not found`);
    }

    const connection = await prisma.socialConnection.findFirst({
      where: { userId, platform: asset.platform },
    });

    if (!connection) {
      await prisma.asset.update({
        where: { id: assetId },
        data: { status: "failed" },
      });
      throw new Error(`No ${asset.platform} connection for user ${userId}`);
    }

    try {
      let result: unknown;

      // Dynamic import based on platform
      switch (asset.platform) {
        case "facebook": {
          const { publishToFacebook } = await import("../src/lib/social/meta");
          result = await publishToFacebook({
            accessToken: connection.accessToken,
            pageId: connection.accountId,
            message: `${asset.caption}\n\n${asset.hashtags.map((h: string) => `#${h}`).join(" ")}`,
            imageUrl: asset.imageUrl || undefined,
            platform: "facebook",
          });
          break;
        }
        case "instagram": {
          const { publishToInstagram } = await import("../src/lib/social/meta");
          result = await publishToInstagram({
            accessToken: connection.accessToken,
            pageId: connection.accountId,
            message: `${asset.caption}\n\n${asset.hashtags.map((h: string) => `#${h}`).join(" ")}`,
            imageUrl: asset.imageUrl || undefined,
            platform: "instagram",
          });
          break;
        }
        case "twitter": {
          const { publishToTwitter } = await import("../src/lib/social/twitter");
          result = await publishToTwitter({
            apiKey: process.env.TWITTER_API_KEY || "",
            apiSecret: process.env.TWITTER_API_SECRET || "",
            accessToken: connection.accessToken,
            accessTokenSecret: connection.refreshToken || "",
            text: `${asset.caption}\n\n${asset.hashtags.map((h: string) => `#${h}`).join(" ")}`.slice(0, 280),
          });
          break;
        }
        case "linkedin": {
          const { publishToLinkedIn } = await import("../src/lib/social/linkedin");
          result = await publishToLinkedIn({
            accessToken: connection.accessToken,
            personUrn: connection.accountId,
            text: `${asset.caption}\n\n${asset.hashtags.map((h: string) => `#${h}`).join(" ")}`,
            imageUrl: asset.imageUrl || undefined,
          });
          break;
        }
      }

      const providerPostId = extractProviderPostId(
        result,
        asset.platform
      );
      await prisma.asset.update({
        where: { id: assetId },
        data: {
          status: "published",
          publishedAt: new Date(),
          ...(providerPostId ? { providerPostId } : {}),
        },
      });

      console.log(`Asset ${assetId} published successfully`);
    } catch (error) {
      await prisma.asset.update({
        where: { id: assetId },
        data: { status: "failed" },
      });
      throw error;
    }
  },
  {
    connection: {
      host: redisUrl.hostname,
      port: parseInt(redisUrl.port || "6379"),
    },
    concurrency: 5,
  }
);

worker.on("completed", (job) => {
  console.log(`Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);
});

console.log("DNA Studio worker started. Waiting for jobs...");

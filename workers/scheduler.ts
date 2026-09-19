import { Worker } from "bullmq";
import { PrismaClient } from "@prisma/client";
import { extractProviderPostId } from "../src/lib/analytics/metrics";
import { processWebhookDelivery } from "../src/lib/webhooks/worker";
import { safeQueueWebhookEvents } from "../src/lib/webhooks/queue";

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
      const message = `No ${asset.platform} connection for user ${userId}`;
      await prisma.asset.update({
        where: { id: assetId },
        data: { status: "failed" },
      });
      await safeQueueWebhookEvents(prisma, [
        {
          workspaceId: asset.campaign.brand.workspaceId,
          event: "post.failed",
          data: {
            brand: {
              id: asset.campaign.brand.id,
              name: asset.campaign.brand.name,
            },
            campaign: {
              id: asset.campaign.id,
              goal: asset.campaign.goal,
            },
            post: {
              id: asset.id,
              platform: asset.platform,
              status: "failed",
            },
            error: message,
          },
        },
      ]);
      throw new Error(message);
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
      const publishedAt = new Date();
      await prisma.asset.update({
        where: { id: assetId },
        data: {
          status: "published",
          publishedAt,
          ...(providerPostId ? { providerPostId } : {}),
        },
      });

      await safeQueueWebhookEvents(prisma, [
        {
          workspaceId: asset.campaign.brand.workspaceId,
          event: "post.published",
          data: {
            brand: {
              id: asset.campaign.brand.id,
              name: asset.campaign.brand.name,
            },
            campaign: {
              id: asset.campaign.id,
              goal: asset.campaign.goal,
            },
            post: {
              id: asset.id,
              platform: asset.platform,
              status: "published",
              providerPostId: providerPostId ?? null,
              publishedAt: publishedAt.toISOString(),
            },
          },
        },
      ]);

      console.log(`Asset ${assetId} published successfully`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Publish failed";
      await prisma.asset.update({
        where: { id: assetId },
        data: { status: "failed" },
      });
      await safeQueueWebhookEvents(prisma, [
        {
          workspaceId: asset.campaign.brand.workspaceId,
          event: "post.failed",
          data: {
            brand: {
              id: asset.campaign.brand.id,
              name: asset.campaign.brand.name,
            },
            campaign: {
              id: asset.campaign.id,
              goal: asset.campaign.goal,
            },
            post: {
              id: asset.id,
              platform: asset.platform,
              status: "failed",
            },
            error: message,
          },
        },
      ]);
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

const webhookWorker = new Worker(
  "webhook-delivery",
  async (job) => {
    const { deliveryId } = job.data as { deliveryId: string };
    const maxAttempts =
      typeof job.opts.attempts === "number" ? job.opts.attempts : 3;

    await processWebhookDelivery(
      prisma,
      deliveryId,
      job.attemptsMade,
      maxAttempts
    );
  },
  {
    connection: {
      host: redisUrl.hostname,
      port: parseInt(redisUrl.port || "6379"),
    },
    concurrency: 5,
  }
);

webhookWorker.on("completed", (job) => {
  console.log(`Webhook delivery job ${job.id} completed`);
});

webhookWorker.on("failed", (job, err) => {
  console.error(
    `Webhook delivery job ${job?.id} failed:`,
    err.message
  );
});

console.log(
  "DNA Studio worker started. Waiting for publish and webhook jobs..."
);

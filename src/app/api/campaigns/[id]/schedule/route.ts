import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Queue } from "bullmq";
import { campaignAccessWhere } from "@/lib/workspaces/access";
import { safeQueueWebhookEvents } from "@/lib/webhooks/queue";
import type { WebhookDispatch } from "@/lib/webhooks/events";

const scheduleSchema = z.object({
  assetIds: z.array(z.string()),
  scheduledAt: z.string().datetime(),
});

function getQueue() {
  return new Queue("social-publish", {
    connection: {
      host: new URL(process.env.REDIS_URL || "redis://localhost:6379").hostname,
      port: parseInt(new URL(process.env.REDIS_URL || "redis://localhost:6379").port || "6379"),
    },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const body = await request.json();
    const { assetIds, scheduledAt } = scheduleSchema.parse(body);

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

    const scheduledDate = new Date(scheduledAt);
    const delay = scheduledDate.getTime() - Date.now();

    if (delay < 0) {
      return NextResponse.json(
        { error: "Scheduled time must be in the future" },
        { status: 400 }
      );
    }

    const queue = getQueue();
    const webhookEvents: WebhookDispatch[] = [];

    for (const asset of campaign.assets) {
      await queue.add(
        "publish",
        {
          assetId: asset.id,
          campaignId: campaign.id,
          userId: session.user.id,
        },
        { delay, removeOnComplete: true }
      );

      await prisma.asset.update({
        where: { id: asset.id },
        data: { status: "scheduled", scheduledAt: scheduledDate },
      });

      webhookEvents.push({
        workspaceId: campaign.brand.workspaceId,
        event: "post.scheduled",
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
            status: "scheduled",
            scheduledAt: scheduledDate.toISOString(),
          },
        },
      });
    }

    await queue.close();
    await safeQueueWebhookEvents(prisma, webhookEvents);

    return NextResponse.json({
      scheduled: campaign.assets.length,
      scheduledAt: scheduledDate,
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

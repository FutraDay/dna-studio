import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { Queue } from "bullmq";
import type {
  WebhookDispatch,
  WebhookEnvelope,
  WebhookEvent,
} from "./events";

const QUEUE_NAME = "webhook-delivery";
const DELIVERY_ATTEMPTS = 3;

function redisConnection() {
  const redisUrl = new URL(
    process.env.REDIS_URL || "redis://localhost:6379"
  );

  return {
    host: redisUrl.hostname,
    port: parseInt(redisUrl.port || "6379", 10),
  };
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function envelope(
  id: string,
  workspaceId: string,
  event: WebhookEvent,
  data: Record<string, unknown>
): WebhookEnvelope {
  return {
    id,
    version: "1",
    event,
    occurredAt: new Date().toISOString(),
    workspaceId,
    data,
  };
}

interface PendingDelivery {
  id: string;
  webhookId: string;
  event: WebhookEvent;
  payload: WebhookEnvelope;
}

async function persistAndQueue(
  db: PrismaClient,
  deliveries: PendingDelivery[]
): Promise<number> {
  if (deliveries.length === 0) return 0;

  for (const delivery of deliveries) {
    await db.webhookDelivery.create({
      data: {
        id: delivery.id,
        webhookId: delivery.webhookId,
        event: delivery.event,
        payload: asJson(delivery.payload),
        status: "pending",
      },
    });
  }

  const queue = new Queue(QUEUE_NAME, {
    connection: redisConnection(),
  });

  try {
    await queue.addBulk(
      deliveries.map((delivery) => ({
        name: "deliver",
        data: { deliveryId: delivery.id },
        opts: {
          attempts: DELIVERY_ATTEMPTS,
          backoff: {
            type: "exponential",
            delay: 2_000,
          },
          removeOnComplete: 100,
          removeOnFail: 100,
        },
      }))
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Webhook queue unavailable";

    await db.webhookDelivery.updateMany({
      where: {
        id: {
          in: deliveries.map((delivery) => delivery.id),
        },
      },
      data: {
        status: "failed",
        error: message,
      },
    });

    throw error;
  } finally {
    await queue.close();
  }

  return deliveries.length;
}

export async function queueWebhookEvents(
  db: PrismaClient,
  dispatches: WebhookDispatch[]
): Promise<number> {
  if (dispatches.length === 0) return 0;

  const byWorkspace = new Map<string, WebhookDispatch[]>();
  for (const dispatch of dispatches) {
    const current = byWorkspace.get(dispatch.workspaceId) ?? [];
    current.push(dispatch);
    byWorkspace.set(dispatch.workspaceId, current);
  }

  const pending: PendingDelivery[] = [];

  for (const [workspaceId, workspaceDispatches] of byWorkspace) {
    const eventNames = Array.from(
      new Set(workspaceDispatches.map((dispatch) => dispatch.event))
    );

    const endpoints = await db.webhookEndpoint.findMany({
      where: {
        workspaceId,
        enabled: true,
        events: {
          hasSome: eventNames,
        },
      },
      select: {
        id: true,
        events: true,
      },
    });

    for (const dispatch of workspaceDispatches) {
      for (const endpoint of endpoints) {
        if (!endpoint.events.includes(dispatch.event)) continue;

        const id = randomUUID();
        pending.push({
          id,
          webhookId: endpoint.id,
          event: dispatch.event,
          payload: envelope(
            id,
            workspaceId,
            dispatch.event,
            dispatch.data
          ),
        });
      }
    }
  }

  return persistAndQueue(db, pending);
}

export async function safeQueueWebhookEvents(
  db: PrismaClient,
  dispatches: WebhookDispatch[]
): Promise<number> {
  try {
    return await queueWebhookEvents(db, dispatches);
  } catch (error) {
    console.warn(
      "[Webhooks] Could not queue event deliveries:",
      error instanceof Error ? error.message : "Unknown error"
    );
    return 0;
  }
}

export async function queueWebhookTest(
  db: PrismaClient,
  webhookId: string,
  workspaceId: string
): Promise<string> {
  const endpoint = await db.webhookEndpoint.findFirst({
    where: {
      id: webhookId,
      workspaceId,
      enabled: true,
    },
    select: {
      id: true,
      name: true,
      provider: true,
    },
  });

  if (!endpoint) {
    throw new Error("Webhook not found or disabled");
  }

  const id = randomUUID();
  const payload = envelope(id, workspaceId, "webhook.test", {
    message: "DNA Studio webhook test",
    webhook: {
      id: endpoint.id,
      name: endpoint.name,
      provider: endpoint.provider,
    },
  });

  await persistAndQueue(db, [
    {
      id,
      webhookId: endpoint.id,
      event: "webhook.test",
      payload,
    },
  ]);

  return id;
}

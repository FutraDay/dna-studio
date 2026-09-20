import type { PrismaClient } from "@prisma/client";
import { sendWebhook, WebhookHttpError } from "./delivery";
import type { WebhookEnvelope } from "./events";

export async function processWebhookDelivery(
  prisma: PrismaClient,
  deliveryId: string,
  attemptsMade: number,
  maxAttempts: number
): Promise<void> {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: {
      webhook: {
        select: {
          id: true,
          url: true,
          secret: true,
          enabled: true,
        },
      },
    },
  });

  if (!delivery) {
    return;
  }

  if (delivery.status === "delivered") {
    return;
  }

  const attempt = attemptsMade + 1;

  if (!delivery.webhook.enabled) {
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "failed",
        attempts: attempt,
        error: "Webhook is disabled",
      },
    });
    return;
  }

  try {
    const result = await sendWebhook(
      delivery.webhook.url,
      delivery.webhook.secret,
      delivery.payload as unknown as WebhookEnvelope
    );

    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "delivered",
        attempts: attempt,
        responseStatus: result.statusCode,
        error: null,
        deliveredAt: new Date(),
      },
    });
  } catch (error) {
    const finalAttempt = attempt >= maxAttempts;
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: finalAttempt ? "failed" : "pending",
        attempts: attempt,
        responseStatus:
          error instanceof WebhookHttpError
            ? error.statusCode ?? null
            : null,
        error:
          error instanceof Error
            ? error.message
            : "Webhook delivery failed",
      },
    });

    throw error;
  }
}

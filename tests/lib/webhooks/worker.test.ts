import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/webhooks/delivery", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/webhooks/delivery")
  >("@/lib/webhooks/delivery");
  return {
    ...actual,
    sendWebhook: vi.fn(),
  };
});

import { sendWebhook, WebhookHttpError } from "@/lib/webhooks/delivery";
import { processWebhookDelivery } from "@/lib/webhooks/worker";

const send = vi.mocked(sendWebhook);

function makeDb() {
  return {
    webhookDelivery: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };
}

function delivery(overrides: Record<string, unknown> = {}) {
  return {
    id: "delivery_1",
    status: "pending",
    payload: {
      id: "delivery_1",
      version: "1",
      event: "post.published",
      occurredAt: "2026-09-20T00:00:00.000Z",
      workspaceId: "ws_1",
      data: {},
    },
    webhook: {
      id: "hook_1",
      url: "https://hooks.example.com/a",
      secret: "secret",
      enabled: true,
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  send.mockResolvedValue({ statusCode: 204 });
});

describe("processWebhookDelivery", () => {
  it("ignores a deleted delivery", async () => {
    const db = makeDb();
    db.webhookDelivery.findUnique.mockResolvedValue(null as never);

    await processWebhookDelivery(db as never, "missing", 0, 3);

    expect(send).not.toHaveBeenCalled();
    expect(db.webhookDelivery.update).not.toHaveBeenCalled();
  });

  it("does not redeliver a delivery already marked delivered", async () => {
    const db = makeDb();
    db.webhookDelivery.findUnique.mockResolvedValue(
      delivery({ status: "delivered" }) as never
    );

    await processWebhookDelivery(db as never, "delivery_1", 1, 3);

    expect(send).not.toHaveBeenCalled();
  });

  it("marks a disabled endpoint failed without making a network call", async () => {
    const db = makeDb();
    db.webhookDelivery.findUnique.mockResolvedValue(
      delivery({
        webhook: {
          id: "hook_1",
          url: "https://hooks.example.com/a",
          secret: "secret",
          enabled: false,
        },
      }) as never
    );
    db.webhookDelivery.update.mockResolvedValue({} as never);

    await processWebhookDelivery(db as never, "delivery_1", 0, 3);

    expect(send).not.toHaveBeenCalled();
    expect(db.webhookDelivery.update).toHaveBeenCalledWith({
      where: { id: "delivery_1" },
      data: {
        status: "failed",
        attempts: 1,
        error: "Webhook is disabled",
      },
    });
  });

  it("marks a successful delivery complete with the HTTP status", async () => {
    const db = makeDb();
    db.webhookDelivery.findUnique.mockResolvedValue(delivery() as never);
    db.webhookDelivery.update.mockResolvedValue({} as never);

    await processWebhookDelivery(db as never, "delivery_1", 0, 3);

    expect(send).toHaveBeenCalledWith(
      "https://hooks.example.com/a",
      "secret",
      expect.objectContaining({ id: "delivery_1" })
    );
    expect(db.webhookDelivery.update).toHaveBeenCalledWith({
      where: { id: "delivery_1" },
      data: {
        status: "delivered",
        attempts: 1,
        responseStatus: 204,
        error: null,
        deliveredAt: expect.any(Date),
      },
    });
  });

  it("keeps a failed delivery pending while BullMQ still has retries", async () => {
    const db = makeDb();
    db.webhookDelivery.findUnique.mockResolvedValue(delivery() as never);
    db.webhookDelivery.update.mockResolvedValue({} as never);
    send.mockRejectedValue(new WebhookHttpError("HTTP 503", 503));

    await expect(
      processWebhookDelivery(db as never, "delivery_1", 0, 3)
    ).rejects.toThrow("HTTP 503");

    expect(db.webhookDelivery.update).toHaveBeenCalledWith({
      where: { id: "delivery_1" },
      data: {
        status: "pending",
        attempts: 1,
        responseStatus: 503,
        error: "HTTP 503",
      },
    });
  });

  it("marks the final failed attempt permanently failed", async () => {
    const db = makeDb();
    db.webhookDelivery.findUnique.mockResolvedValue(delivery() as never);
    db.webhookDelivery.update.mockResolvedValue({} as never);
    send.mockRejectedValue(new Error("timeout"));

    await expect(
      processWebhookDelivery(db as never, "delivery_1", 2, 3)
    ).rejects.toThrow("timeout");

    expect(db.webhookDelivery.update).toHaveBeenCalledWith({
      where: { id: "delivery_1" },
      data: {
        status: "failed",
        attempts: 3,
        responseStatus: null,
        error: "timeout",
      },
    });
  });
});

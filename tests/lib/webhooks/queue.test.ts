import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addBulk: vi.fn(),
  close: vi.fn(),
  queueCtor: vi.fn(),
}));

vi.mock("bullmq", () => ({
  Queue: function (name: string, options: unknown) {
    mocks.queueCtor(name, options);
    return {
      addBulk: mocks.addBulk,
      close: mocks.close,
    };
  },
}));

import {
  queueWebhookEvents,
  queueWebhookTest,
  safeQueueWebhookEvents,
} from "@/lib/webhooks/queue";

function makeDb() {
  return {
    webhookEndpoint: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    webhookDelivery: {
      create: vi.fn(),
      updateMany: vi.fn(),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.addBulk.mockResolvedValue([]);
  mocks.close.mockResolvedValue(undefined);
});

describe("webhook queue", () => {
  it("does nothing when there are no dispatches", async () => {
    const db = makeDb();

    await expect(
      queueWebhookEvents(db as never, [])
    ).resolves.toBe(0);

    expect(db.webhookEndpoint.findMany).not.toHaveBeenCalled();
    expect(mocks.queueCtor).not.toHaveBeenCalled();
  });

  it("creates one durable delivery for each matching subscription", async () => {
    const db = makeDb();
    db.webhookEndpoint.findMany.mockResolvedValue([
      {
        id: "hook_1",
        events: ["campaign.created", "post.published"],
      },
      {
        id: "hook_2",
        events: ["post.published"],
      },
    ] as never);
    db.webhookDelivery.create.mockResolvedValue({} as never);

    const count = await queueWebhookEvents(db as never, [
      {
        workspaceId: "ws_1",
        event: "campaign.created",
        data: { campaign: { id: "camp_1" } },
      },
      {
        workspaceId: "ws_1",
        event: "post.published",
        data: { post: { id: "post_1" } },
      },
    ]);

    expect(count).toBe(3);
    expect(db.webhookEndpoint.findMany).toHaveBeenCalledTimes(1);
    expect(db.webhookEndpoint.findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "ws_1",
        enabled: true,
        events: {
          hasSome: ["campaign.created", "post.published"],
        },
      },
      select: {
        id: true,
        events: true,
      },
    });
    expect(db.webhookDelivery.create).toHaveBeenCalledTimes(3);
    expect(mocks.addBulk).toHaveBeenCalledOnce();

    const jobs = mocks.addBulk.mock.calls[0][0] as Array<{
      data: { deliveryId: string };
      opts: { attempts: number; backoff: { type: string; delay: number } };
    }>;
    expect(jobs).toHaveLength(3);
    expect(jobs[0].opts).toMatchObject({
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
    });

    const firstCreate = db.webhookDelivery.create.mock.calls[0][0] as {
      data: {
        id: string;
        webhookId: string;
        event: string;
        payload: {
          id: string;
          version: string;
          workspaceId: string;
          event: string;
        };
      };
    };
    expect(firstCreate.data.webhookId).toBe("hook_1");
    expect(firstCreate.data.event).toBe("campaign.created");
    expect(firstCreate.data.payload).toMatchObject({
      id: firstCreate.data.id,
      version: "1",
      workspaceId: "ws_1",
      event: "campaign.created",
    });
  });

  it("uses the configured Redis host and closes the queue", async () => {
    const db = makeDb();
    vi.stubEnv("REDIS_URL", "redis://webhook-redis:6390");
    db.webhookEndpoint.findMany.mockResolvedValue([
      { id: "hook_1", events: ["brand.created"] },
    ] as never);
    db.webhookDelivery.create.mockResolvedValue({} as never);

    await queueWebhookEvents(db as never, [
      {
        workspaceId: "ws_1",
        event: "brand.created",
        data: { brand: { id: "brand_1" } },
      },
    ]);

    expect(mocks.queueCtor).toHaveBeenCalledWith(
      "webhook-delivery",
      {
        connection: {
          host: "webhook-redis",
          port: 6390,
        },
      }
    );
    expect(mocks.close).toHaveBeenCalledOnce();
    vi.unstubAllEnvs();
  });

  it("marks pending deliveries failed when Redis queueing fails", async () => {
    const db = makeDb();
    db.webhookEndpoint.findMany.mockResolvedValue([
      { id: "hook_1", events: ["brand.created"] },
    ] as never);
    db.webhookDelivery.create.mockResolvedValue({} as never);
    mocks.addBulk.mockRejectedValue(new Error("redis down"));

    await expect(
      queueWebhookEvents(db as never, [
        {
          workspaceId: "ws_1",
          event: "brand.created",
          data: {},
        },
      ])
    ).rejects.toThrow("redis down");

    expect(db.webhookDelivery.updateMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: [expect.any(String)],
        },
      },
      data: {
        status: "failed",
        error: "redis down",
      },
    });
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it("safe queueing turns infrastructure failure into a non-blocking zero", async () => {
    const db = makeDb();
    db.webhookEndpoint.findMany.mockRejectedValue(new Error("db down"));

    await expect(
      safeQueueWebhookEvents(db as never, [
        {
          workspaceId: "ws_1",
          event: "campaign.created",
          data: {},
        },
      ])
    ).resolves.toBe(0);
  });

  it("queues a test delivery for an enabled endpoint without requiring a subscription", async () => {
    const db = makeDb();
    db.webhookEndpoint.findFirst.mockResolvedValue({
      id: "hook_1",
      name: "Zapier",
      provider: "zapier",
    } as never);
    db.webhookDelivery.create.mockResolvedValue({} as never);

    const id = await queueWebhookTest(
      db as never,
      "hook_1",
      "ws_1"
    );

    expect(id).toEqual(expect.any(String));
    expect(db.webhookDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id,
        webhookId: "hook_1",
        event: "webhook.test",
        status: "pending",
        payload: expect.objectContaining({
          id,
          event: "webhook.test",
          workspaceId: "ws_1",
        }),
      }),
    });
  });

  it("rejects a test when the endpoint is absent or disabled", async () => {
    const db = makeDb();
    db.webhookEndpoint.findFirst.mockResolvedValue(null as never);

    await expect(
      queueWebhookTest(db as never, "hook_1", "ws_1")
    ).rejects.toThrow("Webhook not found or disabled");
    expect(db.webhookDelivery.create).not.toHaveBeenCalled();
  });
});

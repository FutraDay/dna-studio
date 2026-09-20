import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    webhookEndpoint: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn(),
}));

vi.mock("@/lib/workspaces/access", () => ({
  requireWorkspaceRole: vi.fn(),
}));

vi.mock("@/lib/webhooks/queue", () => ({
  queueWebhookTest: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { requireWorkspaceRole } from "@/lib/workspaces/access";
import { queueWebhookTest } from "@/lib/webhooks/queue";
import {
  GET as listWebhooks,
  POST as createWebhook,
} from "@/app/api/settings/webhooks/route";
import {
  PATCH as updateWebhook,
  DELETE as deleteWebhook,
} from "@/app/api/settings/webhooks/[id]/route";
import { POST as rotateSecret } from "@/app/api/settings/webhooks/[id]/secret/route";
import { POST as testWebhook } from "@/app/api/settings/webhooks/[id]/test/route";

const session = vi.mocked(requireSession);
const requireRole = vi.mocked(requireWorkspaceRole);
const webhook = vi.mocked(prisma.webhookEndpoint);
const queueTest = vi.mocked(queueWebhookTest);

const params = (id = "hook_1") => ({ params: Promise.resolve({ id }) });
const jsonRequest = (url: string, method: string, body: unknown) =>
  new Request("http://localhost" + url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const endpoint = {
  id: "hook_1",
  workspaceId: "ws_1",
  name: "Zapier leads",
  provider: "zapier",
  url: "https://hooks.zapier.com/hooks/catch/1/2",
  events: ["campaign.created", "post.published"],
  enabled: true,
  createdAt: new Date("2026-09-20T00:00:00.000Z"),
  updatedAt: new Date("2026-09-20T00:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();

  session.mockResolvedValue({
    user: { id: "user_1", email: "owner@example.com" },
  } as never);

  requireRole.mockResolvedValue({
    id: "membership_1",
    role: "owner",
    workspace: {
      id: "ws_1",
      name: "Workspace",
      ownerId: "user_1",
    },
  } as never);

  webhook.findMany.mockResolvedValue([
    { ...endpoint, deliveries: [] },
  ] as never);
  webhook.findUnique.mockResolvedValue({
    id: "hook_1",
    workspaceId: "ws_1",
    enabled: true,
  } as never);
  webhook.findFirst.mockResolvedValue({
    id: "hook_1",
    workspaceId: "ws_1",
    enabled: true,
  } as never);
  webhook.create.mockResolvedValue(endpoint as never);
  webhook.update.mockResolvedValue(endpoint as never);
  webhook.delete.mockResolvedValue(endpoint as never);
  queueTest.mockResolvedValue("delivery_1");
});

describe("webhook settings API", () => {
  it("lists webhooks only after owner/admin authorization and never selects the secret", async () => {
    const response = await listWebhooks(
      new Request(
        "http://localhost/api/settings/webhooks?workspaceId=ws_1"
      )
    );

    expect(response.status).toBe(200);
    expect(requireRole).toHaveBeenCalledWith(
      "user_1",
      "ws_1",
      ["owner", "admin"]
    );
    expect(webhook.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: "ws_1" },
        select: expect.not.objectContaining({
          secret: expect.anything(),
        }),
      })
    );
    const body = await response.json();
    expect(body[0]).not.toHaveProperty("secret");
  });

  it("requires workspaceId when listing", async () => {
    const response = await listWebhooks(
      new Request("http://localhost/api/settings/webhooks")
    );
    expect(response.status).toBe(400);
    expect(webhook.findMany).not.toHaveBeenCalled();
  });

  it("does not expose webhook URLs to regular workspace members", async () => {
    requireRole.mockResolvedValue(null as never);

    const response = await listWebhooks(
      new Request(
        "http://localhost/api/settings/webhooks?workspaceId=ws_1"
      )
    );

    expect(response.status).toBe(403);
    expect(webhook.findMany).not.toHaveBeenCalled();
  });

  it("creates a signed Zapier webhook and returns the signing secret once", async () => {
    const response = await createWebhook(
      jsonRequest("/api/settings/webhooks", "POST", {
        workspaceId: "ws_1",
        name: "Zapier leads",
        provider: "zapier",
        url: "https://hooks.zapier.com/hooks/catch/1/2",
        events: [
          "campaign.created",
          "campaign.created",
          "post.published",
        ],
      })
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.signingSecret).toMatch(/^[a-f0-9]{64}$/);
    expect(webhook.create).toHaveBeenCalledWith({
      data: {
        workspaceId: "ws_1",
        name: "Zapier leads",
        provider: "zapier",
        url: "https://hooks.zapier.com/hooks/catch/1/2",
        events: ["campaign.created", "post.published"],
        secret: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
      select: expect.not.objectContaining({
        secret: expect.anything(),
      }),
    });
  });

  it.each([
    ["http://hooks.example.com/a", "must use HTTPS"],
    ["https://localhost/a", "public hostname"],
    ["https://127.0.0.1/a", "private or reserved"],
  ])("rejects unsafe create URL %s", async (url, errorText) => {
    const response = await createWebhook(
      jsonRequest("/api/settings/webhooks", "POST", {
        workspaceId: "ws_1",
        name: "Unsafe hook",
        provider: "custom",
        url,
        events: ["brand.created"],
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining(errorText),
    });
    expect(webhook.create).not.toHaveBeenCalled();
  });

  it("rejects an invalid webhook payload", async () => {
    const response = await createWebhook(
      jsonRequest("/api/settings/webhooks", "POST", {
        workspaceId: "ws_1",
        name: "x",
        provider: "zapier",
        url: "https://hooks.zapier.com/hooks/catch/1/2",
        events: [],
      })
    );

    expect(response.status).toBe(400);
    expect(webhook.create).not.toHaveBeenCalled();
  });

  it("refuses webhook creation for a regular workspace member", async () => {
    requireRole.mockResolvedValue(null as never);

    const response = await createWebhook(
      jsonRequest("/api/settings/webhooks", "POST", {
        workspaceId: "ws_1",
        name: "Zapier leads",
        provider: "zapier",
        url: "https://hooks.zapier.com/hooks/catch/1/2",
        events: ["brand.created"],
      })
    );

    expect(response.status).toBe(403);
    expect(webhook.create).not.toHaveBeenCalled();
  });

  it("returns 500 when webhook creation storage fails", async () => {
    webhook.create.mockRejectedValue(new Error("db down"));

    const response = await createWebhook(
      jsonRequest("/api/settings/webhooks", "POST", {
        workspaceId: "ws_1",
        name: "Zapier leads",
        provider: "zapier",
        url: "https://hooks.zapier.com/hooks/catch/1/2",
        events: ["brand.created"],
      })
    );

    expect(response.status).toBe(500);
  });

  it("updates an endpoint only after checking its workspace role", async () => {
    webhook.findUnique.mockResolvedValue({
      id: "hook_1",
      workspaceId: "ws_1",
    } as never);

    const response = await updateWebhook(
      jsonRequest("/api/settings/webhooks/hook_1", "PATCH", {
        enabled: false,
        events: ["post.failed", "post.failed"],
      }),
      params()
    );

    expect(response.status).toBe(200);
    expect(requireRole).toHaveBeenCalledWith(
      "user_1",
      "ws_1",
      ["owner", "admin"]
    );
    expect(webhook.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "hook_1" },
        data: {
          events: ["post.failed"],
          enabled: false,
        },
      })
    );
  });

  it("updates all editable webhook fields including a validated URL", async () => {
    const response = await updateWebhook(
      jsonRequest("/api/settings/webhooks/hook_1", "PATCH", {
        name: "n8n automation",
        provider: "n8n",
        url: "https://automation.example.com/webhook?id=2",
        events: ["brand.created"],
        enabled: true,
      }),
      params()
    );

    expect(response.status).toBe(200);
    expect(webhook.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          name: "n8n automation",
          provider: "n8n",
          url: "https://automation.example.com/webhook?id=2",
          events: ["brand.created"],
          enabled: true,
        },
      })
    );
  });

  it("rejects an unsafe webhook URL update", async () => {
    const response = await updateWebhook(
      jsonRequest("/api/settings/webhooks/hook_1", "PATCH", {
        url: "http://localhost/hook",
      }),
      params()
    );

    expect(response.status).toBe(400);
    expect(webhook.update).not.toHaveBeenCalled();
  });

  it("rejects an empty webhook update", async () => {
    const response = await updateWebhook(
      jsonRequest("/api/settings/webhooks/hook_1", "PATCH", {}),
      params()
    );

    expect(response.status).toBe(400);
    expect(webhook.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the webhook to update does not exist", async () => {
    webhook.findUnique.mockResolvedValue(null as never);

    const response = await updateWebhook(
      jsonRequest("/api/settings/webhooks/missing", "PATCH", {
        enabled: false,
      }),
      params("missing")
    );

    expect(response.status).toBe(404);
  });

  it("returns 500 when webhook update storage fails", async () => {
    webhook.update.mockRejectedValue(new Error("db down"));

    const response = await updateWebhook(
      jsonRequest("/api/settings/webhooks/hook_1", "PATCH", {
        enabled: false,
      }),
      params()
    );

    expect(response.status).toBe(500);
  });

  it("hides an endpoint from a user who cannot manage its workspace", async () => {
    requireRole.mockResolvedValue(null as never);

    const response = await updateWebhook(
      jsonRequest("/api/settings/webhooks/hook_1", "PATCH", {
        enabled: false,
      }),
      params()
    );

    expect(response.status).toBe(404);
    expect(webhook.update).not.toHaveBeenCalled();
  });

  it("deletes a manageable webhook", async () => {
    webhook.findUnique.mockResolvedValue({
      id: "hook_1",
      workspaceId: "ws_1",
    } as never);

    const response = await deleteWebhook(
      new Request("http://localhost/api/settings/webhooks/hook_1", {
        method: "DELETE",
      }),
      params()
    );

    expect(response.status).toBe(200);
    expect(webhook.delete).toHaveBeenCalledWith({
      where: { id: "hook_1" },
    });
  });

  it("returns 404 when deleting a missing webhook", async () => {
    webhook.findUnique.mockResolvedValue(null as never);

    const response = await deleteWebhook(
      new Request("http://localhost/api/settings/webhooks/missing", {
        method: "DELETE",
      }),
      params("missing")
    );

    expect(response.status).toBe(404);
    expect(webhook.delete).not.toHaveBeenCalled();
  });

  it("returns 500 when webhook deletion fails", async () => {
    webhook.delete.mockRejectedValue(new Error("db down"));

    const response = await deleteWebhook(
      new Request("http://localhost/api/settings/webhooks/hook_1", {
        method: "DELETE",
      }),
      params()
    );

    expect(response.status).toBe(500);
  });

  it("rotates the secret without returning it from ordinary reads", async () => {
    const response = await rotateSecret(
      new Request(
        "http://localhost/api/settings/webhooks/hook_1/secret",
        { method: "POST" }
      ),
      params()
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.signingSecret).toMatch(/^[a-f0-9]{64}$/);
    expect(webhook.update).toHaveBeenCalledWith({
      where: { id: "hook_1" },
      data: {
        secret: body.signingSecret,
      },
    });
  });

  it("returns 404 when rotating a missing webhook secret", async () => {
    webhook.findUnique.mockResolvedValue(null as never);

    const response = await rotateSecret(
      new Request(
        "http://localhost/api/settings/webhooks/missing/secret",
        { method: "POST" }
      ),
      params("missing")
    );

    expect(response.status).toBe(404);
    expect(webhook.update).not.toHaveBeenCalled();
  });

  it("hides secret rotation from a regular workspace member", async () => {
    requireRole.mockResolvedValue(null as never);

    const response = await rotateSecret(
      new Request(
        "http://localhost/api/settings/webhooks/hook_1/secret",
        { method: "POST" }
      ),
      params()
    );

    expect(response.status).toBe(404);
    expect(webhook.update).not.toHaveBeenCalled();
  });

  it("returns 500 when secret rotation storage fails", async () => {
    webhook.update.mockRejectedValue(new Error("db down"));

    const response = await rotateSecret(
      new Request(
        "http://localhost/api/settings/webhooks/hook_1/secret",
        { method: "POST" }
      ),
      params()
    );

    expect(response.status).toBe(500);
  });

  it("queues a test delivery without sending it from the request process", async () => {
    const response = await testWebhook(
      new Request(
        "http://localhost/api/settings/webhooks/hook_1/test",
        { method: "POST" }
      ),
      params()
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      queued: true,
      deliveryId: "delivery_1",
    });
    expect(queueTest).toHaveBeenCalledWith(
      prisma,
      "hook_1",
      "ws_1"
    );
  });

  it("refuses a test for a disabled endpoint", async () => {
    webhook.findUnique.mockResolvedValue({
      id: "hook_1",
      workspaceId: "ws_1",
      enabled: false,
    } as never);

    const response = await testWebhook(
      new Request(
        "http://localhost/api/settings/webhooks/hook_1/test",
        { method: "POST" }
      ),
      params()
    );

    expect(response.status).toBe(409);
    expect(queueTest).not.toHaveBeenCalled();
  });

  it("returns 404 when testing a missing webhook", async () => {
    webhook.findUnique.mockResolvedValue(null as never);

    const response = await testWebhook(
      new Request(
        "http://localhost/api/settings/webhooks/missing/test",
        { method: "POST" }
      ),
      params("missing")
    );

    expect(response.status).toBe(404);
    expect(queueTest).not.toHaveBeenCalled();
  });

  it("hides webhook tests from a regular workspace member", async () => {
    requireRole.mockResolvedValue(null as never);

    const response = await testWebhook(
      new Request(
        "http://localhost/api/settings/webhooks/hook_1/test",
        { method: "POST" }
      ),
      params()
    );

    expect(response.status).toBe(404);
    expect(queueTest).not.toHaveBeenCalled();
  });

  it("returns 500 when the webhook test queue is unavailable", async () => {
    queueTest.mockRejectedValue(new Error("redis down"));

    const response = await testWebhook(
      new Request(
        "http://localhost/api/settings/webhooks/hook_1/test",
        { method: "POST" }
      ),
      params()
    );

    expect(response.status).toBe(500);
  });

  it("returns 500 when listing webhook storage fails", async () => {
    webhook.findMany.mockRejectedValue(new Error("db down"));

    const response = await listWebhooks(
      new Request(
        "http://localhost/api/settings/webhooks?workspaceId=ws_1"
      )
    );

    expect(response.status).toBe(500);
  });

  it("answers 401 when signed out", async () => {
    session.mockRejectedValue(new Error("Unauthorized"));

    expect(
      (
        await listWebhooks(
          new Request(
            "http://localhost/api/settings/webhooks?workspaceId=ws_1"
          )
        )
      ).status
    ).toBe(401);
  });
});

import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  request: vi.fn(),
}));

vi.mock("node:dns", () => ({
  promises: {
    lookup: mocks.lookup,
  },
}));

vi.mock("node:https", () => ({
  default: {
    request: mocks.request,
  },
}));

import {
  isPrivateAddress,
  sendWebhook,
  signWebhookPayload,
  validateWebhookUrl,
  WebhookHttpError,
} from "@/lib/webhooks/delivery";
import type { WebhookEnvelope } from "@/lib/webhooks/events";

function payload(): WebhookEnvelope {
  return {
    id: "delivery_1",
    version: "1",
    event: "campaign.created",
    occurredAt: "2026-09-20T00:00:00.000Z",
    workspaceId: "ws_1",
    data: { campaign: { id: "camp_1" } },
  };
}

function installRequest(statusCode = 200) {
  const requestObject = {
    on: vi.fn().mockReturnThis(),
    setTimeout: vi.fn().mockReturnThis(),
    write: vi.fn().mockReturnThis(),
    end: vi.fn(),
    destroy: vi.fn(),
  };

  mocks.request.mockImplementation(
    (options: Record<string, unknown>, callback: (response: unknown) => void) => {
      const response = {
        statusCode,
        resume: vi.fn(),
        on: vi.fn((event: string, handler: () => void) => {
          if (event === "end") handler();
          return response;
        }),
      };
      callback(response);
      return requestObject;
    }
  );

  return requestObject;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.lookup.mockResolvedValue([
    { address: "93.184.216.34", family: 4 },
  ]);
});

describe("webhook URL safety", () => {
  it.each([
    ["127.0.0.1", true],
    ["10.0.0.1", true],
    ["172.16.1.1", true],
    ["192.168.1.1", true],
    ["169.254.1.1", true],
    ["100.64.0.1", true],
    ["198.51.100.10", true],
    ["203.0.113.10", true],
    ["8.8.8.8", false],
    ["93.184.216.34", false],
    ["::1", true],
    ["fd00::1", true],
    ["fe80::1", true],
    ["2001:db8::1", true],
    ["2606:4700:4700::1111", false],
    ["::ffff:127.0.0.1", true],
  ])("classifies %s private=%s", (address, expected) => {
    expect(isPrivateAddress(address)).toBe(expected);
  });

  it.each([
    ["http://hooks.example.com/a", "must use HTTPS"],
    ["https://localhost/a", "public hostname"],
    ["https://service.internal/a", "public hostname"],
    ["https://127.0.0.1/a", "private or reserved"],
    ["https://user:pass@example.com/a", "embedded credentials"],
  ])("rejects unsafe webhook URL %s", (url, message) => {
    expect(() => validateWebhookUrl(url)).toThrow(message);
  });

  it("accepts a public HTTPS endpoint", () => {
    const url = validateWebhookUrl("https://hooks.example.com/path?x=1");
    expect(url.protocol).toBe("https:");
    expect(url.hostname).toBe("hooks.example.com");
  });
});

describe("webhook signing and delivery", () => {
  it("creates deterministic HMAC signatures", () => {
    expect(signWebhookPayload("secret", "123", '{"ok":true}')).toBe(
      "12f14ade5e7e737164d9ae20ea4e070056a3045b2c8f42f5f216008eae4684dd"
    );
  });

  it("pins the validated public address and sends signed JSON headers", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    const requestObject = installRequest(204);

    await expect(
      sendWebhook(
        "https://hooks.example.com/catch?id=1",
        "secret",
        payload()
      )
    ).resolves.toEqual({ statusCode: 204 });

    expect(mocks.lookup).toHaveBeenCalledWith("hooks.example.com", {
      all: true,
      verbatim: true,
    });

    const options = mocks.request.mock.calls[0][0] as {
      hostname: string;
      path: string;
      headers: Record<string, string | number>;
      lookup: (
        hostname: string,
        options: unknown,
        callback: (
          error: Error | null,
          address: string,
          family: number
        ) => void
      ) => void;
    };

    expect(options.hostname).toBe("hooks.example.com");
    expect(options.path).toBe("/catch?id=1");
    expect(options.headers["X-DNA-Studio-Event"]).toBe(
      "campaign.created"
    );
    expect(options.headers["X-DNA-Studio-Delivery"]).toBe("delivery_1");
    expect(options.headers["X-DNA-Studio-Timestamp"]).toBe("1700000000");
    expect(String(options.headers["X-DNA-Studio-Signature"])).toMatch(
      /^sha256=[a-f0-9]{64}$/
    );

    const pinned = vi.fn();
    options.lookup("hooks.example.com", {}, pinned);
    expect(pinned).toHaveBeenCalledWith(
      null,
      "93.184.216.34",
      4
    );

    expect(requestObject.write).toHaveBeenCalledWith(
      JSON.stringify(payload())
    );
    expect(requestObject.end).toHaveBeenCalledOnce();
    vi.restoreAllMocks();
  });

  it("rejects DNS answers containing a private address before opening HTTPS", async () => {
    mocks.lookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.5", family: 4 },
    ]);

    await expect(
      sendWebhook("https://hooks.example.com/a", "secret", payload())
    ).rejects.toThrow("private or reserved");

    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("does not follow or accept non-2xx responses", async () => {
    installRequest(302);

    const error = await sendWebhook(
      "https://hooks.example.com/a",
      "secret",
      payload()
    ).catch((value) => value);

    expect(error).toBeInstanceOf(WebhookHttpError);
    expect(error.statusCode).toBe(302);
  });
});

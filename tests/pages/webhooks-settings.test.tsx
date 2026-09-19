// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WebhooksSettingsPage from "@/app/settings/webhooks/page";

const ownerWorkspace = {
  id: "ws_1",
  name: "FutraDay",
  role: "owner",
  isOwner: true,
  brandCount: 1,
  members: [],
};

const memberWorkspace = {
  ...ownerWorkspace,
  id: "ws_member",
  role: "member",
  isOwner: false,
};

const endpoint = {
  id: "hook_1",
  workspaceId: "ws_1",
  name: "Zapier leads",
  provider: "zapier",
  url: "https://hooks.zapier.com/hooks/catch/1/2",
  events: ["campaign.created", "post.published"],
  enabled: true,
  createdAt: "2026-09-20T00:00:00.000Z",
  updatedAt: "2026-09-20T00:00:00.000Z",
  deliveries: [
    {
      id: "delivery_1",
      event: "post.published",
      status: "delivered",
      attempts: 1,
      responseStatus: 200,
      error: null,
      deliveredAt: "2026-09-20T00:01:00.000Z",
      createdAt: "2026-09-20T00:00:59.000Z",
    },
  ],
};

function response(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  );
}

afterEach(cleanup);

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("webhook settings page", () => {
  it("loads a manageable workspace and shows configured delivery history", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/workspaces") {
        return response([ownerWorkspace]);
      }
      if (url.startsWith("/api/settings/webhooks?workspaceId=")) {
        return response([endpoint]);
      }
      return response({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<WebhooksSettingsPage />);

    expect(
      await screen.findByRole("heading", { name: "Webhooks" })
    ).toBeInTheDocument();
    expect(await screen.findByText("Zapier leads")).toBeInTheDocument();
    expect(screen.getByText("post.published")).toBeInTheDocument();
    expect(screen.getByText("HTTP 200")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Test" })
    ).toBeEnabled();
  });

  it("creates a Zapier webhook and reveals the signing secret once", async () => {
    const user = userEvent.setup();
    const secret = "a".repeat(64);
    let listCount = 0;

    const fetchMock = vi.fn(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url === "/api/workspaces") {
          return response([ownerWorkspace]);
        }

        if (
          url.startsWith("/api/settings/webhooks?workspaceId=") &&
          (!init?.method || init.method === "GET")
        ) {
          listCount += 1;
          return response(listCount === 1 ? [] : [endpoint]);
        }

        if (
          url === "/api/settings/webhooks" &&
          init?.method === "POST"
        ) {
          return response(
            {
              ...endpoint,
              signingSecret: secret,
            },
            201
          );
        }

        return response({}, 404);
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<WebhooksSettingsPage />);

    await screen.findByText("No webhooks configured for this workspace.");

    await user.type(
      screen.getByLabelText("Webhook name"),
      "Zapier leads"
    );
    await user.type(
      screen.getByLabelText("Webhook URL"),
      "https://hooks.zapier.com/hooks/catch/1/2"
    );
    await user.click(
      screen.getByRole("button", { name: "Add Webhook" })
    );

    expect(
      await screen.findByText("Save this signing secret now")
    ).toBeInTheDocument();
    expect(screen.getByText(secret)).toBeInTheDocument();

    const postCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input) === "/api/settings/webhooks" &&
        init?.method === "POST"
    );
    expect(postCall).toBeTruthy();

    const body = JSON.parse(
      String((postCall?.[1] as RequestInit).body)
    );
    expect(body).toMatchObject({
      workspaceId: "ws_1",
      name: "Zapier leads",
      provider: "zapier",
      url: "https://hooks.zapier.com/hooks/catch/1/2",
    });
    expect(body.events).toHaveLength(5);
  });

  it("does not request sensitive webhook configuration for a regular member", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (String(input) === "/api/workspaces") {
        return response([memberWorkspace]);
      }
      return response({}, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<WebhooksSettingsPage />);

    expect(
      await screen.findByText("Owner or admin access required")
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});

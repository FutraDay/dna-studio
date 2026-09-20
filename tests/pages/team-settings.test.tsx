// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TeamSettingsPage from "@/app/settings/team/page";

const workspace = {
  id: "ws_1",
  name: "FutraDay Team",
  role: "owner",
  isOwner: true,
  brandCount: 2,
  members: [
    {
      id: "membership_owner",
      role: "owner",
      user: {
        id: "user_1",
        name: "Owner",
        email: "owner@example.com",
        image: null,
      },
    },
    {
      id: "membership_2",
      role: "member",
      user: {
        id: "user_2",
        name: "Teammate",
        email: "team@example.com",
        image: null,
      },
    },
  ],
};

const response = (data: unknown, ok = true, status = ok ? 200 : 400) => ({
  ok,
  status,
  json: async () => data,
});

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Team settings page", () => {
  it("renders workspace membership and role information", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response([workspace]))
    );

    render(<TeamSettingsPage />);

    expect(
      await screen.findByRole("heading", { name: "Team workspaces" })
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Owner Workspace", { exact: false })
    ).not.toBeInTheDocument();
    expect(screen.getByText("FutraDay Team", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
    expect(screen.getByText("team@example.com")).toBeInTheDocument();
    expect(screen.getByText(/2 shared brands/i)).toBeInTheDocument();
  });

  it("adds a registered member and reloads workspace data", async () => {
    const user = userEvent.setup();
    let listReads = 0;
    const fetchMock = vi.fn().mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url === "/api/workspaces" && !init?.method) {
          listReads += 1;
          return response([workspace]);
        }

        if (
          url === "/api/workspaces/ws_1/members" &&
          init?.method === "POST"
        ) {
          return response({
            id: "membership_3",
            role: "member",
            user: {
              id: "user_3",
              name: "Another",
              email: "another@example.com",
              image: null,
            },
          });
        }

        throw new Error(`Unexpected request: ${url} ${init?.method ?? "GET"}`);
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<TeamSettingsPage />);

    await user.type(
      await screen.findByRole("textbox", { name: /team member email/i }),
      "another@example.com"
    );
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      expect(listReads).toBe(2);
    });
    expect(
      await screen.findByText("Team member added.")
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/workspaces/ws_1/members",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          email: "another@example.com",
          role: "member",
        }),
      })
    );
  });

  it("creates a new workspace", async () => {
    const user = userEvent.setup();
    let listReads = 0;
    const fetchMock = vi.fn().mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url === "/api/workspaces" && !init?.method) {
          listReads += 1;
          return response([workspace]);
        }

        if (url === "/api/workspaces" && init?.method === "POST") {
          return response(
            {
              id: "ws_2",
              name: "New Team",
              role: "owner",
              isOwner: true,
              brandCount: 0,
              members: [],
            },
            true,
            201
          );
        }

        throw new Error(`Unexpected request: ${url} ${init?.method ?? "GET"}`);
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<TeamSettingsPage />);

    await user.type(
      await screen.findByRole("textbox", { name: /new workspace name/i }),
      "New Team"
    );
    await user.click(screen.getByRole("button", { name: /create/i }));

    await waitFor(() => {
      expect(listReads).toBe(2);
    });
    expect(
      await screen.findByText("Workspace created.")
    ).toBeInTheDocument();
  });

  it("surfaces the register-first error for an unknown email", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url === "/api/workspaces" && !init?.method) {
          return response([workspace]);
        }

        if (
          url === "/api/workspaces/ws_1/members" &&
          init?.method === "POST"
        ) {
          return response(
            {
              error:
                "No DNA Studio account uses that email yet. Ask them to register first.",
            },
            false,
            404
          );
        }

        throw new Error(`Unexpected request: ${url} ${init?.method ?? "GET"}`);
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<TeamSettingsPage />);

    await user.type(
      await screen.findByRole("textbox", { name: /team member email/i }),
      "missing@example.com"
    );
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    expect(
      await screen.findByText(/ask them to register first/i)
    ).toBeInTheDocument();
  });
});

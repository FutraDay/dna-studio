import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    workspace: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    workspaceMember: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db";
import {
  brandAccessWhere,
  campaignAccessWhere,
  ensurePersonalWorkspace,
  requireWorkspaceRole,
} from "@/lib/workspaces/access";

const workspace = vi.mocked(prisma.workspace);
const workspaceMember = vi.mocked(prisma.workspaceMember);
const user = vi.mocked(prisma.user);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("workspace access helpers", () => {
  it("builds brand membership filters with and without a concrete brand id", () => {
    expect(brandAccessWhere("user_1")).toEqual({
      workspace: {
        members: {
          some: { userId: "user_1" },
        },
      },
    });

    expect(brandAccessWhere("user_1", "brand_1")).toEqual({
      id: "brand_1",
      workspace: {
        members: {
          some: { userId: "user_1" },
        },
      },
    });
  });

  it("builds campaign membership filters with and without a campaign id", () => {
    expect(campaignAccessWhere("user_1")).toEqual({
      brand: {
        workspace: {
          members: {
            some: { userId: "user_1" },
          },
        },
      },
    });

    expect(campaignAccessWhere("user_1", "camp_1")).toEqual({
      id: "camp_1",
      brand: {
        workspace: {
          members: {
            some: { userId: "user_1" },
          },
        },
      },
    });
  });

  it("repairs owner membership when a personal workspace already exists", async () => {
    workspace.findFirst.mockResolvedValue({
      id: "ws_1",
      name: "Existing Workspace",
    } as never);
    workspaceMember.upsert.mockResolvedValue({ id: "membership_1" } as never);

    await expect(ensurePersonalWorkspace("user_1")).resolves.toEqual({
      id: "ws_1",
      name: "Existing Workspace",
    });

    expect(workspaceMember.upsert).toHaveBeenCalledWith({
      where: {
        workspaceId_userId: {
          workspaceId: "ws_1",
          userId: "user_1",
        },
      },
      update: { role: "owner" },
      create: {
        workspaceId: "ws_1",
        userId: "user_1",
        role: "owner",
      },
    });
    expect(user.findUnique).not.toHaveBeenCalled();
    expect(workspace.create).not.toHaveBeenCalled();
  });

  it("creates a personal workspace using the user's name", async () => {
    workspace.findFirst.mockResolvedValue(null as never);
    user.findUnique.mockResolvedValue({
      name: "  Eric  ",
      email: "eric@example.com",
    } as never);
    workspace.create.mockResolvedValue({
      id: "ws_new",
      name: "Eric Workspace",
    } as never);

    await expect(ensurePersonalWorkspace("user_1")).resolves.toEqual({
      id: "ws_new",
      name: "Eric Workspace",
    });

    expect(workspace.create).toHaveBeenCalledWith({
      data: {
        name: "Eric Workspace",
        ownerId: "user_1",
        members: {
          create: {
            userId: "user_1",
            role: "owner",
          },
        },
      },
      select: { id: true, name: true },
    });
  });

  it("falls back to the email prefix when the user has no usable name", async () => {
    workspace.findFirst.mockResolvedValue(null as never);
    user.findUnique.mockResolvedValue({
      name: "   ",
      email: "teammate@example.com",
    } as never);
    workspace.create.mockResolvedValue({
      id: "ws_email",
      name: "teammate Workspace",
    } as never);

    await ensurePersonalWorkspace("user_2");

    expect(workspace.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "teammate Workspace",
        }),
      })
    );
  });

  it("uses Personal when both name and email prefix are empty", async () => {
    workspace.findFirst.mockResolvedValue(null as never);
    user.findUnique.mockResolvedValue({
      name: "",
      email: "@example.com",
    } as never);
    workspace.create.mockResolvedValue({
      id: "ws_personal",
      name: "Personal Workspace",
    } as never);

    await ensurePersonalWorkspace("user_3");

    expect(workspace.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Personal Workspace",
        }),
      })
    );
  });

  it("fails clearly if the user no longer exists", async () => {
    workspace.findFirst.mockResolvedValue(null as never);
    user.findUnique.mockResolvedValue(null as never);

    await expect(ensurePersonalWorkspace("missing")).rejects.toThrow(
      "User not found"
    );
    expect(workspace.create).not.toHaveBeenCalled();
  });

  it("returns a membership when its role is allowed", async () => {
    const membership = {
      id: "membership_1",
      role: "admin",
      workspace: {
        id: "ws_1",
        name: "Team",
        ownerId: "owner_1",
      },
    };
    workspaceMember.findUnique.mockResolvedValue(membership as never);

    await expect(
      requireWorkspaceRole("user_1", "ws_1", ["owner", "admin"])
    ).resolves.toEqual(membership);
  });

  it("uses owner/admin as the default allowed roles", async () => {
    const membership = {
      id: "membership_1",
      role: "owner",
      workspace: {
        id: "ws_1",
        name: "Team",
        ownerId: "user_1",
      },
    };
    workspaceMember.findUnique.mockResolvedValue(membership as never);

    await expect(requireWorkspaceRole("user_1", "ws_1")).resolves.toEqual(
      membership
    );
  });

  it("returns null for a missing membership or a disallowed role", async () => {
    workspaceMember.findUnique.mockResolvedValue(null as never);

    await expect(
      requireWorkspaceRole("user_1", "ws_1", ["owner"])
    ).resolves.toBeNull();

    workspaceMember.findUnique.mockResolvedValue({
      id: "membership_2",
      role: "member",
      workspace: {
        id: "ws_1",
        name: "Team",
        ownerId: "owner_1",
      },
    } as never);

    await expect(
      requireWorkspaceRole("user_2", "ws_1", ["owner", "admin"])
    ).resolves.toBeNull();
  });
});

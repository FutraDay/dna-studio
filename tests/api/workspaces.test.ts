import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    workspace: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    workspaceMember: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn(),
}));

vi.mock("@/lib/workspaces/access", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/workspaces/access")
  >("@/lib/workspaces/access");
  return {
    ...actual,
    ensurePersonalWorkspace: vi.fn(),
    requireWorkspaceRole: vi.fn(),
  };
});

import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import {
  ensurePersonalWorkspace,
  requireWorkspaceRole,
} from "@/lib/workspaces/access";
import {
  GET as listWorkspaces,
  POST as createWorkspace,
} from "@/app/api/workspaces/route";
import { PATCH as renameWorkspace } from "@/app/api/workspaces/[id]/route";
import {
  POST as addMember,
  DELETE as removeMember,
} from "@/app/api/workspaces/[id]/members/route";

const session = vi.mocked(requireSession);
const ensure = vi.mocked(ensurePersonalWorkspace);
const requireRole = vi.mocked(requireWorkspaceRole);
const workspace = vi.mocked(prisma.workspace);
const workspaceMember = vi.mocked(prisma.workspaceMember);
const user = vi.mocked(prisma.user);

const params = (id = "ws_1") => ({ params: Promise.resolve({ id }) });
const request = (method: string, body: unknown) =>
  new Request("http://localhost/api/workspaces/ws_1", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();

  session.mockResolvedValue({
    user: { id: "user_1", email: "owner@example.com" },
  } as never);

  ensure.mockResolvedValue({
    id: "ws_1",
    name: "Owner Workspace",
  } as never);

  requireRole.mockResolvedValue({
    id: "membership_owner",
    role: "owner",
    workspace: {
      id: "ws_1",
      name: "Owner Workspace",
      ownerId: "user_1",
    },
  } as never);

  workspaceMember.findMany.mockResolvedValue([
    {
      role: "owner",
      workspace: {
        id: "ws_1",
        name: "Owner Workspace",
        ownerId: "user_1",
        _count: { brands: 2 },
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
        ],
      },
    },
  ] as never);

  workspace.create.mockResolvedValue({
    id: "ws_new",
    name: "Studio Team",
  } as never);

  workspace.update.mockResolvedValue({
    id: "ws_1",
    name: "Renamed Team",
  } as never);

  user.findFirst.mockResolvedValue({
    id: "user_2",
    name: "Teammate",
    email: "team@example.com",
    image: null,
  } as never);

  workspaceMember.upsert.mockResolvedValue({
    id: "membership_2",
    role: "member",
    user: {
      id: "user_2",
      name: "Teammate",
      email: "team@example.com",
      image: null,
    },
  } as never);

  workspaceMember.findFirst.mockResolvedValue({
    id: "membership_2",
    role: "member",
    userId: "user_2",
  } as never);

  workspaceMember.delete.mockResolvedValue({} as never);
});

describe("workspace APIs", () => {
  it("lists every workspace the signed-in user belongs to", async () => {
    const response = await listWorkspaces();

    expect(response.status).toBe(200);
    expect(ensure).toHaveBeenCalledWith("user_1");
    expect(workspaceMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user_1" },
      })
    );
    await expect(response.json()).resolves.toEqual([
      expect.objectContaining({
        id: "ws_1",
        name: "Owner Workspace",
        role: "owner",
        isOwner: true,
        brandCount: 2,
      }),
    ]);
  });

  it("creates a workspace with the creator as owner", async () => {
    const response = await createWorkspace(
      request("POST", { name: "Studio Team" })
    );

    expect(response.status).toBe(201);
    expect(workspace.create).toHaveBeenCalledWith({
      data: {
        name: "Studio Team",
        ownerId: "user_1",
        members: {
          create: {
            userId: "user_1",
            role: "owner",
          },
        },
      },
      select: {
        id: true,
        name: true,
      },
    });
  });

  it("renames a workspace only after owner/admin authorization", async () => {
    const response = await renameWorkspace(
      request("PATCH", { name: "Renamed Team" }),
      params()
    );

    expect(response.status).toBe(200);
    expect(requireRole).toHaveBeenCalledWith(
      "user_1",
      "ws_1",
      ["owner", "admin"]
    );
    expect(workspace.update).toHaveBeenCalledWith({
      where: { id: "ws_1" },
      data: { name: "Renamed Team" },
      select: { id: true, name: true },
    });
  });

  it("adds an existing registered user to a workspace", async () => {
    const response = await addMember(
      request("POST", {
        email: "team@example.com",
        role: "member",
      }),
      params()
    );

    expect(response.status).toBe(200);
    expect(user.findFirst).toHaveBeenCalledWith({
      where: {
        email: {
          equals: "team@example.com",
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
      },
    });
    expect(workspaceMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId_userId: {
            workspaceId: "ws_1",
            userId: "user_2",
          },
        },
        create: {
          workspaceId: "ws_1",
          userId: "user_2",
          role: "member",
        },
      })
    );
  });

  it("does not invent pending invites for an unregistered email", async () => {
    user.findFirst.mockResolvedValue(null as never);

    const response = await addMember(
      request("POST", {
        email: "missing@example.com",
        role: "member",
      }),
      params()
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("register first"),
    });
    expect(workspaceMember.upsert).not.toHaveBeenCalled();
  });

  it("does not let a member manage the team", async () => {
    requireRole.mockResolvedValue(null as never);

    const response = await addMember(
      request("POST", {
        email: "team@example.com",
        role: "member",
      }),
      params()
    );

    expect(response.status).toBe(404);
    expect(user.findFirst).not.toHaveBeenCalled();
  });

  it("never removes the workspace owner", async () => {
    workspaceMember.findFirst.mockResolvedValue({
      id: "membership_owner",
      role: "owner",
      userId: "user_1",
    } as never);

    const response = await removeMember(
      request("DELETE", { memberId: "membership_owner" }),
      params()
    );

    expect(response.status).toBe(400);
    expect(workspaceMember.delete).not.toHaveBeenCalled();
  });

  it("lets an owner remove a regular member", async () => {
    const response = await removeMember(
      request("DELETE", { memberId: "membership_2" }),
      params()
    );

    expect(response.status).toBe(200);
    expect(workspaceMember.delete).toHaveBeenCalledWith({
      where: { id: "membership_2" },
    });
  });

  it("prevents an admin from removing another admin", async () => {
    requireRole.mockResolvedValue({
      id: "membership_admin",
      role: "admin",
      workspace: {
        id: "ws_1",
        name: "Owner Workspace",
        ownerId: "owner_id",
      },
    } as never);
    workspaceMember.findFirst.mockResolvedValue({
      id: "membership_2",
      role: "admin",
      userId: "user_2",
    } as never);

    const response = await removeMember(
      request("DELETE", { memberId: "membership_2" }),
      params()
    );

    expect(response.status).toBe(403);
    expect(workspaceMember.delete).not.toHaveBeenCalled();
  });

  it("answers 401 when signed out", async () => {
    session.mockRejectedValue(new Error("Unauthorized"));

    expect((await listWorkspaces()).status).toBe(401);
  });
});

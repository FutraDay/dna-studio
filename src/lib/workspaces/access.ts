import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type WorkspaceRole = "owner" | "admin" | "member";

export function brandAccessWhere(
  userId: string,
  id?: string
): Prisma.BrandWhereInput {
  return {
    ...(id ? { id } : {}),
    workspace: {
      members: {
        some: { userId },
      },
    },
  };
}

export function campaignAccessWhere(
  userId: string,
  id?: string
): Prisma.CampaignWhereInput {
  return {
    ...(id ? { id } : {}),
    brand: {
      workspace: {
        members: {
          some: { userId },
        },
      },
    },
  };
}

export async function ensurePersonalWorkspace(userId: string) {
  const existing = await prisma.workspace.findFirst({
    where: { ownerId: userId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });

  if (existing) {
    await prisma.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: existing.id,
          userId,
        },
      },
      update: { role: "owner" },
      create: {
        workspaceId: existing.id,
        userId,
        role: "owner",
      },
    });

    return existing;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
  });

  if (!user) {
    throw new Error("User not found");
  }

  const baseName =
    user.name?.trim() || user.email.split("@")[0]?.trim() || "Personal";

  return prisma.workspace.create({
    data: {
      name: `${baseName} Workspace`,
      ownerId: userId,
      members: {
        create: {
          userId,
          role: "owner",
        },
      },
    },
    select: { id: true, name: true },
  });
}

export async function requireWorkspaceRole(
  userId: string,
  workspaceId: string,
  roles: WorkspaceRole[] = ["owner", "admin"]
) {
  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId,
      },
    },
    select: {
      id: true,
      role: true,
      workspace: {
        select: {
          id: true,
          name: true,
          ownerId: true,
        },
      },
    },
  });

  if (
    !membership ||
    !roles.includes(membership.role as WorkspaceRole)
  ) {
    return null;
  }

  return membership;
}

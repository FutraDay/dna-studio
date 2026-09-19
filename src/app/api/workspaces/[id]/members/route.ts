import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { requireWorkspaceRole } from "@/lib/workspaces/access";

const addMemberSchema = z.object({
  email: z.string().trim().email(),
  role: z.enum(["admin", "member"]).default("member"),
});

const removeMemberSchema = z.object({
  memberId: z.string().min(1),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const { email, role } = addMemberSchema.parse(await request.json());

    const permission = await requireWorkspaceRole(
      session.user.id,
      id,
      ["owner", "admin"]
    );

    if (!permission) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    const targetUser = await prisma.user.findFirst({
      where: {
        email: {
          equals: email,
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

    if (!targetUser) {
      return NextResponse.json(
        {
          error:
            "No DNA Studio account uses that email yet. Ask them to register first.",
        },
        { status: 404 }
      );
    }

    if (
      targetUser.id === session.user.id ||
      targetUser.id === permission.workspace.ownerId
    ) {
      return NextResponse.json(
        { error: "The workspace owner is already a member" },
        { status: 400 }
      );
    }

    const membership = await prisma.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: id,
          userId: targetUser.id,
        },
      },
      update: { role },
      create: {
        workspaceId: id,
        userId: targetUser.id,
        role,
      },
      select: {
        id: true,
        role: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    });

    return NextResponse.json(membership);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid member", details: error.issues },
        { status: 400 }
      );
    }

    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const { memberId } = removeMemberSchema.parse(await request.json());

    const permission = await requireWorkspaceRole(
      session.user.id,
      id,
      ["owner", "admin"]
    );

    if (!permission) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    const target = await prisma.workspaceMember.findFirst({
      where: {
        id: memberId,
        workspaceId: id,
      },
      select: {
        id: true,
        role: true,
        userId: true,
      },
    });

    if (!target) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    if (
      target.role === "owner" ||
      target.userId === permission.workspace.ownerId
    ) {
      return NextResponse.json(
        { error: "The workspace owner cannot be removed" },
        { status: 400 }
      );
    }

    if (permission.role === "admin" && target.role === "admin") {
      return NextResponse.json(
        { error: "Only the owner can remove an admin" },
        { status: 403 }
      );
    }

    await prisma.workspaceMember.delete({
      where: { id: target.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid member", details: error.issues },
        { status: 400 }
      );
    }

    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

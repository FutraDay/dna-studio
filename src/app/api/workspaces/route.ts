import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { ensurePersonalWorkspace } from "@/lib/workspaces/access";

const createWorkspaceSchema = z.object({
  name: z.string().trim().min(2).max(80),
});

export async function GET() {
  try {
    const session = await requireSession();
    await ensurePersonalWorkspace(session.user.id);

    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "asc" },
      select: {
        role: true,
        workspace: {
          select: {
            id: true,
            name: true,
            ownerId: true,
            _count: {
              select: { brands: true },
            },
            members: {
              orderBy: { createdAt: "asc" },
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
            },
          },
        },
      },
    });

    return NextResponse.json(
      memberships.map(({ role, workspace }) => ({
        id: workspace.id,
        name: workspace.name,
        role,
        isOwner: workspace.ownerId === session.user.id,
        brandCount: workspace._count.brands,
        members: workspace.members,
      }))
    );
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const { name } = createWorkspaceSchema.parse(await request.json());

    const workspace = await prisma.workspace.create({
      data: {
        name,
        ownerId: session.user.id,
        members: {
          create: {
            userId: session.user.id,
            role: "owner",
          },
        },
      },
      select: {
        id: true,
        name: true,
      },
    });

    return NextResponse.json(
      {
        ...workspace,
        role: "owner",
        isOwner: true,
        brandCount: 0,
        members: [],
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid workspace", details: error.issues },
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

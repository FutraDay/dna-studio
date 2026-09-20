import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { requireWorkspaceRole } from "@/lib/workspaces/access";

const renameSchema = z.object({
  name: z.string().trim().min(2).max(80),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const { name } = renameSchema.parse(await request.json());

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

    const workspace = await prisma.workspace.update({
      where: { id },
      data: { name },
      select: { id: true, name: true },
    });

    return NextResponse.json(workspace);
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

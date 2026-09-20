import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import {
  brandAccessWhere,
  requireWorkspaceRole,
} from "@/lib/workspaces/access";

// Fields a user is allowed to edit. Deliberately excludes `id` and `userId`:
// passing the request body straight to prisma.update let a caller reassign
// their brand to another account by sending {"userId": "..."}.
const updateBrandSchema = z
  .object({
    name: z.string().min(1),
    url: z.string().url(),
    logoUrl: z.string().nullable(),
    colors: z.array(z.string()),
    fonts: z.array(z.string()),
    tone: z.string(),
    industry: z.string(),
    audience: z.string(),
  })
  .partial();

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;

    const brand = await prisma.brand.findFirst({
      where: brandAccessWhere(session.user.id, id),
      include: {
        workspace: { select: { id: true, name: true } },
        campaigns: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    if (!brand) {
      return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }

    return NextResponse.json(brand);
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const data = updateBrandSchema.parse(await request.json());

    const brand = await prisma.brand.findFirst({
      where: brandAccessWhere(session.user.id, id),
    });

    if (!brand) {
      return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }

    const updated = await prisma.brand.update({
      where: { id },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request body", issues: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;

    const brand = await prisma.brand.findFirst({
      where: brandAccessWhere(session.user.id, id),
      select: { id: true, workspaceId: true },
    });

    if (!brand) {
      return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }

    const permission = await requireWorkspaceRole(
      session.user.id,
      brand.workspaceId,
      ["owner", "admin"]
    );

    if (!permission) {
      return NextResponse.json(
        { error: "Owner or admin permission required" },
        { status: 403 }
      );
    }

    await prisma.brand.delete({ where: { id } });

    return NextResponse.json({ success: true });
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

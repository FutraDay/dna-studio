import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { brandAccessWhere } from "@/lib/workspaces/access";

export async function GET() {
  try {
    const session = await requireSession();

    const brands = await prisma.brand.findMany({
      where: brandAccessWhere(session.user.id),
      orderBy: { createdAt: "desc" },
      include: {
        workspace: { select: { id: true, name: true } },
        _count: { select: { campaigns: true } },
      },
    });

    return NextResponse.json(brands);
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

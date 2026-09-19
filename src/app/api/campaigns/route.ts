import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { campaignAccessWhere } from "@/lib/workspaces/access";

export async function GET() {
  try {
    const session = await requireSession();

    const campaigns = await prisma.campaign.findMany({
      where: campaignAccessWhere(session.user.id),
      orderBy: { createdAt: "desc" },
      include: {
        brand: { select: { name: true, colors: true } },
        _count: { select: { assets: true } },
      },
    });

    return NextResponse.json(campaigns);
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

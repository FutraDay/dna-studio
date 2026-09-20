import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireMobileUser } from "@/lib/mobile/auth";
import {
  brandAccessWhere,
  campaignAccessWhere,
} from "@/lib/workspaces/access";

export async function GET(request: Request) {
  try {
    const { user } = await requireMobileUser(request);

    const [memberships, brands, campaigns] = await Promise.all([
      prisma.workspaceMember.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "asc" },
        select: {
          role: true,
          workspace: {
            select: { id: true, name: true, ownerId: true },
          },
        },
      }),
      prisma.brand.findMany({
        where: brandAccessWhere(user.id),
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          name: true,
          url: true,
          logoUrl: true,
          colors: true,
          tone: true,
          industry: true,
          audience: true,
          workspaceId: true,
          updatedAt: true,
          _count: { select: { campaigns: true } },
        },
      }),
      prisma.campaign.findMany({
        where: campaignAccessWhere(user.id),
        orderBy: { updatedAt: "desc" },
        take: 30,
        select: {
          id: true,
          goal: true,
          variantLabel: true,
          isPreferredVariant: true,
          updatedAt: true,
          brand: {
            select: { id: true, name: true, colors: true },
          },
          _count: { select: { assets: true } },
        },
      }),
    ]);

    return NextResponse.json({
      user,
      workspaces: memberships.map((membership) => ({
        ...membership.workspace,
        role: membership.role,
      })),
      brands,
      campaigns,
    });
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

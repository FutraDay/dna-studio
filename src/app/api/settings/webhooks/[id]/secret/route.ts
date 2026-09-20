import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { requireWorkspaceRole } from "@/lib/workspaces/access";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;

    const webhook = await prisma.webhookEndpoint.findUnique({
      where: { id },
      select: {
        id: true,
        workspaceId: true,
      },
    });

    if (!webhook) {
      return NextResponse.json(
        { error: "Webhook not found" },
        { status: 404 }
      );
    }

    const membership = await requireWorkspaceRole(
      session.user.id,
      webhook.workspaceId,
      ["owner", "admin"]
    );

    if (!membership) {
      return NextResponse.json(
        { error: "Webhook not found" },
        { status: 404 }
      );
    }

    const signingSecret = randomBytes(32).toString("hex");

    await prisma.webhookEndpoint.update({
      where: { id },
      data: {
        secret: signingSecret,
      },
    });

    return NextResponse.json({
      id,
      signingSecret,
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

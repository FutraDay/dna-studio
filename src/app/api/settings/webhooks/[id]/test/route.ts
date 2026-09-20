import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { requireWorkspaceRole } from "@/lib/workspaces/access";
import { queueWebhookTest } from "@/lib/webhooks/queue";

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
        enabled: true,
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

    if (!webhook.enabled) {
      return NextResponse.json(
        { error: "Enable this webhook before sending a test" },
        { status: 409 }
      );
    }

    const deliveryId = await queueWebhookTest(
      prisma,
      webhook.id,
      webhook.workspaceId
    );

    return NextResponse.json(
      {
        queued: true,
        deliveryId,
      },
      { status: 202 }
    );
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Could not queue webhook test" },
      { status: 500 }
    );
  }
}

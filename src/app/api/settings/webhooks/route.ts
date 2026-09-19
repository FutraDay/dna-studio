import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { requireWorkspaceRole } from "@/lib/workspaces/access";
import {
  WEBHOOK_EVENTS,
  WEBHOOK_PROVIDERS,
} from "@/lib/webhooks/events";
import { validateWebhookUrl } from "@/lib/webhooks/delivery";

const providerSchema = z.enum(WEBHOOK_PROVIDERS);
const eventSchema = z.enum(WEBHOOK_EVENTS);

const createWebhookSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().trim().min(2).max(80),
  provider: providerSchema,
  url: z.string().trim().min(1),
  events: z.array(eventSchema).min(1),
});

function generateSigningSecret(): string {
  return randomBytes(32).toString("hex");
}

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const workspaceId = new URL(request.url).searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 }
      );
    }

    const membership = await requireWorkspaceRole(
      session.user.id,
      workspaceId,
      ["owner", "admin"]
    );

    if (!membership) {
      return NextResponse.json(
        { error: "Owner or admin permission required" },
        { status: 403 }
      );
    }

    const webhooks = await prisma.webhookEndpoint.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        workspaceId: true,
        name: true,
        provider: true,
        url: true,
        events: true,
        enabled: true,
        createdAt: true,
        updatedAt: true,
        deliveries: {
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            event: true,
            status: true,
            attempts: true,
            responseStatus: true,
            error: true,
            deliveredAt: true,
            createdAt: true,
          },
        },
      },
    });

    return NextResponse.json(webhooks);
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
    const data = createWebhookSchema.parse(await request.json());

    const membership = await requireWorkspaceRole(
      session.user.id,
      data.workspaceId,
      ["owner", "admin"]
    );

    if (!membership) {
      return NextResponse.json(
        { error: "Owner or admin permission required" },
        { status: 403 }
      );
    }

    let url: URL;
    try {
      url = validateWebhookUrl(data.url);
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Invalid webhook URL",
        },
        { status: 400 }
      );
    }

    const signingSecret = generateSigningSecret();
    const webhook = await prisma.webhookEndpoint.create({
      data: {
        workspaceId: data.workspaceId,
        name: data.name,
        provider: data.provider,
        url: url.toString(),
        events: Array.from(new Set(data.events)),
        secret: signingSecret,
      },
      select: {
        id: true,
        workspaceId: true,
        name: true,
        provider: true,
        url: true,
        events: true,
        enabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(
      {
        ...webhook,
        signingSecret,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid webhook", details: error.issues },
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

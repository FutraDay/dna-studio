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

const updateWebhookSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    provider: z.enum(WEBHOOK_PROVIDERS).optional(),
    url: z.string().trim().min(1).optional(),
    events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

async function manageableWebhook(userId: string, id: string) {
  const webhook = await prisma.webhookEndpoint.findUnique({
    where: { id },
    select: {
      id: true,
      workspaceId: true,
    },
  });

  if (!webhook) return null;

  const membership = await requireWorkspaceRole(
    userId,
    webhook.workspaceId,
    ["owner", "admin"]
  );

  if (!membership) return null;

  return webhook;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const data = updateWebhookSchema.parse(await request.json());
    const webhook = await manageableWebhook(session.user.id, id);

    if (!webhook) {
      return NextResponse.json(
        { error: "Webhook not found" },
        { status: 404 }
      );
    }

    let normalizedUrl: string | undefined;
    if (data.url) {
      try {
        normalizedUrl = validateWebhookUrl(data.url).toString();
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
    }

    const updated = await prisma.webhookEndpoint.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.provider !== undefined
          ? { provider: data.provider }
          : {}),
        ...(normalizedUrl !== undefined ? { url: normalizedUrl } : {}),
        ...(data.events !== undefined
          ? { events: Array.from(new Set(data.events)) }
          : {}),
        ...(data.enabled !== undefined
          ? { enabled: data.enabled }
          : {}),
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

    return NextResponse.json(updated);
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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const webhook = await manageableWebhook(session.user.id, id);

    if (!webhook) {
      return NextResponse.json(
        { error: "Webhook not found" },
        { status: 404 }
      );
    }

    await prisma.webhookEndpoint.delete({
      where: { id },
    });

    return NextResponse.json({ ok: true });
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

import { NextResponse } from "next/server";
import { z } from "zod";
import { crawlBrandDNA } from "@/lib/brand-dna/crawler";
import { prisma } from "@/lib/db";
import { requireMobileUser } from "@/lib/mobile/auth";
import {
  ensurePersonalWorkspace,
  requireWorkspaceRole,
} from "@/lib/workspaces/access";
import { safeQueueWebhookEvents } from "@/lib/webhooks/queue";

const analyzeSchema = z.object({
  url: z.string().url(),
  workspaceId: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  try {
    const { user } = await requireMobileUser(request);
    const { url, workspaceId } = analyzeSchema.parse(await request.json());

    const workspace = workspaceId
      ? await requireWorkspaceRole(user.id, workspaceId, ["owner", "admin"])
      : await ensurePersonalWorkspace(user.id);

    if (!workspace) {
      return NextResponse.json(
        { error: "Owner or admin permission required for that workspace" },
        { status: 403 }
      );
    }

    const targetWorkspaceId =
      "workspace" in workspace ? workspace.workspace.id : workspace.id;
    const dna = await crawlBrandDNA(url);

    const brand = await prisma.brand.create({
      data: {
        userId: user.id,
        workspaceId: targetWorkspaceId,
        name: dna.name,
        url: dna.url,
        dna: JSON.parse(JSON.stringify(dna)),
        logoUrl: dna.logoUrl,
        colors: dna.colors.map((color) => color.hex),
        fonts: dna.fonts.map((font) => font.family),
        tone: dna.tone.primary,
        industry: dna.industry,
        audience: dna.audience.primary,
      },
    });

    await safeQueueWebhookEvents(prisma, [
      {
        workspaceId: targetWorkspaceId,
        event: "brand.created",
        data: {
          brand: {
            id: brand.id,
            name: dna.name,
            url: dna.url,
            industry: dna.industry,
            category: dna.category,
            tone: dna.tone.primary,
          },
        },
      },
    ]);

    return NextResponse.json({ brand: { ...brand, dna } });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid URL", details: error.issues },
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

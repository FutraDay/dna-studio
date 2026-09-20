import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getImageProvider } from "@/lib/image/client";
import type { ImageSize } from "@/lib/image/types";
import { campaignAccessWhere } from "@/lib/workspaces/access";

const schema = z.object({
  prompt: z.string().min(1).max(4000),
  size: z.enum(["1024x1024", "1024x1792", "1792x1024"]).default("1024x1024"),
  assetId: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = await request.json();
    const { prompt, size, assetId } = schema.parse(body);

    if (assetId) {
      const asset = await prisma.asset.findFirst({
        where: {
          id: assetId,
          campaign: campaignAccessWhere(session.user.id),
        },
        select: { id: true },
      });

      if (!asset) {
        return NextResponse.json({ error: "Asset not found" }, { status: 404 });
      }
    }

    const provider = await getImageProvider();
    const { url: imageUrl } = await provider.generate(prompt, {
      size: size as ImageSize,
    });

    if (assetId) {
      await prisma.asset.update({
        where: { id: assetId },
        data: { imageUrl },
      });
    }

    return NextResponse.json({ url: imageUrl });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: error.issues },
        { status: 400 }
      );
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[Image Gen] Failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Image generation failed",
      },
      { status: 500 }
    );
  }
}

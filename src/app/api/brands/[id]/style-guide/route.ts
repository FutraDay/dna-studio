import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { brandAccessWhere } from "@/lib/workspaces/access";
import type { BrandDNA } from "@/lib/brand-dna/types";
import {
  buildBrandStyleGuideHtml,
  styleGuideFilename,
} from "@/lib/brand-dna/style-guide";
import { renderHtmlToPdf } from "@/lib/pdf/render-html";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;

    const brand = await prisma.brand.findFirst({
      where: brandAccessWhere(session.user.id, id),
      select: {
        id: true,
        name: true,
        url: true,
        dna: true,
        workspace: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!brand) {
      return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }

    if (!brand.dna || typeof brand.dna !== "object") {
      return NextResponse.json(
        { error: "Brand DNA is unavailable" },
        { status: 422 }
      );
    }

    const dna = brand.dna as unknown as BrandDNA;
    const html = buildBrandStyleGuideHtml(
      {
        ...dna,
        name: dna.name || brand.name,
        url: dna.url || brand.url,
      },
      {
        workspaceName: brand.workspace.name,
      }
    );

    const pdf = await renderHtmlToPdf(html, {
      format: "A4",
      marginMm: 12,
    });

    const filename = styleGuideFilename(brand.name);

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(pdf.byteLength),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("[Brand Style Guide] Export failed:", error);
    return NextResponse.json(
      { error: "Style guide export failed" },
      { status: 500 }
    );
  }
}

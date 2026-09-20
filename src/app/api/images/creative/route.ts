import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { resolveSettings } from "@/lib/settings/resolve";
import { campaignAccessWhere } from "@/lib/workspaces/access";
import type { BrandDNA } from "@/lib/brand-dna/types";
import {
  buildCreativeCopy,
  renderProfessionalCreative,
  type CreativePreset,
} from "@/lib/image/creative-composer";

const postSchema = z.object({
  assetId: z.string().min(1),
  preset: z.enum(["professional", "tradie", "product", "before-after"]).default("professional"),
});

const getSchema = z.object({
  assetId: z.string().min(1),
  filename: z.string().min(1).max(255).refine((value) => !value.includes("/") && !value.includes("\\") && !value.includes(".."), "Invalid filename"),
  subfolder: z.string().max(255).refine((value) => !value.includes("..") && !value.startsWith("/") && !value.startsWith("\\"), "Invalid subfolder").default(""),
  type: z.enum(["output", "input", "temp"]).default("output"),
  preset: z.enum(["professional", "tradie", "product", "before-after"]).default("professional"),
  v: z.string().optional(),
});

type LocalSource = {
  filename: string;
  subfolder: string;
  type: "output" | "input" | "temp";
};

type ConceptLike = {
  name?: string;
  description?: string;
  assets?: Array<{ platform?: string; caption?: string; cta?: string }>;
};

function localSourceFromUrl(raw: string | null): LocalSource | null {
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw, "http://dna.local");
  } catch {
    return null;
  }
  if (parsed.pathname !== "/api/images/comfyui" && parsed.pathname !== "/api/images/creative") {
    return null;
  }
  const filename = parsed.searchParams.get("filename") || "";
  const subfolder = parsed.searchParams.get("subfolder") || "";
  const type = parsed.searchParams.get("type") || "output";
  const result = getSchema.pick({ filename: true, subfolder: true, type: true }).safeParse({
    filename,
    subfolder,
    type,
  });
  return result.success ? result.data : null;
}

function concepts(value: Prisma.JsonValue): ConceptLike[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ConceptLike => Boolean(item) && typeof item === "object" && !Array.isArray(item));
}

function comfyOrigin(raw: string): string {
  const parsed = new URL(raw);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Invalid ComfyUI URL");
  }
  return parsed.origin;
}

async function findAsset(userId: string, assetId: string) {
  return prisma.asset.findFirst({
    where: {
      id: assetId,
      campaign: campaignAccessWhere(userId),
    },
    include: {
      campaign: {
        include: { brand: true },
      },
    },
  });
}

function creativeUrl(assetId: string, source: LocalSource, preset: CreativePreset): string {
  const query = new URLSearchParams({
    assetId,
    filename: source.filename,
    subfolder: source.subfolder,
    type: source.type,
    preset,
    v: String(Date.now()),
  });
  return `/api/images/creative?${query.toString()}`;
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const { assetId, preset } = postSchema.parse(await request.json());
    const asset = await findAsset(session.user.id, assetId);
    if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

    const source = localSourceFromUrl(asset.imageUrl);
    if (!source) {
      return NextResponse.json(
        { error: "Generate a Free Local background before composing the professional creative." },
        { status: 409 }
      );
    }

    const url = creativeUrl(asset.id, source, preset);
    await prisma.asset.update({ where: { id: asset.id }, data: { imageUrl: url } });
    return NextResponse.json({ url });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input", details: error.issues }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[Creative Composer] Failed:", error);
    return NextResponse.json({ error: "Creative composition failed" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const query = getSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const asset = await findAsset(session.user.id, query.assetId);
    if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

    const stored = localSourceFromUrl(asset.imageUrl);
    if (
      !stored ||
      stored.filename !== query.filename ||
      stored.subfolder !== query.subfolder ||
      stored.type !== query.type
    ) {
      return NextResponse.json({ error: "Creative source no longer matches this asset" }, { status: 409 });
    }

    const settings = await resolveSettings();
    const upstream = new URL(`${comfyOrigin(settings.comfyUrl)}/view`);
    upstream.searchParams.set("filename", query.filename);
    upstream.searchParams.set("subfolder", query.subfolder);
    upstream.searchParams.set("type", query.type);
    const response = await fetch(upstream, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) {
      return NextResponse.json({ error: "Local background is unavailable" }, { status: 502 });
    }
    const background = Buffer.from(await response.arrayBuffer());
    const dna = asset.campaign.brand.dna as unknown as Partial<BrandDNA>;
    const copy = buildCreativeCopy({
      dna,
      caption: asset.caption,
      platform: asset.platform,
      concepts: concepts(asset.campaign.concepts),
      preset: query.preset,
    });
    const image = await renderProfessionalCreative(background, copy);
    return new Response(new Uint8Array(image), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid creative request" }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[Creative Composer] Render failed:", error);
    return NextResponse.json({ error: "Creative could not be rendered" }, { status: 500 });
  }
}
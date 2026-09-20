import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { resolveSettings } from "@/lib/settings/resolve";

const querySchema = z.object({
  filename: z.string().min(1).max(255).refine((value) => !value.includes("/") && !value.includes("\\") && !value.includes(".."), "Invalid filename"),
  subfolder: z.string().max(255).refine((value) => !value.includes("..") && !value.startsWith("/") && !value.startsWith("\\"), "Invalid subfolder").default(""),
  type: z.enum(["output", "input", "temp"]).default("output"),
});

function origin(raw: string): string {
  const parsed = new URL(raw);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Invalid ComfyUI URL");
  }
  return parsed.origin;
}

export async function GET(request: Request) {
  try {
    await requireSession();
    const url = new URL(request.url);
    const query = querySchema.parse(Object.fromEntries(url.searchParams));
    const settings = await resolveSettings();
    const upstream = new URL(`${origin(settings.comfyUrl)}/view`);
    upstream.searchParams.set("filename", query.filename);
    upstream.searchParams.set("subfolder", query.subfolder);
    upstream.searchParams.set("type", query.type);

    const image = await fetch(upstream, { signal: AbortSignal.timeout(15_000) });
    if (!image.ok || !image.body) {
      return NextResponse.json({ error: "Local image is unavailable" }, { status: 502 });
    }

    return new Response(image.body, {
      headers: {
        "Content-Type": image.headers.get("content-type") || "image/png",
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid image path" }, { status: 400 });
    }
    console.error("[ComfyUI Image] Failed:", error);
    return NextResponse.json({ error: "Local image could not be loaded" }, { status: 500 });
  }
}
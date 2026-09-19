import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { generateJSON, type LLMMessage } from "@/lib/llm/client";
import type { BrandDNA } from "@/lib/brand-dna/types";
import { brandAccessWhere } from "@/lib/workspaces/access";

interface Suggestion {
  title: string;
  description: string;
  imagePrompt: string;
  imageUrl?: string;
}

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(request.url);
    const brandId = searchParams.get("brandId");
    const refresh = searchParams.get("refresh") === "true";

    if (!brandId) {
      return NextResponse.json(
        { error: "brandId is required" },
        { status: 400 }
      );
    }

    const brand = await prisma.brand.findFirst({
      where: brandAccessWhere(session.user.id, brandId),
    });

    if (!brand) {
      return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }

    // Return cached suggestions if available and not refreshing
    if (!refresh && brand.suggestions) {
      const cached = brand.suggestions as unknown as Suggestion[];
      if (Array.isArray(cached) && cached.length > 0) {
        return NextResponse.json(cached);
      }
    }

    const dna = brand.dna as unknown as BrandDNA;

    const messages: LLMMessage[] = [
      {
        role: "system",
        content:
          "You are an expert social media marketing strategist. Generate campaign suggestions as structured JSON. Be creative and specific to the brand.",
      },
      {
        role: "user",
        content: `Based on this brand's Business DNA, generate 4 unique, creative campaign suggestions.

Brand: ${dna.name}
Industry: ${dna.industry}
Category: ${dna.category}
Tagline: ${dna.tagline || "N/A"}
Tone: ${dna.tone.primary} / ${dna.tone.secondary} — ${dna.tone.description}
Target Audience: ${dna.audience.primary} (${dna.audience.ageRange})
Interests: ${dna.audience.interests.join(", ")}
Keywords: ${dna.keywords.join(", ")}
Brand Colors: ${dna.colors.map((c) => c.hex).join(", ")}

Each suggestion should be highly specific to THIS brand — not generic marketing advice. Think about what campaigns would resonate with their specific audience and align with their tone of voice.

For each suggestion, also write an imagePrompt — a detailed image generation prompt to generate a preview image for the campaign card. The image should be a social media post mockup or a visually appealing marketing visual that represents the campaign idea. Include the brand's color palette (${dna.colors.slice(0, 3).map((c) => c.hex).join(", ")}) in the image prompt for brand consistency.

Return JSON in this exact format:
{
  "suggestions": [
    {
      "title": "Short campaign title (5-8 words)",
      "description": "One sentence describing the campaign idea",
      "imagePrompt": "Detailed image generation prompt for a preview visual"
    }
  ]
}`,
      },
    ];

    const result = await generateJSON<{ suggestions: Suggestion[] }>(messages, {
      maxTokens: 2048,
      temperature: 0.9,
    });

    const suggestions = result.suggestions;

    // Cache suggestions to the brand
    await prisma.brand.update({
      where: { id: brandId },
      data: { suggestions: JSON.parse(JSON.stringify(suggestions)) },
    });

    return NextResponse.json(suggestions);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[Suggestions] Failed:", error);
    return NextResponse.json(
      { error: "Failed to generate suggestions" },
      { status: 500 }
    );
  }
}

// PATCH: Update a cached suggestion's image URL
export async function PATCH(request: Request) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(request.url);
    const brandId = searchParams.get("brandId");
    const body = await request.json();
    const { index, imageUrl } = body as { index: number; imageUrl: string };

    if (!brandId || index == null || !imageUrl) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const brand = await prisma.brand.findFirst({
      where: brandAccessWhere(session.user.id, brandId),
    });

    if (!brand?.suggestions) {
      return NextResponse.json({ error: "No suggestions" }, { status: 404 });
    }

    const suggestions = brand.suggestions as unknown as Suggestion[];
    if (index >= 0 && index < suggestions.length) {
      suggestions[index].imageUrl = imageUrl;
      await prisma.brand.update({
        where: { id: brandId },
        data: { suggestions: JSON.parse(JSON.stringify(suggestions)) },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

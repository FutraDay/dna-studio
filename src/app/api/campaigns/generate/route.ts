import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { repairCampaign, streamCampaign, type GeneratedCampaign } from "@/lib/campaigns/generator";
import { formatCampaignQualityError, validateCampaignQuality } from "@/lib/campaigns/quality";
import { normalizeCampaignStyle } from "@/lib/campaigns/style-normalizer";
import type { BrandDNA } from "@/lib/brand-dna/types";

const generateSchema = z.object({
  brandId: z.string(),
  goal: z.string().min(1),
  platforms: z.array(z.enum(["instagram", "linkedin", "facebook", "twitter"])).min(1),
  language: z.string().default("English"),
});

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = await request.json();
    const { brandId, goal, platforms, language } = generateSchema.parse(body);

    const brand = await prisma.brand.findFirst({
      where: { id: brandId, userId: session.user.id },
    });

    if (!brand) {
      return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }

    const dna = brand.dna as unknown as BrandDNA;

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let fullContent = "";

        try {
          for await (const chunk of streamCampaign(
            dna,
            goal,
            platforms,
            language
          )) {
            fullContent += chunk;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "chunk", content: chunk })}\n\n`
              )
            );
          }

          // Parse the completed content and save
          const match = fullContent.match(/\{[\s\S]*\}/);
          if (!match) throw new Error("LLM did not return valid JSON for campaign");
          let generated = normalizeCampaignStyle(JSON.parse(match[0]) as GeneratedCampaign);
          let quality = validateCampaignQuality(generated, dna, goal, platforms);
          let repairAttempts = 0;

          const blockingCodes = new Set([
            "concept_count",
            "platform_coverage",
            "strategy_coverage",
            "invalid_asset",
            "twitter_length",
            "unsupported_metric",
            "unsupported_entity",
            "unsupported_evidence_claim",
            "unsupported_offer",
            "unsupported_resource",
            "duplicate_caption",
            "repeated_hook",
            "question_hook_overuse",
            "repeated_cta",
            "repeated_hashtag_set",
            "cross_platform_similarity",
            "platform_style",
            "generic_cliche",
            "concept_similarity",
            "repetitive_visuals",
          ]);

          while (!quality.passed && repairAttempts < 3) {
            generated = normalizeCampaignStyle(
              await repairCampaign(
                dna,
                goal,
                platforms,
                language,
                generated,
                quality.issues
              )
            );
            repairAttempts += 1;
            quality = validateCampaignQuality(generated, dna, goal, platforms);

            // Continue repairing while any configured blocking quality issue remains.
            const remainingBlocking = quality.issues.filter((issue) =>
              blockingCodes.has(issue.code)
            );
            if (!quality.passed && remainingBlocking.length === 0) break;
          }

          if (!quality.passed) {
            const blockingIssues = quality.issues.filter((issue) =>
              blockingCodes.has(issue.code)
            );
            if (blockingIssues.length > 0) {
              throw new Error(
                formatCampaignQualityError({ passed: false, issues: blockingIssues })
              );
            }

            console.warn(
              "Campaign saved with non-blocking quality warnings:",
              quality.issues.map((issue) => issue.message)
            );
          }

          const campaign = await prisma.campaign.create({
            data: {
              brandId,
              userId: session.user.id,
              goal,
              concepts: generated.concepts as unknown as Prisma.InputJsonValue,
              assets: {
                create: generated.concepts.flatMap(
                  (concept: { assets: Array<{ platform: string; caption: string; hashtags: string[]; imagePrompt?: string }> }) =>
                    concept.assets.map(
                      (asset: { platform: string; caption: string; hashtags: string[]; imagePrompt?: string }) => ({
                        platform: asset.platform,
                        caption: asset.caption,
                        hashtags: asset.hashtags,
                        imagePrompt: asset.imagePrompt || null,
                        status: "draft",
                      })
                    )
                ),
              },
            },
            include: { assets: true },
          });

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "complete", campaign })}\n\n`
            )
          );
        } catch (error) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                message:
                  error instanceof Error
                    ? error.message
                    : "Generation failed",
              })}\n\n`
            )
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
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
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

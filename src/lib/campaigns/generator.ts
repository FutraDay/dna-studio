import type { BrandDNA } from "../brand-dna/types";
import { generateJSON, streamText, type LLMMessage } from "../llm/client";
import { buildBrandContext, buildCampaignPrompt } from "./prompt-builder";

export type CampaignStrategy = "problem_awareness" | "education" | "proof_trust" | "solution_product" | "conversion";

export interface CampaignConcept {
  name: string;
  strategy?: CampaignStrategy;
  description: string;
  theme: string;
  assets: CampaignAsset[];
}

export interface CampaignAsset {
  platform: string;
  caption: string;
  text?: string;
  hashtags: string[];
  cta: string;
  imagePrompt: string;
}

export interface GeneratedCampaign {
  concepts: CampaignConcept[];
}

const CAMPAIGN_CONTEXT_TOKENS = 8192;
const REPAIR_CONTEXT_TOKENS = 8192;

function campaignOutputTokens(platforms: string[]): number {
  // Five concepts still fit comfortably within this budget for one platform,
  // while additional platforms receive more room. Bounding output prevents
  // local Ollama runs from drifting toward an 8K-token ceiling for minutes.
  return Math.min(5120, 2048 + Math.max(0, platforms.length - 1) * 1024);
}

export async function generateCampaign(
  dna: BrandDNA,
  goal: string,
  platforms: string[],
  language: string = "English"
): Promise<GeneratedCampaign> {
  const prompt = buildCampaignPrompt(dna, goal, platforms, language);

  const messages: LLMMessage[] = [
    {
      role: "system",
      content:
        "You are an expert social media marketing strategist. Generate campaigns as structured JSON. Be creative, specific, and on-brand.",
    },
    { role: "user", content: prompt },
  ];

  return generateJSON<GeneratedCampaign>(messages, {
    maxTokens: campaignOutputTokens(platforms),
    contextTokens: CAMPAIGN_CONTEXT_TOKENS,
    temperature: 0.8,
    json: true,
  });
}

export async function* streamCampaign(
  dna: BrandDNA,
  goal: string,
  platforms: string[],
  language: string = "English"
): AsyncGenerator<string> {
  const prompt = buildCampaignPrompt(dna, goal, platforms, language);

  const messages: LLMMessage[] = [
    {
      role: "system",
      content:
        "You are an expert social media marketing strategist. Generate campaigns as structured JSON. Be creative, specific, and on-brand.",
    },
    { role: "user", content: prompt },
  ];

  yield* streamText(messages, {
    maxTokens: campaignOutputTokens(platforms),
    contextTokens: CAMPAIGN_CONTEXT_TOKENS,
    temperature: 0.8,
    json: true,
  });
}

export async function repairCampaign(
  dna: BrandDNA,
  goal: string,
  platforms: string[],
  language: string,
  candidate: GeneratedCampaign,
  issues: Array<{ code?: string; message: string }>
): Promise<GeneratedCampaign> {
  const brandContext = buildBrandContext(dna);
  const issueGroups = new Map<string, { count: number; samples: string[] }>();
  for (const issue of issues) {
    const key = issue.code ?? "quality";
    const group = issueGroups.get(key) ?? { count: 0, samples: [] };
    group.count += 1;
    if (group.samples.length < 2 && !group.samples.includes(issue.message)) {
      group.samples.push(issue.message);
    }
    issueGroups.set(key, group);
  }
  const issueSummary = [...issueGroups.entries()]
    .map(([code, group], index) =>
      `${index + 1}. ${code} (${group.count} issue${group.count === 1 ? "" : "s"}): ${group.samples.join(" | ")}`
    )
    .join("\n");
  const styleRecoveryCodes = new Set([
    "question_hook_overuse",
    "generic_cliche",
    "generic_copy",
    "platform_depth",
    "emoji_overuse",
    "repeated_hook",
    "repeated_cta",
    "repeated_hashtag_set",
    "cross_platform_similarity",
    "platform_style",
    "concept_similarity",
  ]);
  const styleRecovery = issues.some((issue) =>
    issue.code ? styleRecoveryCodes.has(issue.code) : false
  );
  const styleDirective = styleRecovery
    ? `

STRICT STYLE RECOVERY MODE:
- Use ZERO question-style opening hooks in this repair. The first sentence of every caption must be declarative and must not contain a question mark.
- Remove these template/cliche phrases everywhere: curious about, worried about, thinking about, ever wondered, ready to, tired of, why settle for, think again, game changer, unlock the power, revolutionize your business, automation isn't just a buzzword, business necessity, it's time for a change.
- Also remove generic filler such as: hey business owners, we want to hear from you, our software solutions, boost your business efficiency, focus on growth, streamline your operations, get started, ditch manual processes for good, the benefits of automation, the solution to manual business processes.
- The complete post must be in the caption field. Do not create text, body, title, or headline fields.
- Never place hashtags inside caption text; use only the hashtags array, with single-token hashtags that contain no spaces.
- For professional B2B campaigns, remove emojis entirely unless the supplied brand profile explicitly asks for a playful/casual style. LinkedIn should contain no emojis.
- Every asset must have a distinct opening phrase and a distinct CTA.
- Never reuse an identical non-empty hashtag set.
- Reinterpret each concept for each platform; do not paraphrase the same sentences.
- Instagram should be visual/scannable; LinkedIn analytical and complete (roughly 60-180 words); Facebook conversational; Twitter/X concise and assertive.
- Preserve verified facts and evidence, but aggressively rewrite style where needed.
- Before returning JSON, audit all captions against these rules.`
    : "";
  const preserveImagePrompts = !issues.some((issue) => issue.code === "repetitive_visuals");
  const candidateForPrompt: GeneratedCampaign = preserveImagePrompts
    ? {
        concepts: candidate.concepts.map((concept) => ({
          ...concept,
          assets: concept.assets.map((asset) => ({ ...asset, imagePrompt: "[preserve existing image prompt]" })),
        })),
      }
    : candidate;

  const repairPrompt = `QUALITY REPAIR TASK:
Repair the existing campaign without rebuilding the full planning prompt.

${brandContext}

CAMPAIGN GOAL: ${goal}
TARGET PLATFORMS: ${platforms.join(", ")}
LANGUAGE: ${language}

The campaign must contain exactly 5 concepts in this strategy order: problem_awareness, education, proof_trust, solution_product, conversion. Each concept must contain exactly one asset for every target platform.

FAILED CHECKS:
${issueSummary}${styleDirective}

PREVIOUS CAMPAIGN JSON:
${JSON.stringify(candidateForPrompt, null, 2)}

Return a complete corrected campaign in the same JSON structure as PREVIOUS CAMPAIGN JSON.
Preserve compliant ideas where possible, but fix every listed issue.
Do not explain the changes outside the JSON.`;

  const messages: LLMMessage[] = [
    {
      role: "system",
      content:
        "You are a strict senior B2B content editor. Repair campaign JSON to satisfy every supplied quality check without inventing evidence.",
    },
    { role: "user", content: repairPrompt },
  ];

  const repaired = await generateJSON<GeneratedCampaign>(messages, {
    maxTokens: campaignOutputTokens(platforms),
    contextTokens: REPAIR_CONTEXT_TOKENS,
    temperature: styleRecovery ? 0.1 : 0.3,
    json: true,
  });

  if (preserveImagePrompts) {
    repaired.concepts = repaired.concepts.map((concept, conceptIndex) => ({
      ...concept,
      assets: concept.assets.map((asset) => {
        const original = candidate.concepts[conceptIndex]?.assets.find(
          (item) => item.platform === asset.platform
        );
        return {
          ...asset,
          imagePrompt: original?.imagePrompt ?? asset.imagePrompt,
        };
      }),
    }));
  }

  return repaired;
}
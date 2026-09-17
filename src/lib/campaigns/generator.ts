import type { BrandDNA } from "../brand-dna/types";
import { generateJSON, streamText, type LLMMessage } from "../llm/client";
import { buildCampaignPrompt } from "./prompt-builder";

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
  hashtags: string[];
  cta: string;
  imagePrompt: string;
}

export interface GeneratedCampaign {
  concepts: CampaignConcept[];
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
    maxTokens: 8192,
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
    maxTokens: 8192,
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
  const basePrompt = buildCampaignPrompt(dna, goal, platforms, language);
  const issueSummary = issues.map((issue, index) => `${index + 1}. ${issue.message}`).join("\n");
  const styleRecoveryCodes = new Set([
    "question_hook_overuse",
    "generic_cliche",
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
- Every asset must have a distinct opening phrase and a distinct CTA.
- Never reuse an identical non-empty hashtag set.
- Reinterpret each concept for each platform; do not paraphrase the same sentences.
- Instagram should be visual/scannable; LinkedIn analytical; Facebook conversational; Twitter/X concise and assertive.
- Preserve verified facts and evidence, but aggressively rewrite style where needed.
- Before returning JSON, audit all captions against these rules.`
    : "";
  const repairPrompt = `${basePrompt}

QUALITY REPAIR TASK:
The previous campaign failed deterministic quality checks. Repair it before it can be saved or sent to image generation.

FAILED CHECKS:
${issueSummary}${styleDirective}

PREVIOUS CAMPAIGN JSON:
${JSON.stringify(candidate, null, 2)}

Return a complete corrected campaign in the exact JSON structure requested above.
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

  return generateJSON<GeneratedCampaign>(messages, {
    maxTokens: 8192,
    temperature: styleRecovery ? 0.1 : 0.3,
    json: true,
  });
}
import type { BrandDNA } from "../brand-dna/types";
import type { GeneratedCampaign } from "./generator";

export type CampaignQualityIssueCode =
  | "concept_count"
  | "platform_coverage"
  | "strategy_coverage"
  | "invalid_asset"
  | "twitter_length"
  | "duplicate_caption"
  | "repeated_hook"
  | "generic_cliche"
  | "unsupported_metric"
  | "unsupported_entity"
  | "unsupported_evidence_claim"
  | "unsupported_offer"
  | "unsupported_resource"
  | "concept_similarity"
  | "repetitive_visuals";

export interface CampaignQualityIssue {
  code: CampaignQualityIssueCode;
  message: string;
}

export interface CampaignQualityResult {
  passed: boolean;
  issues: CampaignQualityIssue[];
}

const CLICHES = [
  "imagine a world",
  "game changer",
  "revolutionize your business",
  "unlock the power",
  "making your head spin",
  "pain into gains",
];

const VISUAL_DEVICE_TERMS = /\b(?:dashboard|laptop|monitor|screen|device|interface|chart)\b/i;
const METRIC_PATTERN = /\$\s?\d[\d,.]*|\b\d[\d,.]*\s?(?:%|percent|hours?|hrs?|days?|weeks?|months?|x|k|m|million|thousand)(?=\s|[.,!?;:]|$)/gi;
const COMPANY_PATTERN = /\b[A-Z][A-Za-z0-9&'-]*(?:\s+[A-Z][A-Za-z0-9&'-]*){0,2}\s+(?:Co|Company|Corp|Inc|Ltd|Pty(?:\s+Ltd)?)\.?\b/g;

const EXPECTED_STRATEGIES = [
  "problem_awareness",
  "education",
  "proof_trust",
  "solution_product",
  "conversion",
] as const;

const EVIDENCE_CLAIM_PATTERNS = [
  /\b(?:our\s+)?(?:latest\s+)?case stud(?:y|ies)\b/i,
  /\b(?:customer|client|business)\s+(?:success|case)\s+stor(?:y|ies)\b/i,
  /\bsuccess stor(?:y|ies)\b/i,
  /\bsee how we (?:helped|transformed|streamlined|improved|saved)\b/i,
  /\b(?:we|we've|we have)\s+(?:helped|worked with|partnered with|supported)\b/i,
  /\bpartnered with us\b/i,
  /\b(?:a|the|our)\s+(?:local\s+|small\s+)?business\s+(?:partnered|worked|used|adopted|implemented|transformed|streamlined|saved|reduced|increased|boosted|improved)\b/i,
];

const HYPOTHETICAL_PATTERN = /\b(?:hypothetical|for example|as an example|could hypothetically)\b/i;
const OFFER_PATTERN = /\b(?:free|complimentary|no[- ]obligation)\s+(?:consultation|audit|assessment|demo|trial|quote|review|strategy session)\b|\b(?:special offer|limited[- ]time offer|discount|guarantee)\b/gi;
const RESOURCE_PATTERN = /\b(?:download|grab|access|get|our)\s+(?:our\s+|a\s+|the\s+|free\s+)?(?:[a-z]+\s+){0,2}(?:checklist|guide|template|ebook|e-book|report|playbook|webinar|worksheet|calculator)\b/gi;

const CONTENT_STOP_WORDS = new Set([
  "about", "after", "again", "also", "around", "because", "before", "brand",
  "business", "businesses", "custom", "from", "generic", "help", "helps", "into",
  "more", "need", "needs", "only", "other", "product", "service", "services", "solution",
  "solutions", "software", "system", "systems", "than", "that", "their", "them", "then",
  "there", "these", "they", "this", "through", "using", "what", "when", "where", "which",
  "with", "without", "work", "works", "your", "youre", "problem", "awareness", "education",
  "proof", "trust", "conversion", "instagram", "linkedin", "facebook", "twitter",
]);

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hookKey(caption: string): string {
  return normalize(caption).split(" ").filter(Boolean).slice(0, 3).join(" ");
}

function evidenceText(dna: BrandDNA, goal: string): string {
  return `${JSON.stringify(dna)} ${goal}`.toLowerCase();
}
function hasVerifiedNamedEntity(caption: string, evidence: string): boolean {
  const entities = caption.match(COMPANY_PATTERN) ?? [];
  return entities.some((entity) =>
    evidence.includes(entity.toLowerCase().replace(/\.$/, ""))
  );
}

function unsupportedEvidencePhrase(caption: string, evidence: string): string | null {
  if (HYPOTHETICAL_PATTERN.test(caption) || hasVerifiedNamedEntity(caption, evidence)) {
    return null;
  }

  for (const pattern of EVIDENCE_CLAIM_PATTERNS) {
    const match = caption.match(pattern);
    if (match?.[0]) return match[0];
  }
  return null;
}

function unsupportedPhrases(caption: string, evidence: string, pattern: RegExp): string[] {
  const evidenceNormalized = normalize(evidence);
  return (caption.match(pattern) ?? []).filter(
    (phrase) => !evidenceNormalized.includes(normalize(phrase))
  );
}

function conceptTokens(
  concept: GeneratedCampaign["concepts"][number],
  brandName: string
): Set<string> {
  const brandTokens = new Set(normalize(brandName).split(" ").filter(Boolean));
  const source = [
    concept.name,
    concept.description,
    concept.theme,
    ...concept.assets.map((asset) => asset.caption),
  ]
    .filter(Boolean)
    .join(" ");

  return new Set(
    normalize(source)
      .split(" ")
      .filter(
        (token) =>
          token.length >= 4 &&
          !CONTENT_STOP_WORDS.has(token) &&
          !brandTokens.has(token)
      )
  );
}

function jaccardSimilarity(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function validateCampaignQuality(
  campaign: GeneratedCampaign,
  dna: BrandDNA,
  goal: string,
  platforms: string[]
): CampaignQualityResult {
  const issues: CampaignQualityIssue[] = [];
  const concepts = Array.isArray(campaign?.concepts) ? campaign.concepts : [];

  if (concepts.length !== 5) {
    issues.push({
      code: "concept_count",
      message: `Expected exactly 5 campaign concepts but received ${concepts.length}.`,
    });
  }

  const captions: string[] = [];
  const imagePrompts: string[] = [];
  const evidence = evidenceText(dna, goal);

  concepts.forEach((concept, conceptIndex) => {
    const expectedStrategy = EXPECTED_STRATEGIES[conceptIndex];
    if (expectedStrategy && concept.strategy !== expectedStrategy) {
      issues.push({
        code: "strategy_coverage",
        message: `Concept ${conceptIndex + 1} must use strategy "${expectedStrategy}" but received "${concept.strategy || "missing"}".`,
      });
    }

    const assets = Array.isArray(concept?.assets) ? concept.assets : [];
    const counts = new Map<string, number>();

    for (const asset of assets) {
      counts.set(asset.platform, (counts.get(asset.platform) ?? 0) + 1);

      if (!platforms.includes(asset.platform)) {
        issues.push({
          code: "platform_coverage",
          message: `Concept ${conceptIndex + 1} contains unrequested platform ${asset.platform}.`,
        });
      }

      if (!asset.caption?.trim() || !Array.isArray(asset.hashtags)) {
        issues.push({
          code: "invalid_asset",
          message: `Concept ${conceptIndex + 1} has an incomplete ${asset.platform || "unknown"} asset.`,
        });
        continue;
      }

      captions.push(asset.caption);
      if (asset.imagePrompt?.trim()) imagePrompts.push(asset.imagePrompt);

      if (asset.platform === "twitter" && asset.caption.length > 280) {
        issues.push({
          code: "twitter_length",
          message: `Concept ${conceptIndex + 1} has an X/Twitter caption over 280 characters.`,
        });
      }

      const lower = asset.caption.toLowerCase();
      for (const phrase of CLICHES) {
        if (lower.includes(phrase)) {
          issues.push({
            code: "generic_cliche",
            message: `Concept ${conceptIndex + 1} uses generic marketing cliche "${phrase}".`,
          });
        }
      }

      const metrics = asset.caption.match(METRIC_PATTERN) ?? [];
      for (const metric of metrics) {
        if (!evidence.includes(metric.toLowerCase())) {
          issues.push({
            code: "unsupported_metric",
            message: `Concept ${conceptIndex + 1} contains unsupported metric "${metric}".`,
          });
        }
      }

      const entities = asset.caption.match(COMPANY_PATTERN) ?? [];
      for (const entity of entities) {
        if (!evidence.includes(entity.toLowerCase().replace(/\.$/, ""))) {
          issues.push({
            code: "unsupported_entity",
            message: `Concept ${conceptIndex + 1} references unverified company "${entity}".`,
          });
        }
      }

      const evidencePhrase = unsupportedEvidencePhrase(asset.caption, evidence);
      if (evidencePhrase) {
        issues.push({
          code: "unsupported_evidence_claim",
          message: `Concept ${conceptIndex + 1} implies unverified customer evidence with "${evidencePhrase}". Use verified named evidence or frame the example as hypothetical.`,
        });
      }

      for (const offer of unsupportedPhrases(asset.caption, evidence, OFFER_PATTERN)) {
        issues.push({
          code: "unsupported_offer",
          message: `Concept ${conceptIndex + 1} invents unsupported offer "${offer}".`,
        });
      }

      for (const resource of unsupportedPhrases(asset.caption, evidence, RESOURCE_PATTERN)) {
        issues.push({
          code: "unsupported_resource",
          message: `Concept ${conceptIndex + 1} invents unsupported resource "${resource}". Include the resource inline or remove the claim.`,
        });
      }
    }

    for (const platform of platforms) {
      const count = counts.get(platform) ?? 0;
      if (count !== 1) {
        issues.push({
          code: "platform_coverage",
          message: `Concept ${conceptIndex + 1} must contain exactly one ${platform} asset; received ${count}.`,
        });
      }
    }
  });

  const expectedAssets = 5 * platforms.length;
  if (captions.length !== expectedAssets) {
    issues.push({
      code: "platform_coverage",
      message: `Expected ${expectedAssets} complete assets but received ${captions.length}.`,
    });
  }

  const captionCounts = new Map<string, number>();
  for (const caption of captions) {
    const key = normalize(caption);
    captionCounts.set(key, (captionCounts.get(key) ?? 0) + 1);
  }
  for (const [caption, count] of captionCounts) {
    if (caption && count > 1) {
      issues.push({
        code: "duplicate_caption",
        message: `The same caption appears ${count} times: "${caption.slice(0, 80)}".`,
      });
    }
  }

  const hookCounts = new Map<string, number>();
  for (const caption of captions) {
    const key = hookKey(caption);
    if (key.split(" ").length >= 2) hookCounts.set(key, (hookCounts.get(key) ?? 0) + 1);
  }
  for (const [hook, count] of hookCounts) {
    if (count >= 3) {
      issues.push({
        code: "repeated_hook",
        message: `Opening hook "${hook}" is repeated across ${count} assets.`,
      });
    }
  }
  const conceptTokenSets = concepts.map((concept) => conceptTokens(concept, dna.name));
  for (let left = 0; left < conceptTokenSets.length; left++) {
    for (let right = left + 1; right < conceptTokenSets.length; right++) {
      const sharedTerms = [...conceptTokenSets[left]].filter((token) => conceptTokenSets[right].has(token)).length;
      const similarity = jaccardSimilarity(conceptTokenSets[left], conceptTokenSets[right]);
      if (sharedTerms >= 4 && similarity >= 0.5) {
        issues.push({
          code: "concept_similarity",
          message: `Concepts ${left + 1} and ${right + 1} are too semantically similar (${Math.round(similarity * 100)}% keyword overlap). Give them different pains, outcomes, examples, or buying motivations.`,
        });
      }
    }
  }

  if (imagePrompts.length >= 5) {
    const deviceHeavy = imagePrompts.filter((prompt) => VISUAL_DEVICE_TERMS.test(prompt)).length;
    if (deviceHeavy / imagePrompts.length >= 0.7) {
      issues.push({
        code: "repetitive_visuals",
        message: `${deviceHeavy} of ${imagePrompts.length} image prompts rely on dashboard/device imagery.`,
      });
    }
  }

  return { passed: issues.length === 0, issues };
}

export function formatCampaignQualityError(result: CampaignQualityResult): string {
  const details = result.issues.slice(0, 6).map((issue) => issue.message).join(" ");
  const remainder = Math.max(0, result.issues.length - 6);
  return `Campaign quality check failed. ${details}${remainder ? ` Plus ${remainder} more issue(s).` : ""}`;
}
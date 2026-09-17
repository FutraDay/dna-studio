import type { BrandDNA } from "../brand-dna/types";
import type { GeneratedCampaign } from "./generator";

export type CampaignQualityIssueCode =
  | "concept_count"
  | "platform_coverage"
  | "invalid_asset"
  | "twitter_length"
  | "duplicate_caption"
  | "repeated_hook"
  | "generic_cliche"
  | "unsupported_metric"
  | "unsupported_entity"
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
  return [dna.name, dna.tagline, dna.rawText, goal].filter(Boolean).join(" ").toLowerCase();
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
import { describe, expect, it } from "vitest";
import { normalizeCampaignStyle } from "@/lib/campaigns/style-normalizer";
import type { CampaignStrategy, GeneratedCampaign } from "@/lib/campaigns/generator";

const strategies: CampaignStrategy[] = [
  "problem_awareness",
  "education",
  "proof_trust",
  "solution_product",
  "conversion",
];
const platforms = ["instagram", "linkedin", "facebook", "twitter"];

function campaignWith(caption: string, hashtags = ["#FutraDay", "#Automation"]): GeneratedCampaign {
  return {
    concepts: strategies.map((strategy, conceptIndex) => ({
      name: `Concept ${conceptIndex + 1}`,
      strategy,
      description: `Description ${conceptIndex + 1}`,
      theme: `Theme ${conceptIndex + 1}`,
      assets: platforms.map((platform) => ({
        platform,
        caption,
        hashtags: [...hashtags],
        cta: `CTA ${conceptIndex + 1} ${platform}`,
        imagePrompt: `Image ${conceptIndex + 1} ${platform}`,
      })),
    })),
  };
}
function opensWithQuestion(caption: string): boolean {
  const opening = caption.trim().replace(/\s+/g, " ").slice(0, 140);
  const question = opening.indexOf("?");
  const statementStop = opening.search(/[.!]/);
  return question >= 0 && (statementStop < 0 || question < statementStop);
}

describe("normalizeCampaignStyle", () => {
  it("removes known generic marketing cliches", () => {
    const normalized = normalizeCampaignStyle(
      campaignWith("Curious about automation? Automation isn't just a buzzword or business necessity. Think again.")
    );
    const text = normalized.concepts.flatMap((concept) => concept.assets).map((asset) => asset.caption).join(" ").toLowerCase();

    expect(text).not.toContain("curious about");
    expect(text).not.toContain("automation isn't just a buzzword");
    expect(text).not.toContain("business necessity");
    expect(text).not.toContain("think again");
  });

  it("keeps no more than two question-style opening hooks", () => {
    const normalized = normalizeCampaignStyle(campaignWith("Is this workflow slowing the team down? Review the process."));
    const count = normalized.concepts.flatMap((concept) => concept.assets)
      .filter((asset) => opensWithQuestion(asset.caption)).length;
    expect(count).toBe(2);
  });
  it("eliminates repeated non-empty hashtag sets without inventing new tags", () => {
    const normalized = normalizeCampaignStyle(campaignWith("A declarative caption."));
    const sets = normalized.concepts.flatMap((concept) => concept.assets)
      .map((asset) => asset.hashtags.map((tag) => tag.toLowerCase()).sort().join("|"))
      .filter(Boolean);
    expect(new Set(sets).size).toBe(sets.length);
    expect(normalized.concepts.flatMap((concept) => concept.assets)
      .some((asset) => asset.hashtags.length === 0)).toBe(true);
  });

  it("does not mutate the input campaign", () => {
    const original = campaignWith("Ready to improve this process? Start here.");
    const snapshot = JSON.stringify(original);
    const normalized = normalizeCampaignStyle(original);

    expect(JSON.stringify(original)).toBe(snapshot);
    expect(normalized).not.toBe(original);
  });
});

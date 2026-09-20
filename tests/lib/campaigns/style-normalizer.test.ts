import { describe, expect, it } from "vitest";
import { normalizeCampaignStyle, repairCampaignDeterministically, scopeCampaignPlatforms } from "@/lib/campaigns/style-normalizer";
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

  it("handles malformed local-model hashtag and caption fields without crashing", () => {
    const malformed = campaignWith("A valid caption.") as unknown as { concepts: Array<{ assets: Array<Record<string, unknown>> }> };
    malformed.concepts[0].assets[0].hashtags = "#FutraDay #Automation";
    malformed.concepts[0].assets[1].hashtags = null;
    malformed.concepts[0].assets[2].caption = null;

    const normalized = normalizeCampaignStyle(malformed as unknown as GeneratedCampaign);

    expect(normalized.concepts[0].assets[0].hashtags).toEqual(["FutraDay", "Automation"]);
    expect(normalized.concepts[0].assets[1].hashtags).toEqual([]);
    expect(normalized.concepts[0].assets[2].caption).toBe("");
  });

  it("merges local-model text fields into the caption and removes inline hashtag duplication", () => {
    const candidate = campaignWith("A short LinkedIn heading");
    const linkedIn = candidate.concepts[0].assets.find((asset) => asset.platform === "linkedin")!;
    linkedIn.text = "A complete professional explanation of the workflow problem and the practical takeaway for the business owner.";
    linkedIn.caption = "A short LinkedIn heading #FutraDay #Automation";
    linkedIn.hashtags = ["#FutraDay", "quote follow-ups"];
    linkedIn.imagePrompt = "Professional office scene, with the logo and tagline prominently displayed";

    const normalized = normalizeCampaignStyle(candidate);
    const asset = normalized.concepts[0].assets.find((item) => item.platform === "linkedin")!;

    expect(asset.caption).toContain("A complete professional explanation");
    expect(asset.caption).not.toContain("#FutraDay");
    expect(asset.caption).not.toContain("#Automation");
    expect(asset.hashtags).toEqual(["FutraDay", "quotefollowups"]);
    expect(asset.imagePrompt).not.toMatch(/logo and tagline prominently displayed/i);
    expect(asset.imagePrompt).toContain("No words, labels, logos, numbers, or legible controls");
  });

  it("scopes campaign assets to requested platforms without inventing missing copy", () => {
    const candidate = campaignWith("A distinct caption for each platform.");
    candidate.concepts[0].assets.push({
      ...candidate.concepts[0].assets[0],
      caption: "Duplicate Instagram asset that should be removed.",
    });

    const scoped = scopeCampaignPlatforms(candidate, ["linkedin", "instagram"]);

    expect(scoped.concepts.every((concept) =>
      concept.assets.map((asset) => asset.platform).join(",") === "linkedin,instagram"
    )).toBe(true);
    expect(scoped.concepts[0].assets).toHaveLength(2);
    expect(candidate.concepts[0].assets).toHaveLength(5);

    const missing = scopeCampaignPlatforms(
      {
        concepts: candidate.concepts.map((concept) => ({
          ...concept,
          assets: concept.assets.filter((asset) => asset.platform !== "linkedin"),
        })),
      },
      ["linkedin"]
    );
    expect(missing.concepts.every((concept) => concept.assets.length === 0)).toBe(true);
  });

  it("repairs generic filler and emoji warnings without another model call", () => {
    const candidate = campaignWith("Hey business owners ??, streamline your operations and get started today.");

    const repaired = repairCampaignDeterministically(candidate, [
      { code: "generic_copy", message: 'Concept 1 uses generic filler: "hey business owners", "streamline your operations", "get started".' },
      { code: "emoji_overuse", message: "Professional campaign copy uses too many emojis." },
    ]);

    const captions = repaired.concepts.flatMap((concept) => concept.assets).map((asset) => asset.caption.toLowerCase());
    expect(captions.every((caption) => !caption.includes("hey business owners"))).toBe(true);
    expect(captions.every((caption) => !caption.includes("streamline your operations"))).toBe(true);
    expect(captions.every((caption) => !caption.includes("get started"))).toBe(true);
    expect(repaired.concepts.flatMap((concept) => concept.assets).every((asset) => !/\p{Extended_Pictographic}/u.test(asset.caption))).toBe(true);
  });

  it("repairs deterministic quality issues without another model call", () => {
    const candidate = campaignWith("See how we helped a local business cut admin by 42%. The same workflow can be improved.");
    for (const concept of candidate.concepts) {
      for (const asset of concept.assets) {
        asset.cta = "Learn more";
        asset.imagePrompt = "Dashboard on a laptop screen with charts and interface panels";
        if (asset.platform === "twitter") {
          asset.caption = `${asset.caption} ${"Manual workflow friction keeps returning. ".repeat(10)}`;
        }
      }
    }

    const repaired = repairCampaignDeterministically(candidate, [
      { code: "unsupported_metric", message: 'Concept 1 contains unsupported metric "42%".' },
      { code: "unsupported_evidence_claim", message: 'Concept 1 implies unverified customer evidence with "see how we helped".' },
      { code: "repeated_cta", message: 'CTA "learn more" is repeated across 20 assets.' },
      { code: "cross_platform_similarity", message: "Concept 1 reuses near-duplicate copy across platforms." },
      { code: "repetitive_visuals", message: "20 of 20 image prompts rely on dashboard/device imagery." },
      { code: "twitter_length", message: "Concept 1 has an X/Twitter caption over 280 characters." },
    ]);

    const assets = repaired.concepts.flatMap((concept) => concept.assets);
    const captions = assets.map((asset) => asset.caption.toLowerCase());
    expect(captions.every((caption) => !caption.includes("see how we helped") && !caption.includes("42%"))).toBe(true);
    expect(new Set(assets.map((asset) => asset.cta)).size).toBe(20);
    expect(assets.every((asset) => !/dashboard|laptop|screen|device|interface|chart/i.test(asset.imagePrompt))).toBe(true);
    expect(assets.filter((asset) => asset.platform === "twitter").every((asset) => asset.caption.length <= 280)).toBe(true);
    expect(new Set(repaired.concepts[0].assets.map((asset) => asset.caption)).size).toBe(4);
  });

  it("does not mutate the input campaign", () => {
    const original = campaignWith("Ready to improve this process? Start here.");
    const snapshot = JSON.stringify(original);
    const normalized = normalizeCampaignStyle(original);

    expect(JSON.stringify(original)).toBe(snapshot);
    expect(normalized).not.toBe(original);
  });
});

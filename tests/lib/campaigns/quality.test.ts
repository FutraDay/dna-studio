import { describe, expect, it } from "vitest";
import type { GeneratedCampaign } from "@/lib/campaigns/generator";
import { validateCampaignQuality } from "@/lib/campaigns/quality";
import { makeBrandDNA } from "../../fixtures/brand-dna";

const dna = makeBrandDNA();
const visualPrompts = [
  "barista serving a customer in a warm cafe",
  "close-up of fresh coffee beans on a roastery table",
  "before and after scene showing a cluttered then calm counter",
  "coffee roaster checking beans beside production equipment",
  "happy cafe owner opening the shop at sunrise",
];

function makeCampaign(platforms: string[] = ["instagram"]): GeneratedCampaign {
  return {
    concepts: Array.from({ length: 5 }, (_, conceptIndex) => ({
      name: `Concept ${conceptIndex + 1}`,
      description: `Description ${conceptIndex + 1}`,
      theme: `theme-${conceptIndex + 1}`,
      assets: platforms.map((platform) => ({
        platform,
        caption: `${platform} angle ${conceptIndex + 1}: useful coffee guidance for home brewers.`,
        hashtags: ["coffee"],
        cta: `CTA ${conceptIndex + 1}`,
        imagePrompt: visualPrompts[conceptIndex],
      })),
    })),
  };
}

describe("validateCampaignQuality", () => {
  it("accepts a complete, varied campaign", () => {
    const result = validateCampaignQuality(
      makeCampaign(["instagram", "linkedin", "facebook", "twitter"]),
      dna,
      "Launch cold brew",
      ["instagram", "linkedin", "facebook", "twitter"]
    );
    expect(result).toEqual({ passed: true, issues: [] });
  });

  it("requires exactly five concepts", () => {
    const campaign = makeCampaign();
    campaign.concepts.pop();
    const result = validateCampaignQuality(campaign, dna, "goal", ["instagram"]);
    expect(result.passed).toBe(false);
    expect(result.issues.some((issue) => issue.code === "concept_count")).toBe(true);
  });

  it("requires every requested platform exactly once per concept", () => {
    const platforms = ["instagram", "linkedin"];
    const campaign = makeCampaign(platforms);
    campaign.concepts[0].assets = campaign.concepts[0].assets.filter(
      (asset) => asset.platform !== "linkedin"
    );
    const result = validateCampaignQuality(campaign, dna, "goal", platforms);
    expect(result.passed).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("exactly one linkedin"))).toBe(true);
  });

  it("rejects unverified named companies such as XYZ Co", () => {
    const campaign = makeCampaign();
    campaign.concepts[0].assets[0].caption = "See how XYZ Co. boosted efficiency with automation.";
    const result = validateCampaignQuality(campaign, dna, "goal", ["instagram"]);
    expect(result.issues.some((issue) => issue.code === "unsupported_entity")).toBe(true);
  });

  it("rejects unsupported numeric performance claims", () => {
    const campaign = makeCampaign();
    campaign.concepts[0].assets[0].caption = "Teams cut admin by 42% with this workflow.";
    const result = validateCampaignQuality(campaign, dna, "goal", ["instagram"]);
    expect(result.issues.some((issue) => issue.code === "unsupported_metric")).toBe(true);
  });

  it("allows a metric when it is present in the supplied evidence", () => {
    const campaign = makeCampaign();
    campaign.concepts[0].assets[0].caption = "Our launch offer is 20% off this week.";
    const result = validateCampaignQuality(
      campaign,
      dna,
      "Promote our verified 20% off launch offer this week",
      ["instagram"]
    );
    expect(result.issues.some((issue) => issue.code === "unsupported_metric")).toBe(false);
  });

  it("rejects generic marketing cliches", () => {
    const campaign = makeCampaign();
    campaign.concepts[0].assets[0].caption = "Imagine a world where admin disappears.";
    const result = validateCampaignQuality(campaign, dna, "goal", ["instagram"]);
    expect(result.issues.some((issue) => issue.code === "generic_cliche")).toBe(true);
  });

  it("rejects hooks repeated across three or more assets", () => {
    const campaign = makeCampaign();
    campaign.concepts.slice(0, 3).forEach((concept, index) => {
      concept.assets[0].caption = `Discover how your workflow improves with idea ${index + 1}.`;
    });
    const result = validateCampaignQuality(campaign, dna, "goal", ["instagram"]);
    expect(result.issues.some((issue) => issue.code === "repeated_hook")).toBe(true);
  });

  it("rejects campaigns dominated by dashboard and device imagery", () => {
    const campaign = makeCampaign();
    campaign.concepts.forEach((concept, index) => {
      concept.assets[0].imagePrompt = `software dashboard on a laptop, variation ${index + 1}`;
    });
    const result = validateCampaignQuality(campaign, dna, "goal", ["instagram"]);
    expect(result.issues.some((issue) => issue.code === "repetitive_visuals")).toBe(true);
  });
});
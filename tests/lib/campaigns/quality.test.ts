import { describe, expect, it } from "vitest";
import type { GeneratedCampaign } from "@/lib/campaigns/generator";
import { validateCampaignQuality } from "@/lib/campaigns/quality";
import { makeBrandDNA } from "../../fixtures/brand-dna";

const dna = makeBrandDNA();
const strategies = [
  "problem_awareness",
  "education",
  "proof_trust",
  "solution_product",
  "conversion",
] as const;
const platformCaptions: Record<string, string[]> = {
  instagram: [
    "That quote you forgot to chase can quietly become a lost job. Save this follow-up reminder.",
    "Before automating admin, map the handoff: who touches it, where it waits, and what repeats.",
    "Behind the scenes, compare a manual handoff with the automated version and look for avoidable delays.",
    "Quoting, customer updates, and follow-ups should move together instead of living in separate tools.",
    "Five subscriptions can still leave one messy workflow. Check what could be consolidated before adding another app.",
  ],
  linkedin: [
    "Missed quote follow-ups are not merely an admin problem; they reveal a break in the revenue workflow. A reliable system makes ownership and timing explicit.",
    "Automation works best after the process is understood. Map the handoffs first, then remove repeated steps instead of automating existing confusion.",
    "Trust in automation starts with process transparency. Show what happens before, during, and after a task so teams can evaluate the workflow on evidence rather than hype.",
    "The useful question is not how many features software has. It is whether quoting, communication, and follow-up match the way the team actually operates.",
    "Before buying another subscription, compare the whole operating workflow. Consolidation can be more valuable than adding another isolated tool.",
  ],
  facebook: [
    "You send a quote, get busy on the next job, and the follow-up slips. A simple ownership step can stop good opportunities disappearing into the week.",
    "If admin feels heavier every month, sketch the process on paper first. Mark every wait, handoff, and repeated entry before deciding what to automate.",
    "A useful automation demo should make the process visible, not hide it behind buzzwords. Compare the manual steps with the proposed flow and ask what actually changes.",
    "When quoting lives in one app and customer updates in another, the team ends up joining the dots manually. The better system follows the real workflow.",
    "Paying for several tools does not guarantee a connected process. It can be worth checking which subscriptions overlap and where the gaps still sit.",
  ],
  twitter: [
    "A missed quote follow-up is a workflow leak, not just forgotten admin. Make ownership and timing explicit.",
    "Do not automate a messy process first. Map the handoffs, waits and repeated entries, then remove what should not exist.",
    "Good automation is inspectable: show the manual flow, show the proposed flow, then compare what actually changes.",
    "Software should follow the operating workflow. Quoting, updates and follow-up should not require staff to stitch systems together.",
    "Before adding another subscription, map the full workflow. Consolidation may solve more than another disconnected tool.",
  ],
};
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
      strategy: strategies[conceptIndex],
      description: `Description ${conceptIndex + 1}`,
      theme: `theme-${conceptIndex + 1}`,
      assets: platforms.map((platform) => ({
        platform,
        caption: platformCaptions[platform]?.[conceptIndex] ?? `Angle ${conceptIndex + 1} for ${platform}`,
        hashtags: [`coffee-${platform}-${conceptIndex + 1}`],
        cta: `${platform} CTA ${conceptIndex + 1}`,
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

  it.each([
    "Automation isn't just a buzzword; it's a business necessity.",
    "Curious about automation? Here are the benefits.",
    "Worried about custom software? Think again.",
    "Why settle for generic software?",
  ])("rejects templated marketing phrasing: %s", (caption) => {
    const campaign = makeCampaign();
    campaign.concepts[0].assets[0].caption = caption;
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

  it("requires the five strategic roles in the expected order", () => {
    const campaign = makeCampaign();
    campaign.concepts[0].strategy = "education";
    const result = validateCampaignQuality(campaign, dna, "goal", ["instagram"]);
    expect(result.issues.some((issue) => issue.code === "strategy_coverage")).toBe(true);
  });

  it.each([
    "Success story alert! A local business partnered with us to reclaim time.",
    "Explore our latest case study: A small business transformed its operations.",
    "See how we helped a local business streamline their operations.",
  ])("rejects unverified customer proof: %s", (caption) => {
    const campaign = makeCampaign();
    campaign.concepts[2].assets[0].caption = caption;
    const result = validateCampaignQuality(campaign, dna, "goal", ["instagram"]);
    expect(result.issues.some((issue) => issue.code === "unsupported_evidence_claim")).toBe(true);
  });

  it("allows a case study when the named customer is present in verified evidence", () => {
    const campaign = makeCampaign();
    campaign.concepts[2].assets[0].caption =
      "Case study: Northside Builders Pty Ltd partnered with us to streamline quoting.";
    const verifiedDna = makeBrandDNA({
      rawText: "Case study: Northside Builders Pty Ltd partnered with us to streamline quoting.",
    });
    const result = validateCampaignQuality(campaign, verifiedDna, "goal", ["instagram"]);
    expect(result.issues.some((issue) => issue.code === "unsupported_evidence_claim")).toBe(false);
    expect(result.issues.some((issue) => issue.code === "unsupported_entity")).toBe(false);
  });

  it("rejects an invented free consultation", () => {
    const campaign = makeCampaign();
    campaign.concepts[4].assets[0].caption = "Book a free consultation to discuss your workflow.";
    const result = validateCampaignQuality(campaign, dna, "goal", ["instagram"]);
    expect(result.issues.some((issue) => issue.code === "unsupported_offer")).toBe(true);
  });

  it("allows an offer explicitly supplied in the campaign goal", () => {
    const campaign = makeCampaign();
    campaign.concepts[4].assets[0].caption = "Book a free consultation to discuss your workflow.";
    const result = validateCampaignQuality(
      campaign,
      dna,
      "Promote our free consultation for Australian businesses",
      ["instagram"]
    );
    expect(result.issues.some((issue) => issue.code === "unsupported_offer")).toBe(false);
  });

  it("rejects invented downloadable brand resources but allows an inline checklist", () => {
    const campaign = makeCampaign();
    campaign.concepts[1].assets[0].caption = "Download our efficiency checklist to audit your workflow.";
    let result = validateCampaignQuality(campaign, dna, "goal", ["instagram"]);
    expect(result.issues.some((issue) => issue.code === "unsupported_resource")).toBe(true);

    campaign.concepts[1].assets[0].caption =
      "Try this checklist now: map the handoff, note the delay, then remove the repeated step.";
    result = validateCampaignQuality(campaign, dna, "goal", ["instagram"]);
    expect(result.issues.some((issue) => issue.code === "unsupported_resource")).toBe(false);
  });

  it("rejects concepts that are semantically near-duplicates", () => {
    const campaign = makeCampaign();
    campaign.concepts[0].name = "Admin workflow delays";
    campaign.concepts[0].description = "Manual admin quoting follow ups create workflow delays for service teams.";
    campaign.concepts[0].theme = "admin";
    campaign.concepts[0].assets[0].caption =
      "Manual admin and quoting follow ups create workflow delays for service teams every week.";
    campaign.concepts[1].name = "Admin workflow bottlenecks";
    campaign.concepts[1].description = "Manual admin quoting follow ups create workflow delays for trade teams.";
    campaign.concepts[1].theme = "admin";
    campaign.concepts[1].assets[0].caption =
      "Manual admin and quoting follow ups create workflow delays for trade teams every day.";

    const result = validateCampaignQuality(campaign, dna, "goal", ["instagram"]);
    expect(result.issues.some((issue) => issue.code === "concept_similarity")).toBe(true);
  });
  it("does not treat a negated guarantee statement as an invented offer", () => {
    const campaign = makeCampaign();
    campaign.concepts[4].assets[0].caption =
      "Paying for several tools does not guarantee a connected process.";
    const result = validateCampaignQuality(campaign, dna, "goal", ["instagram"]);
    expect(result.issues.some((issue) => issue.code === "unsupported_offer")).toBe(false);
  });

  it("limits question-style opening hooks across the campaign", () => {
    const campaign = makeCampaign(["instagram"]);
    campaign.concepts.slice(0, 3).forEach((concept, index) => {
      concept.assets[0].caption = `Is admin issue ${index + 1} slowing the team? Fix the workflow before adding tools.`;
    });
    const result = validateCampaignQuality(campaign, dna, "goal", ["instagram"]);
    expect(result.issues.some((issue) => issue.code === "question_hook_overuse")).toBe(true);
  });

  it("rejects repeated CTA wording more than twice", () => {
    const campaign = makeCampaign(["instagram"]);
    campaign.concepts.slice(0, 3).forEach((concept) => {
      concept.assets[0].cta = "Tell us what is slowing you down";
    });
    const result = validateCampaignQuality(campaign, dna, "goal", ["instagram"]);
    expect(result.issues.some((issue) => issue.code === "repeated_cta")).toBe(true);
  });

  it("rejects identical non-empty hashtag sets across assets", () => {
    const campaign = makeCampaign(["instagram"]);
    campaign.concepts[0].assets[0].hashtags = ["automation", "workflow"];
    campaign.concepts[1].assets[0].hashtags = ["workflow", "automation"];
    const result = validateCampaignQuality(campaign, dna, "goal", ["instagram"]);
    expect(result.issues.some((issue) => issue.code === "repeated_hashtag_set")).toBe(true);
  });

  it("rejects near-duplicate copy across platforms within one concept", () => {
    const campaign = makeCampaign(["instagram", "linkedin"]);
    campaign.concepts[0].assets[0].caption =
      "Manual quote follow ups create workflow delays and lost opportunities for busy service teams.";
    campaign.concepts[0].assets[1].caption =
      "Manual quote follow ups create workflow delays and lost opportunities across busy service teams.";
    const result = validateCampaignQuality(campaign, dna, "goal", ["instagram", "linkedin"]);
    expect(result.issues.some((issue) => issue.code === "cross_platform_similarity")).toBe(true);
  });

  it("enforces platform hashtag limits", () => {
    const campaign = makeCampaign(["twitter"]);
    campaign.concepts[0].assets[0].hashtags = ["one", "two", "three"];
    const result = validateCampaignQuality(campaign, dna, "goal", ["twitter"]);
    expect(result.issues.some((issue) => issue.code === "platform_style")).toBe(true);
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
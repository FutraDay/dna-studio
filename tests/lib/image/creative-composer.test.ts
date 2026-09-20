import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  buildCreativeCopy,
  prepareCampaignBackgroundPrompt,
  renderProfessionalCreative,
} from "@/lib/image/creative-composer";
import type { BrandDNA } from "@/lib/brand-dna/types";

const dna: Partial<BrandDNA> = {
  name: "FutraDay",
  tagline: "Build. Automate. Scale.",
  industry: "Software Development",
  colors: [
    { hex: "#F4F7F4", name: "White", usage: "primary", rgb: [244, 247, 244] },
    { hex: "#B8FF2C", name: "Lime", usage: "secondary", rgb: [184, 255, 44] },
  ],
  audience: {
    primary: "Australian small business owners and tradies",
    secondary: "service businesses",
    ageRange: "25-55",
    interests: [],
    painPoints: [],
  },
};

describe("professional creative composer", () => {
  it("turns raw campaign art directions into text-free background plates", () => {
    const result = prepareCampaignBackgroundPrompt(
      "A futuristic dashboard with charts, graphs, logo lockup, readable UI interface and a robot operator",
      dna
    );

    expect(result).toContain("BACKGROUND PLATE ONLY");
    expect(result).toContain("NO readable text");
    expect(result).toContain("Australian small-business context");
    expect(result).toContain("#B8FF2C");
    expect(result.toLowerCase()).not.toContain("futuristic dashboard");
    expect(result.toLowerCase()).not.toContain("robot operator");
  });

  it("derives the headline, subhead, CTA and brand colours deterministically", () => {
    const copy = buildCreativeCopy({
      dna,
      platform: "linkedin",
      caption:
        "Repetitive admin steals time from the work that grows the business. Build the workflow around how your team actually works.",
      concepts: [
        {
          name: "Problem Awareness",
          assets: [
            {
              platform: "linkedin",
              caption:
                "Repetitive admin steals time from the work that grows the business. Build the workflow around how your team actually works.",
              cta: "Show me what could work better",
            },
          ],
        },
      ],
    });

    expect(copy.brandName).toBe("FutraDay");
    expect(copy.headline).toBe("Repetitive admin steals time from the work that grows the business.");
    expect(copy.subhead).toBe("Build the workflow around how your team actually works.");
    expect(copy.cta).toBe("Show me what could work better");
    expect(copy.accent).toBe("#B8FF2C");
  });

  it("cleans page-title suffixes and long CTA text before composition", () => {
    const copy = buildCreativeCopy({
      dna: {
        ...dna,
        name: "FutraDay | AI Automation & Custom Software Development",
        tagline: "A very long site description that should not become a giant advertising strapline inside the generated creative layout",
        keywords: ["Custom Software", "AI Automation", "Business Systems"],
      },
      platform: "instagram",
      caption: "The workflow should fit the business. Practical systems remove repeated work.",
      concepts: [
        {
          assets: [
            {
              platform: "instagram",
              caption: "The workflow should fit the business. Practical systems remove repeated work.",
              cta: "Map one workflow from start to finish before deciding what to automate next",
            },
          ],
        },
      ],
    });

    expect(copy.brandName).toBe("FutraDay");
    expect(copy.tagline).toBe("Custom Software / AI Automation / Business Systems");
    expect(copy.cta).toBe("See what could work better");
  });

  it("renders a deterministic 1080x1080 PNG over a photographic background", async () => {
    const background = await sharp({
      create: { width: 720, height: 720, channels: 3, background: "#444444" },
    })
      .png()
      .toBuffer();
    const copy = buildCreativeCopy({
      dna,
      platform: "instagram",
      caption:
        "Less paperwork means more time on the work that matters. Practical software can remove repeated admin from the day.",
    });

    const output = await renderProfessionalCreative(background, copy);
    const metadata = await sharp(output).metadata();

    expect(metadata.format).toBe("png");
    expect(metadata.width).toBe(1080);
    expect(metadata.height).toBe(1080);
    expect(output.length).toBeGreaterThan(10_000);
  });
});
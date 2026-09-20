import { describe, expect, it } from "vitest";
import {
  buildBrandStyleGuideHtml,
  styleGuideFilename,
} from "@/lib/brand-dna/style-guide";
import { makeBrandDNA } from "../../fixtures/brand-dna";

describe("brand style guide HTML", () => {
  it("renders the core brand sections from saved DNA", () => {
    const html = buildBrandStyleGuideHtml(makeBrandDNA(), {
      workspaceName: "Acme Team",
      generatedAt: new Date("2026-09-20T00:00:00.000Z"),
    });

    expect(html).toContain("Brand Style Guide");
    expect(html).toContain("Acme Coffee");
    expect(html).toContain("Roasted with intent");
    expect(html).toContain("Color palette");
    expect(html).toContain("#6F4E37");
    expect(html).toContain("Playfair Display");
    expect(html).toContain("Voice and tone");
    expect(html).toContain("Audience");
    expect(html).toContain("Home brewers");
    expect(html).toContain("stale beans");
    expect(html).toContain("single origin");
    expect(html).toContain("Acme Team");
    expect(html).toContain("20 Sept 2026");
  });

  it("escapes user-controlled HTML instead of executing it", () => {
    const html = buildBrandStyleGuideHtml(
      makeBrandDNA({
        name: '<script>alert("x")</script>',
        tagline: "<b>Unsafe</b>",
        keywords: ['"><img src=x onerror=alert(1)>'],
      }),
      { generatedAt: new Date("2026-09-20T00:00:00.000Z") }
    );

    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<b>Unsafe</b>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;b&gt;Unsafe&lt;/b&gt;");
  });

  it("does not embed ordinary remote brand assets", () => {
    const html = buildBrandStyleGuideHtml(
      makeBrandDNA({
        logoUrl: "https://example.com/logo.png",
        favicon: "https://example.com/favicon.ico",
      })
    );

    expect(html).not.toContain(
      '<img class="cover-logo-img" src="https://example.com/logo.png"'
    );
    expect(html).toContain("https://example.com/logo.png");
    expect(html).toContain("External assets are not fetched");
  });

  it("permits an already embedded data image without external network access", () => {
    const dataUrl = "data:image/png;base64,iVBORw0KGgo=";
    const html = buildBrandStyleGuideHtml(
      makeBrandDNA({ logoUrl: dataUrl })
    );

    expect(html).toContain('class="cover-logo-img"');
    expect(html).toContain(dataUrl);
  });

  it("handles empty optional collections without breaking the guide", () => {
    const html = buildBrandStyleGuideHtml(
      makeBrandDNA({
        colors: [],
        fonts: [],
        keywords: [],
        audience: {
          primary: "",
          secondary: "",
          ageRange: "",
          interests: [],
          painPoints: [],
        },
      })
    );

    expect(html).toContain("No palette was captured.");
    expect(html).toContain("No typography was captured.");
    expect(html).toContain("No keywords captured");
    expect(html).toContain("Not captured");
  });

  it("clamps invalid tone percentages and ignores unsafe color CSS", () => {
    const html = buildBrandStyleGuideHtml(
      makeBrandDNA({
        colors: [
          {
            hex: "red; background:url(http://evil)",
            name: "Unsafe",
            usage: "primary",
            rgb: [1, 2, 3],
          },
        ],
        tone: {
          ...makeBrandDNA().tone,
          formality: 150,
          energy: -20,
          warmth: Number.NaN,
        },
      })
    );

    expect(html).toContain("background:#777777");
    expect(html).not.toContain("background:url");
    expect(html).toContain("<strong>100%</strong>");
    expect(html).toContain("<strong>0%</strong>");
  });
});

describe("styleGuideFilename", () => {
  it.each([
    ["Acme Coffee", "Acme-Coffee-style-guide.pdf"],
    ["  Dan's Carpet Repairs  ", "Dan-s-Carpet-Repairs-style-guide.pdf"],
    ["../", "brand-style-guide.pdf"],
  ])("creates a safe attachment filename", (name, expected) => {
    expect(styleGuideFilename(name)).toBe(expected);
  });
});

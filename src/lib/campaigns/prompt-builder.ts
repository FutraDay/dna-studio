import type { BrandDNA } from "../brand-dna/types";

export function buildBrandContext(dna: BrandDNA): string {
  const colors = dna.colors.map((c) => `${c.name} (${c.hex})`).join(", ");
  const fonts = dna.fonts.map((f) => `${f.family} (${f.usage})`).join(", ");

  return `BRAND PROFILE:
- Name: ${dna.name}
- Tagline: ${dna.tagline}
- Industry: ${dna.industry} / ${dna.category}
- Brand Colors: ${colors}
- Typography: ${fonts}
- Tone: ${dna.tone.primary} (primary), ${dna.tone.secondary} (secondary)
  - Formality: ${dna.tone.formality}/100
  - Energy: ${dna.tone.energy}/100
  - Warmth: ${dna.tone.warmth}/100
  - Style: ${dna.tone.description}
- Target Audience: ${dna.audience.primary} (primary), ${dna.audience.secondary} (secondary)
  - Age Range: ${dna.audience.ageRange}
  - Interests: ${dna.audience.interests.join(", ")}
  - Pain Points: ${dna.audience.painPoints.join(", ")}
- Keywords: ${dna.keywords.join(", ")}`;
}

export function buildCampaignPrompt(
  dna: BrandDNA,
  goal: string,
  platforms: string[],
  language: string = "English"
): string {
  const brandContext = buildBrandContext(dna);

  return `You are an expert social media marketing strategist. Generate a comprehensive campaign.

${brandContext}

CAMPAIGN GOAL: ${goal}
TARGET PLATFORMS: ${platforms.join(", ")}
LANGUAGE: ${language}

Generate exactly 5 campaign concepts. The five concepts must have DISTINCT strategic roles, in this order:
1. Problem awareness - expose one specific audience pain point with a concrete, relatable situation.
2. Education - teach a useful principle, framework, checklist, myth-bust, or how-to related to the goal.
3. Proof and trust - use a credible result pattern, mini case-study structure, before/after, demonstration idea, or evidence-led angle. Never invent customer names, testimonials, metrics, or claims.
4. Solution and product - explain how the brand's real product/service solves a specific problem without generic feature dumping.
5. Conversion - address an objection, create a reason to act, or make a clear low-friction offer/CTA.

For each concept, create genuinely platform-specific content rather than shortening the same copy.

Return a JSON object with this EXACT structure:
{
  "concepts": [
    {
      "name": "<campaign concept name>",
      "description": "<2-3 sentence concept description>",
      "theme": "<one-word theme>",
      "assets": [
        {
          "platform": "<instagram|linkedin|facebook|twitter>",
          "caption": "<platform-appropriate caption with line breaks>",
          "hashtags": ["<hashtag1>", "<hashtag2>", "<hashtag3>"],
          "cta": "<call to action>",
          "imagePrompt": "<detailed image generation prompt that incorporates brand colors ${dna.colors.map((c) => c.hex).join(", ")} and ${dna.tone.primary} aesthetic>"
        }
      ]
    }
  ]
}

CONTENT DIVERSITY RULES:
1. Do not reuse the same opening hook, sentence pattern, CTA, or central example across concepts.
2. Do not make every concept about the same pain point. Spread the campaign across different audience pains, desired outcomes, objections, and buying motivations from the Brand Profile.
3. Avoid generic AI-marketing cliches such as "imagine a world", "game changer", "revolutionize your business", "unlock the power", "head spin", or "pain into gains" unless the user's goal explicitly asks for that language.
4. Every concept must contain at least one concrete detail grounded in the Brand Profile or campaign goal. Do not invent facts, customers, testimonials, performance metrics, awards, partnerships, or product capabilities.
5. Vary the content format across concepts where appropriate: observation, checklist, myth-bust, mini case study, before/after, demonstration, objection handling, founder insight, or direct offer.

PLATFORM RULES:
6. Instagram: visual-first hook, concise useful caption, natural emoji use only when it fits, and a save/share/comment-friendly CTA.
7. LinkedIn: professional B2B insight with a clear point of view, useful reasoning, and minimal hashtag clutter. Do not write like an Instagram caption.
8. Facebook: conversational and relatable, with enough context to stand alone and a low-friction response CTA.
9. Twitter: under 280 characters, sharp and specific, with no filler. Prefer one strong observation or claim over a compressed long-form post.
10. All content must match the brand's ${dna.tone.primary} tone.
11. All content must be in ${language}.
12. Hashtags must be relevant; avoid repeating an identical hashtag set on every asset.

VISUAL DIVERSITY RULES:
13. The five concepts must use materially different visual treatments. Rotate among real-world customer/problem scenes, branded conceptual/process imagery, product/service context, before-and-after or transformation imagery, and outcome-focused scenes.
14. Do not make every visual a laptop, dashboard, device mockup, or abstract chart, even for software/AI brands.
15. Do NOT invent fake product screenshots or fake readable UI and present them as the brand's real software. If showing a conceptual interface, make it clearly illustrative and avoid tiny pseudo-text.
16. Avoid generated marketing copy, labels, statistics, logos, and tiny text inside the image. The social post caption carries the message.
17. Image prompts must reference the brand's actual colors and visual tone while changing composition, setting, subject, camera angle, and visual metaphor across concepts.`;
}

export function buildImagePrompt(
  dna: BrandDNA,
  conceptTheme: string,
  platform: string
): string {
  const primaryColor = dna.colors[0]?.hex || "#6366F1";
  const secondaryColor = dna.colors[1]?.hex || "#818CF8";

  const dimensions: Record<string, string> = {
    instagram: "1080x1080 square",
    facebook: "1200x630 landscape",
    linkedin: "1200x627 landscape",
    twitter: "1600x900 landscape",
  };

  return `Create a ${dna.tone.primary}, ${dna.tone.secondary} marketing image for ${dna.name}.
Theme: ${conceptTheme}
Industry: ${dna.industry}
Primary color: ${primaryColor}
Secondary color: ${secondaryColor}
Format: ${dimensions[platform] || "1080x1080 square"}
Style: Modern, clean, professional. The image should feel on-brand for a ${dna.industry} company with a ${dna.tone.primary} voice.
Do NOT include any text in the image.`;
}

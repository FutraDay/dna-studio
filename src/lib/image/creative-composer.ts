import sharp from "sharp";
import type { BrandDNA } from "@/lib/brand-dna/types";

export type CreativePreset =
  | "professional"
  | "tradie"
  | "product"
  | "before-after";

export type CreativeCopy = {
  brandName: string;
  tagline: string;
  headline: string;
  subhead: string;
  cta: string;
  accent: string;
  text: string;
  platform: string;
  preset: CreativePreset;
};

type ConceptLike = {
  name?: string;
  description?: string;
  assets?: Array<{
    platform?: string;
    caption?: string;
    cta?: string;
  }>;
};

const LOCAL_PROMPT_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\b(?:chart|graph|infographic|flowchart|diagram)\b/gi, "business workspace"],
  [/\b(?:dashboard|user interface|UI interface|software interface)\b/gi, "subtle digital workflow context"],
  [/\b(?:robot|cyborg|android humanoid|sci[- ]?fi HUD)\b/gi, "business professional"],
  [/\b(?:headline|typography|written text|logo lockup)\b/gi, ""],
];

function cleanSpaces(value: string): string {
  return value.replace(/\s{2,}/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim();
}

function cleanDisplayText(value: string): string {
  return cleanSpaces(
    value.replace(/\uFFFD/g, "").replace(/[\u0000-\u001F\u007F]/g, " ")
  );
}

function cleanBrandName(value: string): string {
  const cleaned = cleanDisplayText(value).split(/\s+[|]\s+/)[0].trim();
  return cleaned.length > 42 ? cleaned.slice(0, 42).trim() : cleaned;
}

function compactTagline(dna: Partial<BrandDNA>): string {
  const tagline = cleanDisplayText(dna.tagline || "");
  if (tagline && tagline.split(/\s+/).length <= 8 && tagline.length <= 64) return tagline;
  const keywords = (dna.keywords || []).map(cleanDisplayText).filter(Boolean).slice(0, 3);
  if (keywords.length >= 2) return keywords.join(" / ");
  return cleanDisplayText(dna.industry || "");
}

export function prepareCampaignBackgroundPrompt(
  prompt: string,
  dna?: Partial<BrandDNA> | null,
  preset: CreativePreset = "professional"
): string {
  const cleaned = LOCAL_PROMPT_REPLACEMENTS.reduce(
    (value, [pattern, replacement]) => value.replace(pattern, replacement),
    prompt
  );
  const accent = dna?.colors?.find((color) => color.usage === "secondary" || color.usage === "accent")?.hex;
  const audience = dna?.audience?.primary;
  const mode =
    preset === "tradie"
      ? "authentic Australian trade or service-business environment, practical workwear, real tools and job context"
      : preset === "product"
        ? "premium modern business workspace, laptop or phone present with screens softly blurred and unreadable"
        : preset === "before-after"
          ? "credible business environment showing visible contrast between cluttered manual work and an organised modern workflow"
          : "premium commercial editorial business photography, credible real-world workplace";

  return cleanSpaces(
    [
      "BACKGROUND PLATE ONLY for a professionally typeset advertisement.",
      mode + ".",
      audience ? `Audience context: ${audience}.` : "",
      accent ? `Use restrained visual accents inspired by ${accent}, without drawing text or logos.` : "",
      cleaned,
      "Photorealistic, polished commercial lighting, strong subject separation, believable Australian small-business context when relevant.",
      "Leave useful negative space for later graphic design overlays.",
      "NO readable text, NO letters, NO numbers, NO logos, NO watermarks, NO charts, NO graphs, NO dashboards, NO diagrams, NO infographics, NO fake software UI, NO sci-fi HUD, NO robots or cyborgs unless explicitly required by the campaign subject.",
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function stripHashtags(value: string): string {
  return value.replace(/(^|\s)#[\p{L}\p{N}_-]+/gu, " ");
}

function sentenceParts(value: string): string[] {
  return stripHashtags(cleanDisplayText(value))
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function clampWords(value: string, maxWords: number): string {
  const words = cleanDisplayText(value).split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return `${words.slice(0, maxWords).join(" ").replace(/[,:;.!?]+$/, "")}...`;
}

function clampWordsPlain(value: string, maxWords: number): string {
  return cleanDisplayText(value)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maxWords)
    .join(" ")
    .replace(/[,:;.!?]+$/, "");
}

function wrapText(value: string, maxChars: number, maxLines: number): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxChars || !line) {
      line = candidate;
      continue;
    }
    lines.push(line);
    line = word;
    if (lines.length === maxLines - 1) break;
  }
  if (line && lines.length < maxLines) {
    const consumed = lines.join(" ").split(/\s+/).filter(Boolean).length;
    const remaining = words.slice(consumed).join(" ");
    lines.push(remaining.length > maxChars ? `${remaining.slice(0, maxChars - 1).trimEnd()}…` : remaining);
  }
  return lines.slice(0, maxLines);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function colourFromDNA(dna: Partial<BrandDNA>, usage: string[], fallback: string): string {
  const match = dna.colors?.find((color) => usage.includes(color.usage));
  return match?.hex || fallback;
}

function readableTextColour(dna: Partial<BrandDNA>): string {
  const text = colourFromDNA(dna, ["text", "primary"], "#FFFFFF");
  return /^#(?:f|e|d|c)/i.test(text) ? text : "#FFFFFF";
}

function splitWordmark(name: string): [string, string] {
  const camel = name.match(/^(.+?)([A-Z][a-z0-9]+)$/);
  if (camel) return [camel[1], camel[2]];
  const words = name.trim().split(/\s+/);
  if (words.length > 1) return [words.slice(0, -1).join(" ") + " ", words.at(-1) || ""];
  return [name, ""];
}

export function buildCreativeCopy(args: {
  dna: Partial<BrandDNA>;
  caption: string;
  platform: string;
  concepts?: ConceptLike[];
  preset?: CreativePreset;
}): CreativeCopy {
  const { dna, caption, platform, concepts = [], preset = "professional" } = args;
  const match = concepts
    .flatMap((concept) =>
      (concept.assets || []).map((asset) => ({ concept, asset }))
    )
    .find(({ asset }) => asset.platform === platform && asset.caption === caption);
  const parts = sentenceParts(caption);
  const headline = clampWords(parts[0] || match?.concept.name || "Built around how your business works.", 11);
  const subhead = clampWords(
    parts[1] || match?.concept.description || dna.tagline || "Practical systems designed around the real workflow.",
    22
  );
  const rawCta = cleanDisplayText(match?.asset.cta || "See what could work better");
  const cta = rawCta.split(/\s+/).filter(Boolean).length > 8
    ? "See what could work better"
    : clampWordsPlain(rawCta, 8);

  return {
    brandName: cleanBrandName(dna.name || "Your Brand"),
    tagline: compactTagline(dna),
    headline,
    subhead,
    cta,
    accent: colourFromDNA(dna, ["secondary", "accent"], "#B8FF2C"),
    text: readableTextColour(dna),
    platform,
    preset,
  };
}

export async function renderProfessionalCreative(
  background: Buffer,
  copy: CreativeCopy
): Promise<Buffer> {
  const width = 1080;
  const height = 1080;
  const headlineLines = wrapText(copy.headline, 27, 3);
  const subheadLines = wrapText(copy.subhead, 54, 2);
  const [brandLead, brandAccent] = splitWordmark(copy.brandName);
  const headlineStart = 680 - Math.max(0, headlineLines.length - 2) * 54;
  const accent = escapeXml(copy.accent);
  const text = escapeXml(copy.text);

  const svg = `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#050706" stop-opacity="0.10"/>
        <stop offset="0.44" stop-color="#050706" stop-opacity="0.22"/>
        <stop offset="0.62" stop-color="#050706" stop-opacity="0.78"/>
        <stop offset="1" stop-color="#050706" stop-opacity="0.98"/>
      </linearGradient>
      <linearGradient id="cta" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="${accent}" stop-opacity="0.98"/>
        <stop offset="1" stop-color="${accent}" stop-opacity="0.72"/>
      </linearGradient>
      <filter id="glow"><feGaussianBlur stdDeviation="11" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <rect width="1080" height="1080" fill="url(#fade)"/>
    <path d="M690 0 L1080 0 L1080 250" fill="none" stroke="${accent}" stroke-width="6" opacity="0.86" filter="url(#glow)"/>
    <path d="M0 1030 C260 930 550 1085 1080 930" fill="none" stroke="${accent}" stroke-width="3" opacity="0.68" filter="url(#glow)"/>
    <rect x="62" y="58" width="956" height="118" rx="28" fill="#050706" fill-opacity="0.64" stroke="${accent}" stroke-opacity="0.28"/>
    <text x="92" y="125" font-family="Segoe UI, Arial, sans-serif" font-size="54" font-weight="800" fill="${text}">${escapeXml(brandLead)}<tspan fill="${accent}">${escapeXml(brandAccent)}</tspan></text>
    <text x="94" y="157" font-family="Segoe UI, Arial, sans-serif" font-size="17" font-weight="650" letter-spacing="5" fill="${accent}">${escapeXml((copy.tagline || "BUILD · AUTOMATE · SCALE").toUpperCase().slice(0, 54))}</text>
    <rect x="0" y="560" width="1080" height="520" fill="url(#fade)"/>
    <text x="74" y="${headlineStart}" font-family="Segoe UI, Arial, sans-serif" font-size="72" font-weight="850" fill="${text}" letter-spacing="-2">
      ${headlineLines.map((line, index) => `<tspan x="74" dy="${index === 0 ? 0 : 78}">${escapeXml(line)}</tspan>`).join("")}
    </text>
    <rect x="74" y="${headlineStart + headlineLines.length * 78 + 18}" width="170" height="7" rx="3.5" fill="${accent}" filter="url(#glow)"/>
    <text x="74" y="${headlineStart + headlineLines.length * 78 + 82}" font-family="Segoe UI, Arial, sans-serif" font-size="28" font-weight="500" fill="#F4F7F4" opacity="0.94">
      ${subheadLines.map((line, index) => `<tspan x="74" dy="${index === 0 ? 0 : 37}">${escapeXml(line)}</tspan>`).join("")}
    </text>
    <rect x="74" y="934" width="720" height="92" rx="46" fill="url(#cta)" filter="url(#glow)"/>
    <text x="116" y="992" font-family="Segoe UI, Arial, sans-serif" font-size="29" font-weight="800" fill="#050706">${escapeXml(copy.cta)}</text>
    <text x="750" y="992" font-family="Segoe UI, Arial, sans-serif" font-size="42" font-weight="900" text-anchor="middle" fill="#050706">&gt;</text>
    <text x="1010" y="1010" font-family="Segoe UI, Arial, sans-serif" font-size="15" font-weight="650" text-anchor="end" letter-spacing="3" fill="${accent}">${escapeXml(copy.platform.toUpperCase())} · CREATIVE</text>
  </svg>`;

  return sharp(background)
    .resize(width, height, { fit: "cover", position: "attention" })
    .modulate({ brightness: 0.82, saturation: 0.9 })
    .composite([{ input: Buffer.from(svg) }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}
import type { BrandDNA, ColorInfo, FontInfo } from "./types";

export interface StyleGuideMeta {
  workspaceName?: string | null;
  generatedAt?: Date;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

function safeColor(color: ColorInfo): string {
  return /^#[0-9a-f]{3,8}$/i.test(color.hex) ? color.hex : "#777777";
}

function list(values: string[] | undefined, empty = "Not captured"): string {
  if (!values?.length) {
    return `<span class="muted">${empty}</span>`;
  }

  return values
    .map((value) => `<span class="pill">${escapeHtml(value)}</span>`)
    .join("");
}

function meter(label: string, value: number): string {
  const safeValue = clampPercent(value);
  return `
    <div class="meter-row">
      <div class="meter-label"><span>${escapeHtml(label)}</span><strong>${safeValue}%</strong></div>
      <div class="meter-track"><div class="meter-fill" style="width:${safeValue}%"></div></div>
    </div>
  `;
}

function colorCard(color: ColorInfo): string {
  const hex = safeColor(color);
  const rgb = Array.isArray(color.rgb) ? color.rgb.join(", ") : "";

  return `
    <div class="color-card">
      <div class="swatch" style="background:${hex}"></div>
      <div class="color-meta">
        <strong>${escapeHtml(color.name || color.usage)}</strong>
        <span class="caps">${escapeHtml(color.usage)}</span>
        <code>${escapeHtml(hex)}</code>
        ${rgb ? `<span class="muted">RGB ${escapeHtml(rgb)}</span>` : ""}
      </div>
    </div>
  `;
}

function fontCard(font: FontInfo): string {
  const family = escapeHtml(font.family);
  return `
    <div class="font-card">
      <div class="font-sample" style="font-family:'${family}', Arial, sans-serif">Aa</div>
      <div>
        <strong>${family}</strong>
        <div class="muted">${escapeHtml(font.usage)}${font.weight ? ` - ${escapeHtml(font.weight)}` : ""}</div>
      </div>
    </div>
  `;
}

function isEmbeddedImage(value: string | null | undefined): boolean {
  if (!value || value.length > 2_000_000) return false;
  return /^data:image\/(png|jpeg|jpg|webp|gif|svg\+xml);base64,/i.test(value);
}

function logoMark(dna: BrandDNA): string {
  if (isEmbeddedImage(dna.logoUrl)) {
    return `<img class="cover-logo-img" src="${escapeHtml(dna.logoUrl)}" alt="${escapeHtml(dna.name)} logo" />`;
  }

  const initial = (dna.name || "B").trim().charAt(0).toUpperCase() || "B";
  return `<div class="cover-logo-fallback">${escapeHtml(initial)}</div>`;
}

function sourceAsset(label: string, value: string | null | undefined): string {
  if (!value || value.startsWith("data:")) return "";
  return `
    <div class="source-row">
      <strong>${escapeHtml(label)}</strong>
      <span>${escapeHtml(value)}</span>
    </div>
  `;
}

export function styleGuideFilename(name: string): string {
  const clean = name
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return `${clean || "brand"}-style-guide.pdf`;
}

export function buildBrandStyleGuideHtml(
  dna: BrandDNA,
  meta: StyleGuideMeta = {}
): string {
  const generatedAt = meta.generatedAt ?? new Date();
  const generatedLabel = new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(generatedAt);

  const colors = dna.colors?.length
    ? dna.colors.map(colorCard).join("")
    : `<p class="muted">No palette was captured.</p>`;

  const fonts = dna.fonts?.length
    ? dna.fonts.map(fontCard).join("")
    : `<p class="muted">No typography was captured.</p>`;

  const assets = [
    sourceAsset("Primary logo", dna.logoUrl),
    sourceAsset("Favicon", dna.favicon),
    sourceAsset("Open Graph image", dna.ogImage),
    ...(dna.logos ?? []).slice(0, 6).map((logo, index) =>
      sourceAsset(logo.alt || `Logo ${index + 1}`, logo.url)
    ),
  ]
    .filter(Boolean)
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(dna.name)} Brand Style Guide</title>
<style>
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    margin: 0;
    color: #141817;
    background: #ffffff;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10.5pt;
    line-height: 1.45;
  }
  @page { size: A4; }
  h1, h2, h3, p { margin-top: 0; }
  h1 { font-size: 34pt; line-height: 1.02; letter-spacing: -1.2px; margin-bottom: 10px; }
  h2 { font-size: 18pt; line-height: 1.15; letter-spacing: -0.3px; margin-bottom: 14px; }
  h3 { font-size: 11pt; margin-bottom: 8px; }
  a { color: inherit; text-decoration: none; }
  .muted { color: #69716f; }
  .caps { text-transform: uppercase; letter-spacing: 1.1px; font-size: 7.5pt; color: #707876; }
  .cover {
    min-height: 245mm;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    break-after: page;
  }
  .cover-top { display: flex; justify-content: space-between; align-items: flex-start; }
  .cover-kicker { font-size: 8pt; text-transform: uppercase; letter-spacing: 1.6px; font-weight: 700; }
  .cover-mark { width: 82px; height: 82px; }
  .cover-logo-img {
    width: 82px; height: 82px; object-fit: contain; border: 1px solid #e3e7e5;
    border-radius: 18px; padding: 10px; background: #fff;
  }
  .cover-logo-fallback {
    width: 82px; height: 82px; display: flex; align-items: center; justify-content: center;
    border-radius: 18px; background: #151a18; color: #b8ff2c;
    font-size: 34pt; font-weight: 800;
  }
  .cover-title { max-width: 155mm; margin: 34mm 0 18mm; }
  .cover-tagline { font-size: 15pt; color: #4f5855; max-width: 135mm; }
  .cover-url { margin-top: 18px; font-size: 9pt; color: #67706d; word-break: break-all; }
  .cover-footer {
    display: flex; justify-content: space-between; gap: 20px; padding-top: 18px;
    border-top: 1px solid #dfe4e2; color: #68716e; font-size: 8.5pt;
  }
  .section { margin-bottom: 18px; break-inside: avoid; }
  .section-title { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
  .section-number {
    width: 24px; height: 24px; border-radius: 7px; display: inline-flex;
    align-items: center; justify-content: center; background: #151a18; color: #b8ff2c;
    font-size: 8pt; font-weight: 800;
  }
  .card {
    border: 1px solid #e0e5e3; border-radius: 12px; padding: 16px;
    break-inside: avoid; background: #fff;
  }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .identity-grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 12px; }
  .label { font-size: 7.5pt; text-transform: uppercase; letter-spacing: 1px; color: #727b78; margin-bottom: 4px; }
  .value { font-size: 11pt; font-weight: 700; }
  .palette { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .color-card { display: grid; grid-template-columns: 54px 1fr; border: 1px solid #e2e7e5; border-radius: 10px; overflow: hidden; min-height: 74px; break-inside: avoid; }
  .swatch { min-height: 74px; }
  .color-meta { padding: 9px 10px; display: flex; flex-direction: column; gap: 2px; }
  .color-meta code { font-family: "Courier New", monospace; font-size: 8.5pt; }
  .font-list { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .font-card { display: flex; align-items: center; gap: 12px; border: 1px solid #e2e7e5; border-radius: 10px; padding: 12px; break-inside: avoid; }
  .font-sample { width: 55px; font-size: 28pt; line-height: 1; color: #252b29; }
  .tone-pair { font-size: 14pt; font-weight: 700; text-transform: capitalize; margin-bottom: 8px; }
  .tone-pair span { color: #7b8582; font-weight: 400; }
  .meter-row { margin-top: 10px; }
  .meter-label { display: flex; justify-content: space-between; font-size: 8.5pt; margin-bottom: 4px; }
  .meter-track { height: 6px; border-radius: 999px; overflow: hidden; background: #e7ebe9; }
  .meter-fill { height: 100%; border-radius: inherit; background: #151a18; }
  .pill { display: inline-block; border: 1px solid #dfe4e2; border-radius: 999px; padding: 4px 8px; margin: 3px 3px 0 0; font-size: 8pt; background: #f7f9f8; }
  .bullet-list { margin: 7px 0 0; padding-left: 17px; }
  .bullet-list li { margin: 4px 0; }
  .source-row { display: grid; grid-template-columns: 34mm 1fr; gap: 8px; padding: 7px 0; border-bottom: 1px solid #eef1f0; font-size: 8pt; }
  .source-row:last-child { border-bottom: 0; }
  .source-row span { color: #66706d; word-break: break-all; }
  .footer-note { margin-top: 18px; color: #7b8582; font-size: 7.5pt; text-align: center; }
</style>
</head>
<body>
  <section class="cover">
    <div>
      <div class="cover-top">
        <div class="cover-kicker">Brand Style Guide</div>
        <div class="cover-mark">${logoMark(dna)}</div>
      </div>
      <div class="cover-title">
        <h1>${escapeHtml(dna.name)}</h1>
        ${dna.tagline ? `<p class="cover-tagline">${escapeHtml(dna.tagline)}</p>` : ""}
        <p class="cover-url">${escapeHtml(dna.url)}</p>
      </div>
    </div>
    <div class="cover-footer">
      <span>Generated from saved Brand DNA</span>
      <span>${meta.workspaceName ? `${escapeHtml(meta.workspaceName)} - ` : ""}${escapeHtml(generatedLabel)}</span>
    </div>
  </section>

  <section class="section">
    <div class="section-title"><span class="section-number">01</span><h2>Brand identity</h2></div>
    <div class="identity-grid">
      <div class="card">
        <div class="label">Brand</div>
        <div class="value">${escapeHtml(dna.name)}</div>
        <div style="height:12px"></div>
        <div class="label">Tagline</div>
        <div>${dna.tagline ? escapeHtml(dna.tagline) : '<span class="muted">Not captured</span>'}</div>
      </div>
      <div class="card">
        <div class="label">Industry</div>
        <div class="value">${escapeHtml(dna.industry || "Not captured")}</div>
        <div style="height:12px"></div>
        <div class="label">Category</div>
        <div>${escapeHtml(dna.category || "Not captured")}</div>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="section-title"><span class="section-number">02</span><h2>Color palette</h2></div>
    <div class="palette">${colors}</div>
  </section>

  <section class="section">
    <div class="section-title"><span class="section-number">03</span><h2>Typography</h2></div>
    <div class="font-list">${fonts}</div>
  </section>

  <section class="section">
    <div class="section-title"><span class="section-number">04</span><h2>Voice and tone</h2></div>
    <div class="grid-2">
      <div class="card">
        <div class="label">Core voice</div>
        <div class="tone-pair">${escapeHtml(dna.tone?.primary || "Not captured")} <span>/ ${escapeHtml(dna.tone?.secondary || "Not captured")}</span></div>
        <p class="muted">${escapeHtml(dna.tone?.description || "No tone description was captured.")}</p>
      </div>
      <div class="card">
        ${meter("Formality", dna.tone?.formality ?? 0)}
        ${meter("Energy", dna.tone?.energy ?? 0)}
        ${meter("Warmth", dna.tone?.warmth ?? 0)}
      </div>
    </div>
  </section>

  <section class="section">
    <div class="section-title"><span class="section-number">05</span><h2>Audience</h2></div>
    <div class="grid-2">
      <div class="card">
        <div class="label">Primary audience</div>
        <div class="value">${escapeHtml(dna.audience?.primary || "Not captured")}</div>
        <div style="height:12px"></div>
        <div class="label">Secondary audience</div>
        <div>${escapeHtml(dna.audience?.secondary || "Not captured")}</div>
        <div style="height:12px"></div>
        <div class="label">Age range</div>
        <div>${escapeHtml(dna.audience?.ageRange || "Not captured")}</div>
      </div>
      <div class="card">
        <div class="label">Interests</div>
        <div>${list(dna.audience?.interests)}</div>
        <div style="height:12px"></div>
        <div class="label">Pain points</div>
        <ul class="bullet-list">
          ${dna.audience?.painPoints?.length
            ? dna.audience.painPoints.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
            : '<li class="muted">Not captured</li>'}
        </ul>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="section-title"><span class="section-number">06</span><h2>Brand language</h2></div>
    <div class="card">
      <div class="label">Keywords and themes</div>
      <div>${list(dna.keywords, "No keywords captured")}</div>
    </div>
  </section>

  ${assets ? `
  <section class="section">
    <div class="section-title"><span class="section-number">07</span><h2>Source assets</h2></div>
    <div class="card">
      <p class="muted" style="margin-bottom:8px">Reference URLs captured during Brand DNA analysis. External assets are not fetched during PDF export.</p>
      ${assets}
    </div>
  </section>
  ` : ""}

  <p class="footer-note">DNA Studio - Brand Style Guide - ${escapeHtml(generatedLabel)}</p>
</body>
</html>`;
}

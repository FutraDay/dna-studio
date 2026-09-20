"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { ColorSwatch } from "@/components/ui/color-swatch";
import { Card } from "@/components/ui/card";
import type { BrandDNA } from "@/lib/brand-dna/types";
import { Link as LinkIcon } from "lucide-react";

interface DNAPreviewProps {
  dna: BrandDNA;
}

export function DNAPreview({ dna }: DNAPreviewProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Brand identity header */}
      <Card className="p-8">
        <div className="flex items-start gap-5">
          {dna.logoUrl ? (
            <Image
              src={dna.logoUrl}
              alt={dna.name}
              width={64}
              height={64}
              unoptimized
              className="w-16 h-16 rounded-xl object-cover bg-white flex-shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-xl bg-accent/20 flex items-center justify-center text-accent font-bold text-2xl font-[family-name:var(--font-heading)] flex-shrink-0">
              {dna.name.charAt(0)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-[family-name:var(--font-heading)] italic">
              {dna.name}
            </h2>
            <a
              href={dna.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted hover:text-accent transition-colors flex items-center gap-1.5 mt-1"
            >
              <LinkIcon className="w-3 h-3" />
              {dna.url}
            </a>
            {dna.tagline && (
              <p className="text-sm text-foreground/60 mt-2">{dna.tagline}</p>
            )}
          </div>
        </div>
      </Card>

      {/* Logos / Brand Assets */}
      {(dna.favicon || dna.ogImage || (dna.logos && dna.logos.length > 0)) && (
        <Card className="p-8">
          <h3 className="text-sm font-medium text-muted mb-6">Brand Assets</h3>
          <div className="flex flex-wrap gap-6 items-start">
            {/* Favicon */}
            {dna.favicon && (
              <BrandAsset
                src={dna.favicon}
                label="Favicon"
                containerClass="w-16 h-16"
              />
            )}

            {/* Logo images from page */}
            {dna.logos?.map((logo, i) => (
              <BrandAsset
                key={logo.url}
                src={logo.url}
                label={logo.alt || `Logo ${i + 1}`}
                containerClass="w-24 h-16"
              />
            ))}

            {/* OG image — wider preview */}
            {dna.ogImage && (
              <BrandAsset
                src={dna.ogImage}
                label="OG Image"
                containerClass="w-48 h-24"
              />
            )}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Colors */}
        <Card className="p-8">
          <h3 className="text-sm font-medium text-muted mb-6">Colors</h3>
          <div className="flex flex-wrap gap-6">
            {dna.colors.map((color) => (
              <div key={color.hex} className="flex flex-col items-center gap-2">
                <ColorSwatch color={color.hex} size="lg" />
                <span className="text-xs text-muted font-mono">{color.hex}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Fonts */}
        <Card className="p-8">
          <h3 className="text-sm font-medium text-muted mb-6">Fonts</h3>
          <div className="space-y-6">
            {dna.fonts.map((font) => (
              <div key={font.family}>
                <div className="flex items-baseline justify-between mb-1">
                  <span
                    className="text-3xl text-foreground/80"
                    style={{ fontFamily: font.family }}
                  >
                    Aa
                  </span>
                  <span className="text-xs text-muted capitalize">{font.usage}</span>
                </div>
                <p className="text-sm text-foreground/60">{font.family}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* Tone of Voice */}
        <Card className="p-8">
          <h3 className="text-sm font-medium text-muted mb-6">Tone of Voice</h3>
          <div className="flex gap-2 mb-5">
            <span className="text-sm text-accent font-medium">{dna.tone.primary}</span>
            <span className="text-sm text-muted">/</span>
            <span className="text-sm text-foreground/60">{dna.tone.secondary}</span>
          </div>
          <p className="text-sm text-foreground/50 mb-6 leading-relaxed">
            {dna.tone.description}
          </p>
          <div className="space-y-4">
            <ToneMeter label="Formality" value={dna.tone.formality} />
            <ToneMeter label="Energy" value={dna.tone.energy} />
            <ToneMeter label="Warmth" value={dna.tone.warmth} />
          </div>
        </Card>

        {/* Audience */}
        <Card className="p-8">
          <h3 className="text-sm font-medium text-muted mb-6">Target Audience</h3>
          <div className="space-y-5">
            <div>
              <span className="text-[11px] uppercase tracking-wider text-muted/60">Primary</span>
              <p className="text-sm font-medium mt-0.5">{dna.audience.primary}</p>
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-wider text-muted/60">Secondary</span>
              <p className="text-sm font-medium mt-0.5">{dna.audience.secondary}</p>
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-wider text-muted/60">Age Range</span>
              <p className="text-sm font-medium mt-0.5">{dna.audience.ageRange}</p>
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-wider text-muted/60">Interests</span>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {dna.audience.interests.map((interest) => (
                  <span
                    key={interest}
                    className="text-xs text-foreground/60 bg-card-hover px-2 py-0.5 rounded"
                  >
                    {interest}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Keywords + Industry */}
      <Card className="p-8">
        <div className="flex flex-wrap gap-x-8 gap-y-4">
          <div>
            <span className="text-[11px] uppercase tracking-wider text-muted/60">Industry</span>
            <p className="text-sm font-medium mt-0.5">{dna.industry}</p>
          </div>
          <div>
            <span className="text-[11px] uppercase tracking-wider text-muted/60">Category</span>
            <p className="text-sm font-medium mt-0.5">{dna.category}</p>
          </div>
          <div className="flex-1 min-w-[200px]">
            <span className="text-[11px] uppercase tracking-wider text-muted/60">Keywords</span>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {dna.keywords.map((kw) => (
                <span
                  key={kw}
                  className="text-xs text-foreground/60 bg-card-hover px-2 py-0.5 rounded"
                >
                  {kw}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

function BrandAsset({
  src,
  label,
  containerClass,
}: {
  src: string;
  label: string;
  containerClass: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`${containerClass} rounded-lg border border-border bg-white flex items-center justify-center p-2 overflow-hidden`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={label}
          className="max-w-full max-h-full object-contain"
          onError={(e) => {
            (e.currentTarget.closest(".rounded-lg") as HTMLElement).style.display = "none";
          }}
        />
      </div>
      <span className="text-[11px] text-muted/60">{label}</span>
    </div>
  );
}

function ToneMeter({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-muted/70">{label}</span>
        <span className="text-foreground/50 font-mono">{value}%</span>
      </div>
      <div className="h-1 bg-border rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-accent rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

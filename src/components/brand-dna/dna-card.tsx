"use client";

import Image from "next/image";
import Link from "next/link";
import { ColorPalette } from "@/components/ui/color-swatch";
import { Card } from "@/components/ui/card";
import { ExternalLink, Megaphone, ArrowRight } from "lucide-react";

interface BrandCardProps {
  brand: {
    id: string;
    name: string;
    url: string;
    colors: string[];
    tone: string;
    industry: string;
    audience: string;
    logoUrl: string | null;
    _count?: { campaigns: number };
  };
}

export function BrandCard({ brand }: BrandCardProps) {
  return (
    <Link href={`/brands/${brand.id}`}>
      <Card className="hover:border-accent/20 hover:bg-card-hover group cursor-pointer">
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            {brand.logoUrl ? (
              <Image
                src={brand.logoUrl}
                alt={brand.name}
                width={40}
                height={40}
                unoptimized
                className="w-10 h-10 rounded-lg object-cover bg-white"
              />
            ) : (
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold"
                style={{
                  backgroundColor: brand.colors?.[0] || "#C9A96E",
                  color: "#111",
                }}
              >
                {brand.name.charAt(0)}
              </div>
            )}
            <div>
              <h3 className="font-medium text-foreground group-hover:text-accent transition-colors">
                {brand.name}
              </h3>
              <p className="text-xs text-muted flex items-center gap-1">
                <ExternalLink className="w-2.5 h-2.5" />
                {new URL(brand.url).hostname}
              </p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-muted/30 group-hover:text-accent transition-colors" />
        </div>

        <ColorPalette colors={brand.colors.slice(0, 5)} size="sm" />

        <div className="flex items-center gap-3 mt-4 text-xs text-muted">
          <span>{brand.industry}</span>
          <span className="text-border">|</span>
          <span>{brand.tone}</span>
          {brand._count && (
            <>
              <span className="text-border">|</span>
              <span className="flex items-center gap-1">
                <Megaphone className="w-3 h-3" />
                {brand._count.campaigns}
              </span>
            </>
          )}
        </div>
      </Card>
    </Link>
  );
}

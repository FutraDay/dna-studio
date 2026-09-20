"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { DNAPreview } from "@/components/brand-dna/dna-preview";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { BrandDNA } from "@/lib/brand-dna/types";
import { Dna, ArrowRight, RefreshCw, Camera, Download } from "lucide-react";

interface BrandData {
  id: string;
  name: string;
  url: string;
  dna: BrandDNA;
  campaigns: Array<{
    id: string;
    goal: string;
    createdAt: string;
  }>;
}

export default function BrandPage() {
  const params = useParams();
  const router = useRouter();
  const [brand, setBrand] = useState<BrandData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/brands/${params.id}`)
      .then((r) => r.json())
      .then(setBrand)
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return (
      <AppShell>
        <div className="max-w-4xl mx-auto">
          <div className="h-64 rounded-xl bg-card animate-pulse" />
        </div>
      </AppShell>
    );
  }

  if (!brand) {
    return (
      <AppShell>
        <div className="max-w-4xl mx-auto text-center py-20">
          <p className="text-muted">Brand not found</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto">
        {/* Page header */}
        <div className="text-center mb-12">
          <Dna className="w-6 h-6 text-accent mx-auto mb-4" />
          <h1 className="text-3xl font-[family-name:var(--font-heading)] italic mb-2">
            Your Business DNA
          </h1>
          <p className="text-sm text-muted max-w-md mx-auto">
            Here is a snapshot of your business that we&apos;ll use to create social media campaigns.
            Feel free to edit at anytime.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          {/* Main DNA content */}
          <div>
            <DNAPreview dna={brand.dna} />
          </div>

          {/* Right sidebar */}
          <div className="space-y-6">
            {/* Images / Photoshoot CTA */}
            <Card className="p-6 bg-gradient-to-br from-card to-accent/5 border-accent/10">
              <h3 className="text-sm font-medium mb-2">Images</h3>
              <p className="text-xs text-muted mb-4 leading-relaxed">
                Endless creatives, ready in minutes. Skip the cost of traditional
                photoshoots and generate compelling, on-brand images.
              </p>
              <Button
                size="sm"
                onClick={() => router.push("/photoshoot")}
              >
                <Camera className="w-3.5 h-3.5" />
                Try Photoshoot
              </Button>
            </Card>

            {/* Recent campaigns */}
            {brand.campaigns.length > 0 && (
              <Card className="p-6">
                <h3 className="text-sm font-medium mb-4">Recent Campaigns</h3>
                <div className="space-y-3">
                  {brand.campaigns.slice(0, 4).map((campaign) => (
                    <Link
                      key={campaign.id}
                      href={`/campaigns/${campaign.id}`}
                      className="flex items-center justify-between group"
                    >
                      <p className="text-sm text-foreground/70 group-hover:text-foreground truncate transition-colors">
                        {campaign.goal}
                      </p>
                      <ArrowRight className="w-3 h-3 text-muted group-hover:text-accent flex-shrink-0 transition-colors" />
                    </Link>
                  ))}
                </div>
              </Card>
            )}

            {/* Quick actions */}
            <div className="space-y-2">
              <a
                href={`/api/brands/${brand.id}/style-guide`}
                className="block"
              >
                <Button variant="secondary" className="w-full justify-start">
                  <Download className="w-3.5 h-3.5" />
                  Download Style Guide PDF
                </Button>
              </a>
              <Link href={`/campaigns/new?brandId=${brand.id}`} className="block">
                <Button variant="secondary" className="w-full justify-start">
                  <ArrowRight className="w-3.5 h-3.5" />
                  Create Campaign
                </Button>
              </Link>
              <Button
                variant="ghost"
                className="w-full justify-start text-muted"
                onClick={() => router.push(`/brands/new?url=${encodeURIComponent(brand.url)}`)}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reset Business DNA
              </Button>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

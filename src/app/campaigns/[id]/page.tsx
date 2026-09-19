"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { AssetCard } from "@/components/campaigns/asset-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Megaphone,
  Instagram,
  Linkedin,
  Facebook,
  Twitter,
  ArrowLeft,
  FlaskConical,
  CopyPlus,
  CheckCircle2,
} from "lucide-react";

interface Asset {
  id: string;
  platform: string;
  caption: string;
  hashtags: string[];
  imageUrl: string | null;
  imagePrompt: string | null;
  status: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  conceptIndex: number | null;
}

interface CampaignVariant {
  id: string;
  variantLabel: string | null;
  isPreferredVariant: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CampaignData {
  id: string;
  goal: string;
  experimentId: string | null;
  variantLabel: string | null;
  isPreferredVariant: boolean;
  experiment: {
    id: string;
    preferredCampaignId: string | null;
    variants: CampaignVariant[];
  } | null;
  concepts: Array<{
    name: string;
    description: string;
    theme: string;
  }>;
  brand: {
    id: string;
    name: string;
    colors: string[];
    tone: string;
  };
  assets: Asset[];
  createdAt: string;
}

const platformTabs = [
  { id: "all", label: "All", icon: Megaphone },
  { id: "instagram", label: "Instagram", icon: Instagram },
  { id: "linkedin", label: "LinkedIn", icon: Linkedin },
  { id: "facebook", label: "Facebook", icon: Facebook },
  { id: "twitter", label: "X", icon: Twitter },
];

export default function CampaignPage() {
  const params = useParams();
  const [campaign, setCampaign] = useState<CampaignData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [imageGenProgress, setImageGenProgress] = useState<{ done: number; total: number } | null>(null);
  const [variantAction, setVariantAction] = useState<"create" | "select" | null>(null);

  useEffect(() => {
    fetch(`/api/campaigns/${params.id}`)
      .then((r) => r.json())
      .then(setCampaign)
      .finally(() => setLoading(false));
  }, [params.id]);

  const refreshCampaign = async () => {
    const response = await fetch(`/api/campaigns/${params.id}`);
    if (!response.ok) return false;
    setCampaign(await response.json());
    return true;
  };

  const handleCreateVariant = async () => {
    if (!campaign || variantAction) return;

    setVariantAction("create");
    try {
      const response = await fetch(`/api/campaigns/${campaign.id}/variants`, {
        method: "POST",
      });
      if (!response.ok) return;
      await refreshCampaign();
    } finally {
      setVariantAction(null);
    }
  };

  const handleSelectPreferredVariant = async () => {
    if (!campaign?.experiment || variantAction) return;

    setVariantAction("select");
    try {
      const response = await fetch(`/api/campaigns/${campaign.id}/variants`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferredCampaignId: campaign.id }),
      });
      if (!response.ok) return;
      await refreshCampaign();
    } finally {
      setVariantAction(null);
    }
  };

  const handleGenerateAllImages = async () => {
    if (!campaign || imageGenProgress) return;
    const pending = campaign.assets.filter((asset) => asset.imagePrompt && !asset.imageUrl);
    if (pending.length === 0) return;

    const confirmed = window.confirm(
      `Generate ${pending.length} images now? This will call your configured image provider and may consume paid API credits. No images are generated unless you confirm.`
    );
    if (!confirmed) return;

    setImageGenProgress({ done: 0, total: pending.length });
    for (let i = 0; i < pending.length; i++) {
      const asset = pending[i];
      try {
        const res = await fetch("/api/images/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: asset.imagePrompt, assetId: asset.id, size: "1024x1024" }),
        });
        if (res.ok) {
          const { url } = await res.json();
          if (url) {
            setCampaign((prev) =>
              prev
                ? {
                    ...prev,
                    assets: prev.assets.map((item) =>
                      item.id === asset.id ? { ...item, imageUrl: url } : item
                    ),
                  }
                : prev
            );
          }
        }
      } catch {
        // Image generation is non-fatal; continue with the remaining assets.
      }
      setImageGenProgress({ done: i + 1, total: pending.length });
    }
    setImageGenProgress(null);
  };
  const handlePublish = async (assetId: string) => {
    if (!campaign) return;
    await fetch(`/api/campaigns/${campaign.id}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetIds: [assetId] }),
    });
    const updated = await fetch(`/api/campaigns/${params.id}`).then((r) =>
      r.json()
    );
    setCampaign(updated);
  };

  const handleSchedule = async (assetId: string, scheduledAt: string) => {
    if (!campaign) return;
    await fetch(`/api/campaigns/${campaign.id}/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetIds: [assetId], scheduledAt }),
    });
    const updated = await fetch(`/api/campaigns/${params.id}`).then((r) =>
      r.json()
    );
    setCampaign(updated);
  };

  const handleUpdateCaption = async (
    assetId: string,
    caption: string
  ): Promise<boolean> => {
    const response = await fetch(`/api/campaigns/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId, caption }),
    });

    if (!response.ok) return false;

    const updated = await fetch(`/api/campaigns/${params.id}`);
    if (!updated.ok) return false;
    setCampaign(await updated.json());
    return true;
  };

  const handleGenerateImage = async (assetId: string, prompt: string): Promise<string | null> => {
    const confirmed = window.confirm(
      "Generate this image now? This will call your configured image provider and may consume paid API credits."
    );
    if (!confirmed) return null;

    const res = await fetch("/api/images/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, assetId, size: "1024x1024" }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.url ?? null;
  };

  if (loading) {
    return (
      <AppShell>
        <div className="max-w-7xl mx-auto">
          <div className="h-48 rounded-xl bg-card animate-pulse" />
        </div>
      </AppShell>
    );
  }

  if (!campaign) {
    return (
      <AppShell>
        <div className="max-w-5xl mx-auto text-center py-20">
          <p className="text-muted">Campaign not found</p>
        </div>
      </AppShell>
    );
  }

  const filteredAssets =
    activeTab === "all"
      ? campaign.assets
      : campaign.assets.filter((a) => a.platform === activeTab);

  const groupedAssets = campaign.concepts
    .map((concept, index) => ({
      concept,
      index,
      assets: filteredAssets.filter((asset) => asset.conceptIndex === index),
    }))
    .filter((group) => group.assets.length > 0);

  const ungroupedAssets = filteredAssets.filter(
    (asset) => asset.conceptIndex === null
  );

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto">
        {/* Image generation progress banner */}
        {imageGenProgress && (
          <div className="flex items-center gap-2 mb-6 px-4 py-2.5 rounded-lg bg-accent-muted border border-accent/20 text-sm text-accent">
            <div className="w-3.5 h-3.5 rounded-full border-2 border-accent border-t-transparent animate-spin flex-shrink-0" />
            Generating images… {imageGenProgress.done}/{imageGenProgress.total}
          </div>
        )}

        {/* Back link */}
        <Link
          href="/campaigns/new"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Campaigns
        </Link>

        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-2 text-xs text-accent mb-3">
            <Megaphone className="w-4 h-4" />
            <span>{campaign.brand.name}</span>
            {campaign.variantLabel && (
              <span className="px-2 py-0.5 rounded-full border border-accent/30 bg-accent/10 text-[10px] font-semibold uppercase tracking-wide">
                Variant {campaign.variantLabel}
              </span>
            )}
          </div>
          <h1 className="text-3xl font-[family-name:var(--font-heading)] italic mb-2">
            Campaign review
          </h1>
          <p className="text-sm text-muted max-w-2xl">
            Review each platform draft, refine the copy, then schedule or publish
            when it is ready. Images remain optional and are only generated on demand.
          </p>
          <div className="flex flex-wrap gap-2 mt-4 text-[11px] text-muted">
            <span className="px-2.5 py-1 rounded-full border border-border bg-card">
              {campaign.concepts.length} concepts
            </span>
            <span className="px-2.5 py-1 rounded-full border border-border bg-card">
              {campaign.assets.length} posts
            </span>
            <span className="px-2.5 py-1 rounded-full border border-border bg-card">
              {campaign.assets.filter((asset) => Boolean(asset.imageUrl)).length} images generated
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-8">
          {/* Campaign info sidebar */}
          <div className="space-y-4">
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Megaphone className="w-3.5 h-3.5 text-accent" />
                <span className="text-xs text-muted">Goal</span>
              </div>
              <p className="text-sm font-medium">{campaign.goal}</p>
              <p className="text-xs text-muted mt-2">
                {campaign.brand.name}
              </p>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <FlaskConical className="w-3.5 h-3.5 text-accent" />
                <span className="text-xs text-muted">A/B test</span>
              </div>

              {!campaign.experiment ? (
                <>
                  <p className="text-sm font-medium">
                    Test a second version without spending credits
                  </p>
                  <p className="text-xs text-muted mt-2 leading-relaxed">
                    Variant B copies this campaign and all current posts into fresh drafts.
                    No AI text or image generation runs automatically.
                  </p>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="w-full mt-4"
                    onClick={handleCreateVariant}
                    loading={variantAction === "create"}
                  >
                    <CopyPlus className="w-3.5 h-3.5" />
                    Create Variant B · No credits
                  </Button>
                </>
              ) : (
                <>
                  <div className="flex gap-2">
                    {campaign.experiment.variants.map((variant) => {
                      const current = variant.id === campaign.id;
                      return (
                        <Link
                          key={variant.id}
                          href={`/campaigns/${variant.id}`}
                          className={`flex-1 rounded-lg border px-3 py-2 text-center text-xs font-semibold transition-colors ${
                            current
                              ? "border-accent bg-accent/10 text-accent"
                              : "border-border text-muted hover:text-foreground hover:border-accent/30"
                          }`}
                        >
                          Variant {variant.variantLabel ?? "?"}
                        </Link>
                      );
                    })}
                  </div>

                  <div className="mt-4 rounded-lg border border-border bg-background/30 p-3">
                    {campaign.experiment.preferredCampaignId === campaign.id ? (
                      <div className="flex items-center gap-2 text-xs text-accent font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Preferred variant
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="w-full"
                        onClick={handleSelectPreferredVariant}
                        loading={variantAction === "select"}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Choose this variant
                      </Button>
                    )}
                  </div>

                  <p className="text-[11px] text-muted mt-3 leading-relaxed">
                    Preference is manual for now. The analytics milestone will compare
                    real post performance before declaring a measured winner.
                  </p>
                </>
              )}
            </Card>

            {Array.isArray(campaign.concepts) && campaign.concepts.length > 0 && (
              <Card className="p-4">
                <span className="text-xs text-muted">Campaign structure</span>
                <div className="space-y-2 mt-3">
                  {campaign.concepts.map((concept, i) => (
                    <a
                      key={i}
                      href={`#concept-${i + 1}`}
                      className="flex items-start gap-2 rounded-lg px-2 py-2 -mx-2 hover:bg-card-hover transition-colors"
                    >
                      <span className="w-5 h-5 rounded-full bg-accent/10 text-accent text-[10px] flex items-center justify-center flex-shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <span className="text-xs font-medium leading-relaxed">
                        {concept.name}
                      </span>
                    </a>
                  ))}
                </div>
              </Card>
            )}
          </div>

          {/* Creatives grid */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5 p-3 rounded-lg border border-border bg-card/50">
              <div>
                <p className="text-xs font-medium">Images are generated on demand</p>
                <p className="text-[11px] text-muted mt-0.5">
                  Review the copy first. Generating images uses your configured image-provider API credits.
                </p>
              </div>
              {campaign.assets.some((asset) => asset.imagePrompt && !asset.imageUrl) && (
                <Button
                  size="sm"
                  onClick={handleGenerateAllImages}
                  loading={Boolean(imageGenProgress)}
                >
                  {imageGenProgress
                    ? `${imageGenProgress.done}/${imageGenProgress.total}`
                    : `Generate ${campaign.assets.filter((asset) => asset.imagePrompt && !asset.imageUrl).length} images (uses credits)`}
                </Button>
              )}
            </div>
            {/* Platform filter tabs */}
            <div className="flex flex-wrap gap-1 mb-7">
              {platformTabs.map((tab) => {
                const count =
                  tab.id === "all"
                    ? campaign.assets.length
                    : campaign.assets.filter((a) => a.platform === tab.id).length;
                if (tab.id !== "all" && count === 0) return null;

                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                      activeTab === tab.id
                        ? "bg-accent text-background font-medium"
                        : "text-muted hover:text-foreground hover:bg-card"
                    }`}
                  >
                    <tab.icon className="w-3 h-3" />
                    {tab.label}
                    <span className="opacity-50">({count})</span>
                  </button>
                );
              })}
            </div>

            {/* Asset review */}
            <div className="space-y-10">
              {groupedAssets.map(({ concept, index, assets }) => (
                <section key={index} id={`concept-${index + 1}`} className="scroll-mt-6">
                  <div className="flex items-start gap-3 mb-4">
                    <span className="w-7 h-7 rounded-full bg-accent/10 text-accent text-xs font-medium flex items-center justify-center flex-shrink-0">
                      {index + 1}
                    </span>
                    <div>
                      <h2 className="text-base font-semibold">{concept.name}</h2>
                      <p className="text-xs text-muted mt-1 max-w-2xl leading-relaxed">
                        {concept.description}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {assets.map((asset) => (
                      <AssetCard
                        key={asset.id}
                        asset={asset}
                        onPublish={handlePublish}
                        onSchedule={handleSchedule}
                        onUpdateCaption={handleUpdateCaption}
                        onGenerateImage={handleGenerateImage}
                      />
                    ))}
                  </div>
                </section>
              ))}

              {ungroupedAssets.length > 0 && (
                <section>
                  <div className="mb-4">
                    <h2 className="text-base font-semibold">Other posts</h2>
                    <p className="text-xs text-muted mt-1">
                      Posts that are not linked to a campaign concept.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {ungroupedAssets.map((asset) => (
                      <AssetCard
                        key={asset.id}
                        asset={asset}
                        onPublish={handlePublish}
                        onSchedule={handleSchedule}
                        onUpdateCaption={handleUpdateCaption}
                        onGenerateImage={handleGenerateImage}
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

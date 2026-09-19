"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import {
  Camera,
  Sparkles,
  Download,
  Loader2,
  Upload,
  X,
  ArrowLeft,
  Check,
  Clock,
  Trash2,
} from "lucide-react";

/* ─── Template Data ─── */
interface Template {
  id: string;
  name: string;
  prompt: string;
}

interface TemplateCategory {
  name: string;
  recommended?: boolean;
  templates: Template[];
}

const templateCategories: TemplateCategory[] = [
  {
    name: "General",
    recommended: true,
    templates: [
      { id: "studio", name: "Studio", prompt: "clean studio photography, solid white background, centered product, professional studio lighting, commercial product shot, crisp details" },
      { id: "floating", name: "Floating", prompt: "product floating in mid-air, dynamic angle, soft gradient background, levitation effect, dramatic shadows, surreal commercial photography" },
      { id: "in-use", name: "In Use", prompt: "product being used by a person in a natural setting, lifestyle photography, warm natural lighting, authentic moment, contextual usage" },
      { id: "contextual", name: "Contextual", prompt: "product placed in its natural environment, styled scene, complementary props and textures, editorial composition, storytelling" },
      { id: "flat-lay", name: "Flat Lay", prompt: "flat lay photography, top-down view, arranged with complementary objects, neutral background, clean composition, curated arrangement" },
      { id: "dramatic", name: "Dramatic", prompt: "dramatic lighting, dark moody background, spotlight on product, high contrast, cinematic feel, luxury commercial photography" },
    ],
  },
  {
    name: "Beauty & Cosmetics",
    templates: [
      { id: "beauty-splash", name: "Splash", prompt: "product with water splash or liquid elements, dynamic motion, vibrant colors, freshness, high-speed photography effect" },
      { id: "beauty-hands", name: "In Hands", prompt: "close-up of hands holding or applying the product, soft skin tones, beauty lighting, intimate perspective, skincare routine" },
      { id: "beauty-ingredients", name: "Ingredients", prompt: "product surrounded by natural raw ingredients, botanical elements, organic textures, ingredient showcase, clean beauty aesthetic" },
      { id: "beauty-vanity", name: "Vanity", prompt: "product on a marble vanity or bathroom shelf, mirror reflection, soft warm lighting, luxury beauty setup, aspirational" },
      { id: "beauty-close", name: "Macro", prompt: "extreme close-up of product texture and details, macro photography, visible product consistency, satisfying texture, beauty detail shot" },
    ],
  },
  {
    name: "Fashion & Apparel",
    templates: [
      { id: "fashion-model", name: "On Model", prompt: "fashion model wearing/holding the product, full body shot, studio background, editorial fashion photography, confident pose" },
      { id: "fashion-detail", name: "Detail Shot", prompt: "close-up of fabric texture, stitching details, material quality, product craftsmanship, luxury fashion detail photography" },
      { id: "fashion-flat", name: "Ghost", prompt: "invisible mannequin/ghost mannequin product photography, clean white background, showing product shape and fit, e-commerce style" },
      { id: "fashion-street", name: "Street Style", prompt: "street style fashion photography, urban environment, natural movement, candid feel, city backdrop, trendy setting" },
    ],
  },
  {
    name: "Food & Beverage",
    templates: [
      { id: "food-hero", name: "Hero Shot", prompt: "hero food photography, dramatic angle, steam or motion, appetizing styling, rich colors, food magazine quality" },
      { id: "food-pour", name: "Pour / Splash", prompt: "dynamic pour or splash shot, liquid in motion, droplets, high-speed capture effect, refreshing, beverage photography" },
      { id: "food-table", name: "Table Setting", prompt: "product on a styled dining table, rustic wood, linen napkins, complementary dishes, warm lighting, food lifestyle" },
      { id: "food-ingredients", name: "Deconstructed", prompt: "product surrounded by its ingredients, exploded view, fresh ingredients arranged artistically, farm-to-table aesthetic" },
      { id: "food-outdoor", name: "Al Fresco", prompt: "food/beverage in outdoor setting, natural sunlight, garden or picnic scene, fresh air feeling, lifestyle food photography" },
      { id: "food-minimal", name: "Clean & Minimal", prompt: "minimal food photography, single product, clean solid background, precise styling, negative space, modern aesthetic" },
    ],
  },
  {
    name: "Home & Living",
    templates: [
      { id: "home-room", name: "Room Scene", prompt: "product in a beautifully styled room, interior design photography, natural window light, cozy atmosphere, home decor" },
      { id: "home-close", name: "Detail", prompt: "close-up product detail in home setting, texture focus, warm tones, lifestyle vignette, tactile quality" },
      { id: "home-styled", name: "Styled Shelf", prompt: "product displayed on a styled shelf or surface, curated arrangement, complementary decor objects, boutique display" },
      { id: "home-outdoor", name: "Outdoor Living", prompt: "product in outdoor living space, patio or garden, golden hour lighting, relaxed atmosphere, outdoor lifestyle" },
    ],
  },
  {
    name: "Technology",
    templates: [
      { id: "tech-clean", name: "Clean Tech", prompt: "tech product on minimalist desk, clean lines, modern workspace, soft lighting, premium tech aesthetic, Apple-style photography" },
      { id: "tech-glow", name: "Neon Glow", prompt: "tech product with neon/LED lighting accents, dark background, futuristic feel, RGB colors, cyberpunk aesthetic, reflective surface" },
      { id: "tech-lifestyle", name: "In Use", prompt: "person using the tech product naturally, modern office or home, soft focus background, authentic tech lifestyle" },
      { id: "tech-exploded", name: "Components", prompt: "product with visible internal components or accessories arranged around it, technical showcase, engineering beauty, deconstructed view" },
    ],
  },
];

const MAX_SELECTIONS = 4;

interface GeneratedImage {
  id: string;
  url: string | null;
  status: "pending" | "analyzing" | "generating" | "done" | "error";
  templateName: string;
  error?: string;
}

interface SavedPhotoshoot {
  id: string;
  productDescription: string | null;
  templates: string[];
  status: string;
  results: GeneratedImage[];
  createdAt: string;
}

type Step = "gallery" | "upload" | "templates" | "results";

async function describeImage(imageUrl: string): Promise<string> {
  const res = await fetch("/api/images/describe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageUrl }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to analyze image");
  }
  return (await res.json()).description as string;
}

async function generateImage(prompt: string, size: string) {
  const res = await fetch("/api/images/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, size }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Generation failed");
  }
  return (await res.json()).url as string;
}

export default function PhotoshootPage() {
  const [step, setStep] = useState<Step>("gallery");
  const [productImage, setProductImage] = useState<string | null>(null);
  const [productDescription, setProductDescription] = useState("");
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);
  const [results, setResults] = useState<GeneratedImage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [analysisDescription, setAnalysisDescription] = useState<string | null>(null);
  const [currentPhotoshootId, setCurrentPhotoshootId] = useState<string | null>(null);

  // Gallery state
  const [savedPhotoshoots, setSavedPhotoshoots] = useState<SavedPhotoshoot[]>([]);
  const [loadingGallery, setLoadingGallery] = useState(true);

  const allTemplates = templateCategories.flatMap((c) => c.templates);

  // Load saved photoshoots on mount
  useEffect(() => {
    fetchSavedPhotoshoots();
  }, []);

  const fetchSavedPhotoshoots = async () => {
    try {
      setLoadingGallery(true);
      const res = await fetch("/api/photoshoots");
      if (res.ok) {
        const data = await res.json();
        setSavedPhotoshoots(data);
      }
    } catch {
      // silently fail
    } finally {
      setLoadingGallery(false);
    }
  };

  const toggleTemplate = (id: string) => {
    setSelectedTemplates((prev) => {
      if (prev.includes(id)) return prev.filter((t) => t !== id);
      if (prev.length >= MAX_SELECTIONS) return prev;
      return [...prev, id];
    });
  };

  const handleProductImageUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setProductImage(reader.result as string);
      setAnalysisDescription(null);
    };
    reader.readAsDataURL(file);
  };

  const handleNewShoot = () => {
    setProductImage(null);
    setProductDescription("");
    setSelectedTemplates([]);
    setResults([]);
    setAnalysisDescription(null);
    setCurrentPhotoshootId(null);
    setStep("upload");
  };

  const handleContinueToTemplates = () => {
    if (selectedTemplates.length === 0) {
      const defaults = templateCategories[0].templates.slice(0, 4).map((t) => t.id);
      setSelectedTemplates(defaults);
    }
    setStep("templates");
  };

  const handleViewPhotoshoot = async (shoot: SavedPhotoshoot) => {
    setCurrentPhotoshootId(shoot.id);
    setProductDescription(shoot.productDescription || "");
    setSelectedTemplates(shoot.templates);
    setResults(shoot.results);
    setIsGenerating(false);

    // Load full record to get productImage
    try {
      const res = await fetch(`/api/photoshoots/${shoot.id}`);
      if (res.ok) {
        const full = await res.json();
        setProductImage(full.productImage || null);
      }
    } catch {
      // proceed without product image
    }

    setStep("results");
  };

  const handleDeletePhotoshoot = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/photoshoots/${id}`, { method: "DELETE" });
      if (res.ok) {
        setSavedPhotoshoots((prev) => prev.filter((s) => s.id !== id));
      }
    } catch {
      // silently fail
    }
  };

  const handleGenerate = useCallback(async () => {
    if (selectedTemplates.length === 0) return;
    setStep("results");
    setIsGenerating(true);

    const selected = selectedTemplates
      .map((id) => allTemplates.find((t) => t.id === id))
      .filter(Boolean) as Template[];

    const initialResults: GeneratedImage[] = selected.map((t) => ({
      id: t.id,
      url: null,
      status: "pending",
      templateName: t.name,
    }));
    setResults(initialResults);

    // Create the record immediately
    let shootId = currentPhotoshootId;
    if (!shootId) {
      try {
        const res = await fetch("/api/photoshoots", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productImage,
            productDescription,
            templates: selectedTemplates,
            results: initialResults,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          shootId = data.id;
          setCurrentPhotoshootId(data.id);
        }
      } catch {
        // continue without saving
      }
    }

    // Track results for saving
    let latestResults = [...initialResults];

    try {
      let description = productDescription;

      if (productImage) {
        latestResults = latestResults.map((r) => ({ ...r, status: "analyzing" as const }));
        setResults([...latestResults]);

        if (!analysisDescription) {
          const aiDesc = await describeImage(productImage);
          description = productDescription
            ? `${productDescription}. AI analysis: ${aiDesc}`
            : aiDesc;
          setAnalysisDescription(description);
        } else {
          description = analysisDescription;
        }
      }

      const promises = selected.map(async (template, i) => {
        latestResults = latestResults.map((r, idx) =>
          idx === i ? { ...r, status: "generating" as const } : r
        );
        setResults([...latestResults]);

        try {
          const prompt = `Professional product photography of ${description}. ${template.prompt}. High quality, commercial photography, no text or watermarks, 8k resolution.`;
          const url = await generateImage(prompt, "1024x1024");
          latestResults = latestResults.map((r, idx) =>
            idx === i ? { ...r, url, status: "done" as const } : r
          );
          setResults([...latestResults]);

          // Save progress after each image completes
          if (shootId) {
            const allDone = latestResults.every((r) => r.status === "done" || r.status === "error");
            fetch(`/api/photoshoots/${shootId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                results: latestResults,
                status: allDone ? "completed" : "generating",
              }),
            }).catch(() => {});
          }
        } catch (e) {
          latestResults = latestResults.map((r, idx) =>
            idx === i
              ? { ...r, status: "error" as const, error: e instanceof Error ? e.message : "Failed" }
              : r
          );
          setResults([...latestResults]);
        }
      });

      await Promise.allSettled(promises);
    } catch (e) {
      latestResults = latestResults.map((r) => ({
        ...r,
        status: "error" as const,
        error: e instanceof Error ? e.message : "Failed",
      }));
      setResults([...latestResults]);
    } finally {
      setIsGenerating(false);
      // Final save
      const hasAnyDone = latestResults.some((r) => r.status === "done");
      if (shootId) {
        fetch(`/api/photoshoots/${shootId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            results: latestResults,
            status: hasAnyDone ? "completed" : "failed",
          }),
        }).catch(() => {});
      }
      // Refresh gallery
      fetchSavedPhotoshoots();
    }
  }, [productImage, productDescription, selectedTemplates, analysisDescription, allTemplates, currentPhotoshootId]);

  const completedResults = results.filter((r) => r.status === "done" && r.url);

  const handleDownloadAll = () => {
    completedResults.forEach((r) => {
      if (r.url) {
        const a = document.createElement("a");
        a.href = r.url;
        a.download = `photoshoot-${r.templateName.toLowerCase().replace(/\s+/g, "-")}.png`;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.click();
      }
    });
  };

  // Get first completed image from a photoshoot for thumbnail
  const getShootThumbnail = (shoot: SavedPhotoshoot): string | null => {
    const done = shoot.results?.find((r) => r.status === "done" && r.url);
    return done?.url || null;
  };

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto">
        <AnimatePresence mode="wait">
          {/* ─── Gallery: Past Photoshoots ─── */}
          {step === "gallery" && (
            <motion.div
              key="gallery"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h1 className="text-3xl font-[family-name:var(--font-heading)] italic mb-2">
                    Photoshoot
                  </h1>
                  <p className="text-sm text-muted">
                    Generate professional product photography with AI
                  </p>
                </div>
                <Button onClick={handleNewShoot}>
                  <Camera className="w-4 h-4" />
                  New Shoot
                </Button>
              </div>

              {loadingGallery ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-5 h-5 text-muted animate-spin" />
                </div>
              ) : savedPhotoshoots.length === 0 ? (
                <div className="text-center py-20">
                  <Camera className="w-10 h-10 text-muted/20 mx-auto mb-4" />
                  <h2 className="text-lg font-medium mb-2">No photoshoots yet</h2>
                  <p className="text-sm text-muted mb-6">
                    Create your first AI-powered product photoshoot
                  </p>
                  <Button onClick={handleNewShoot}>
                    <Sparkles className="w-4 h-4" />
                    Start First Shoot
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {savedPhotoshoots.map((shoot) => {
                    const thumb = getShootThumbnail(shoot);
                    const doneCount = shoot.results?.filter((r) => r.status === "done").length || 0;
                    const totalCount = shoot.results?.length || 0;

                    return (
                      <motion.button
                        key={shoot.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        onClick={() => handleViewPhotoshoot(shoot)}
                        className="rounded-xl overflow-hidden border border-border bg-card hover:border-accent/30 transition-all text-left group cursor-pointer relative"
                      >
                        {/* Thumbnail grid */}
                        <div className="aspect-square bg-gradient-to-br from-card-hover to-card relative">
                          {thumb ? (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={thumb}
                                alt="Photoshoot"
                                className="w-full h-full object-cover"
                              />
                              {/* Show count of remaining images */}
                              {doneCount > 1 && (
                                <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur text-[10px] text-white font-medium">
                                  +{doneCount - 1}
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              {shoot.status === "generating" ? (
                                <Loader2 className="w-6 h-6 text-muted/30 animate-spin" />
                              ) : (
                                <Camera className="w-6 h-6 text-muted/20" />
                              )}
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="p-3">
                          <p className="text-xs font-medium truncate">
                            {shoot.productDescription || "Product Shoot"}
                          </p>
                          <div className="flex items-center justify-between mt-1.5">
                            <div className="flex items-center gap-1 text-[10px] text-muted">
                              <Clock className="w-3 h-3" />
                              {new Date(shoot.createdAt).toLocaleDateString()}
                            </div>
                            <span className="text-[10px] text-muted">
                              {doneCount}/{totalCount} shots
                            </span>
                          </div>
                        </div>

                        {/* Delete button */}
                        <button
                          onClick={(e) => handleDeletePhotoshoot(shoot.id, e)}
                          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 backdrop-blur flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/80 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3 text-white" />
                        </button>
                      </motion.button>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

          {/* ─── Step 1: Upload ─── */}
          {step === "upload" && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-xl mx-auto"
            >
              <div className="flex items-center gap-3 mb-8">
                <button
                  onClick={() => setStep("gallery")}
                  className="w-8 h-8 rounded-full border border-border flex items-center justify-center hover:bg-card cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4 text-muted" />
                </button>
                <div>
                  <h1 className="text-xl font-[family-name:var(--font-heading)] italic">
                    New Photoshoot
                  </h1>
                  <p className="text-sm text-muted">Upload your product to generate professional shots</p>
                </div>
              </div>

              <div className="mb-6">
                {productImage ? (
                  <div className="relative rounded-xl overflow-hidden border border-border bg-card">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={productImage} alt="Product" className="w-full max-h-80 object-contain bg-white p-4" />
                    <button
                      onClick={() => { setProductImage(null); setAnalysisDescription(null); }}
                      className="absolute top-3 right-3 w-7 h-7 rounded-full bg-background/70 backdrop-blur border border-border flex items-center justify-center hover:bg-background/90 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5 text-muted" />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center gap-4 py-16 rounded-xl border-2 border-dashed border-border hover:border-accent/30 bg-card/50 transition-colors cursor-pointer">
                    <div className="w-14 h-14 rounded-full bg-accent/10 flex items-center justify-center">
                      <Upload className="w-6 h-6 text-accent" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-foreground">Upload product image</p>
                      <p className="text-xs text-muted mt-1">PNG, JPG up to 10MB</p>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleProductImageUpload(file);
                      }}
                    />
                  </label>
                )}
              </div>

              <div className="mb-6">
                <textarea
                  value={productDescription}
                  onChange={(e) => setProductDescription(e.target.value)}
                  placeholder={productImage ? "Add details (optional — AI sees your product)" : "Or describe your product"}
                  className="w-full bg-card border border-border rounded-xl p-4 text-sm text-foreground placeholder:text-muted/30 resize-none focus:outline-none focus:border-accent/30"
                  rows={2}
                />
              </div>

              <Button
                className="w-full py-3"
                disabled={!productImage && !productDescription}
                onClick={handleContinueToTemplates}
              >
                Choose Product Shots
                <ArrowLeft className="w-4 h-4 rotate-180" />
              </Button>
            </motion.div>
          )}

          {/* ─── Step 2: Template Selection ─── */}
          {step === "templates" && (
            <motion.div
              key="templates"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <div className="flex items-start justify-between mb-8">
                <div className="flex items-start gap-4">
                  <button
                    onClick={() => setStep("upload")}
                    className="mt-1 w-8 h-8 rounded-full border border-border flex items-center justify-center hover:bg-card cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4 text-muted" />
                  </button>
                  <div>
                    <h1 className="text-xl font-[family-name:var(--font-heading)] italic">
                      Choose product shots
                    </h1>
                    <p className="text-sm text-muted mt-1">
                      Select up to {MAX_SELECTIONS} templates from a curated selection of shots
                    </p>
                  </div>
                </div>
                <span className="text-sm text-accent font-medium">
                  ({selectedTemplates.length}/{MAX_SELECTIONS} selected)
                </span>
              </div>

              <div className="space-y-10">
                {templateCategories.map((category) => (
                  <section key={category.name}>
                    <h2 className="text-sm font-medium mb-4">
                      {category.name}
                      {category.recommended && (
                        <span className="text-accent ml-2 text-xs">(Recommended)</span>
                      )}
                    </h2>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                      {category.templates.map((template) => {
                        const isSelected = selectedTemplates.includes(template.id);
                        const isDisabled = !isSelected && selectedTemplates.length >= MAX_SELECTIONS;

                        return (
                          <button
                            key={template.id}
                            onClick={() => toggleTemplate(template.id)}
                            disabled={isDisabled}
                            className={`relative rounded-xl overflow-hidden border-2 transition-all cursor-pointer group ${
                              isSelected
                                ? "border-accent shadow-lg shadow-accent/10"
                                : isDisabled
                                  ? "border-border opacity-40 cursor-not-allowed"
                                  : "border-border hover:border-accent/30"
                            }`}
                          >
                            <div className="aspect-square bg-gradient-to-br from-card-hover to-card flex items-center justify-center p-3">
                              {productImage ? (
                                <div className="w-full h-full rounded-lg overflow-hidden relative">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={productImage}
                                    alt={template.name}
                                    className={`w-full h-full object-contain transition-all duration-300 ${
                                      isSelected ? "scale-95" : "group-hover:scale-95"
                                    }`}
                                  />
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-50" />
                                </div>
                              ) : (
                                <Camera className="w-6 h-6 text-muted/20" />
                              )}
                            </div>

                            <div className={`px-2.5 py-2 text-center ${isSelected ? "bg-accent-muted" : ""}`}>
                              <p className="text-[11px] font-medium truncate">{template.name}</p>
                            </div>

                            {isSelected && (
                              <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                                <Check className="w-3 h-3 text-background" />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>

              <div className="sticky bottom-0 bg-background/80 backdrop-blur-lg border-t border-border mt-10 -mx-8 px-8 py-4 flex justify-end">
                <Button
                  disabled={selectedTemplates.length === 0}
                  onClick={handleGenerate}
                  className="px-8"
                >
                  <Sparkles className="w-4 h-4" />
                  Generate {selectedTemplates.length} Shot{selectedTemplates.length !== 1 ? "s" : ""}
                </Button>
              </div>
            </motion.div>
          )}

          {/* ─── Step 3: Results ─── */}
          {step === "results" && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <button
                onClick={() => {
                  if (isGenerating) return;
                  setStep("gallery");
                  fetchSavedPhotoshoots();
                }}
                className="flex items-center gap-2 text-sm text-muted hover:text-accent transition-colors mb-6 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to photoshoots
              </button>

              <div className="flex gap-6">
                {/* Left sidebar */}
                <div className="w-48 flex-shrink-0">
                  <div className="sticky top-8 space-y-5">
                    <div>
                      <p className="text-xs font-medium text-muted mb-2">Product Image</p>
                      {productImage && (
                        <div className="w-20 h-20 rounded-lg overflow-hidden border border-border">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={productImage} alt="Product" className="w-full h-full object-cover" />
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="text-xs font-medium text-muted mb-2">Templates</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {results.map((r) => (
                          <div
                            key={r.id}
                            className={`aspect-square rounded-lg overflow-hidden border ${
                              r.status === "done" ? "border-accent/30" : "border-border"
                            }`}
                          >
                            {r.url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={r.url} alt={r.templateName} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-card flex items-center justify-center">
                                <Loader2 className="w-3 h-3 text-muted/30 animate-spin" />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Main results grid */}
                <div className="flex-1 min-w-0">
                  <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                    {results.map((result, i) => (
                      <motion.div
                        key={result.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="rounded-xl overflow-hidden border border-border bg-card group relative"
                      >
                        <div className="aspect-[3/4] relative">
                          <AnimatePresence mode="wait">
                            {result.status === "done" && result.url ? (
                              <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={result.url} alt={result.templateName} className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-end justify-center pb-4 opacity-0 group-hover:opacity-100">
                                  <a
                                    href={result.url}
                                    download={`photoshoot-${result.templateName.toLowerCase()}.png`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-4 py-2 rounded-lg bg-white/90 text-black text-xs font-medium flex items-center gap-1.5 hover:bg-white transition-colors"
                                  >
                                    <Download className="w-3 h-3" />
                                    Download
                                  </a>
                                </div>
                              </motion.div>
                            ) : result.status === "error" ? (
                              <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 flex flex-col items-center justify-center bg-card gap-2 p-4">
                                <X className="w-5 h-5 text-danger/50" />
                                <p className="text-[10px] text-danger/70 text-center">{result.error}</p>
                              </motion.div>
                            ) : (
                              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-card-hover to-card">
                                <svg className="w-10 h-10 animate-spin mb-4" viewBox="0 0 40 40">
                                  <circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" strokeWidth="2" className="text-border" />
                                  <circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent" strokeDasharray="30 70" strokeLinecap="round" />
                                </svg>
                                <p className="text-xs text-muted">
                                  {result.status === "analyzing" ? "Analyzing product..." : result.status === "generating" ? "Generating..." : "Waiting..."}
                                </p>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                        <div className="px-3 py-2.5 border-t border-border">
                          <p className="text-xs font-medium text-foreground/80">{result.templateName}</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Bottom action bar */}
              {completedResults.length > 0 && !isGenerating && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-center gap-3 mt-8 pt-6 border-t border-border"
                >
                  <Button variant="secondary" onClick={() => handleGenerate()}>
                    <Sparkles className="w-3.5 h-3.5" />
                    Regenerate
                  </Button>
                  <Button variant="secondary" onClick={handleDownloadAll}>
                    <Download className="w-3.5 h-3.5" />
                    Download All
                  </Button>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AppShell>
  );
}

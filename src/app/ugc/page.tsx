"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import {
  Video,
  Sparkles,
  Download,
  Loader2,
  Upload,
  X,
  ArrowLeft,
  Check,
  Clock,
  Trash2,
  Play,
  RefreshCw,
  Wand2,
  User,
} from "lucide-react";

/* ─── Types ─── */
interface Avatar {
  id: string;
  name: string;
  description?: string;
  previewVideoUrl?: string;
  thumbnailUrl: string;
  gender: "male" | "female";
  style: string;
}

const placeholderAvatars: Avatar[] = [
  { id: "sofia", name: "Sofia", thumbnailUrl: "", gender: "female", style: "Friendly & Warm" },
  { id: "marcus", name: "Marcus", thumbnailUrl: "", gender: "male", style: "Professional" },
  { id: "luna", name: "Luna", thumbnailUrl: "", gender: "female", style: "Energetic & Gen-Z" },
  { id: "james", name: "James", thumbnailUrl: "", gender: "male", style: "Casual Dad" },
  { id: "aria", name: "Aria", thumbnailUrl: "", gender: "female", style: "Luxury & Glam" },
  { id: "kai", name: "Kai", thumbnailUrl: "", gender: "male", style: "Tech Reviewer" },
  { id: "maya", name: "Maya", thumbnailUrl: "", gender: "female", style: "Wellness & Natural" },
  { id: "alex", name: "Alex", thumbnailUrl: "", gender: "male", style: "Fitness & Active" },
  { id: "chloe", name: "Chloe", thumbnailUrl: "", gender: "female", style: "Beauty & Skincare" },
  { id: "omar", name: "Omar", thumbnailUrl: "", gender: "male", style: "Storyteller" },
  { id: "zara", name: "Zara", thumbnailUrl: "", gender: "female", style: "Fashion-Forward" },
  { id: "noah", name: "Noah", thumbnailUrl: "", gender: "male", style: "Everyday & Relatable" },
];

interface SavedVideo {
  id: string;
  productDescription: string | null;
  avatarName: string | null;
  avatarThumbnail: string | null;
  script: string;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  provider: string;
  aspectRatio: string;
  status: string;
  duration: number | null;
  createdAt: string;
}

type Step = "gallery" | "upload" | "character" | "script" | "result";

/* ─── Character Card with video autoplay on hover ─── */
function CharacterCard({
  avatar,
  isSelected,
  onSelect,
}: {
  avatar: Avatar;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isHovering, setIsHovering] = useState(false);
  const hasVideo = !!avatar.previewVideoUrl;

  const handleMouseEnter = () => {
    setIsHovering(true);
    if (videoRef.current && hasVideo) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
    if (videoRef.current && hasVideo) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  };

  return (
    <button
      onClick={onSelect}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`relative rounded-xl overflow-hidden border-2 transition-all cursor-pointer group ${
        isSelected
          ? "border-accent shadow-lg shadow-accent/10"
          : "border-border hover:border-accent/30"
      }`}
    >
      <div className="aspect-[3/4] bg-gradient-to-br from-card-hover to-card flex items-center justify-center relative overflow-hidden">
        {hasVideo ? (
          <>
            <video
              ref={videoRef}
              src={avatar.previewVideoUrl}
              muted
              loop
              playsInline
              preload="metadata"
              className="w-full h-full object-cover"
            />
            {/* Play indicator on hover */}
            {!isHovering && !isSelected && (
              <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                <div className="w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
                  <Play className="w-3.5 h-3.5 text-white ml-0.5" />
                </div>
              </div>
            )}
          </>
        ) : avatar.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatar.thumbnailUrl}
            alt={avatar.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-accent/5 to-accent/15">
            <User className="w-10 h-10 text-accent/20" />
          </div>
        )}
      </div>

      {/* Label */}
      <div className={`px-2.5 py-2 text-center ${isSelected ? "bg-accent-muted" : ""}`}>
        <p className="text-[11px] font-medium">{avatar.name}</p>
        <p className="text-[9px] text-muted mt-0.5">{avatar.style}</p>
      </div>

      {/* Selection check */}
      {isSelected && (
        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-accent flex items-center justify-center">
          <Check className="w-3 h-3 text-background" />
        </div>
      )}
    </button>
  );
}

/* ─── Main Page ─── */
export default function UGCPage() {
  const [step, setStep] = useState<Step>("gallery");

  // Upload state
  const [productImage, setProductImage] = useState<string | null>(null);
  const [productDescription, setProductDescription] = useState("");

  // Character state
  const [avatars, setAvatars] = useState<Avatar[]>(placeholderAvatars);
  const [selectedAvatar, setSelectedAvatar] = useState<Avatar | null>(null);
  const [loadingAvatars, setLoadingAvatars] = useState(false);
  const [avatarsLoaded, setAvatarsLoaded] = useState(false);

  // Script state
  const [script, setScript] = useState("");
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);

  // Result state
  const [videoStatus, setVideoStatus] = useState<string>("idle");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Gallery state
  const [savedVideos, setSavedVideos] = useState<SavedVideo[]>([]);
  const [loadingGallery, setLoadingGallery] = useState(true);

  // Aspect ratio
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9" | "1:1">("9:16");

  useEffect(() => {
    fetchSavedVideos();
  }, []);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const fetchSavedVideos = async () => {
    try {
      setLoadingGallery(true);
      const res = await fetch("/api/ugc");
      if (res.ok) setSavedVideos(await res.json());
    } catch {
      // silently fail
    } finally {
      setLoadingGallery(false);
    }
  };

  const handleProductImageUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setProductImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleNewVideo = () => {
    setProductImage(null);
    setProductDescription("");
    setSelectedAvatar(null);
    setScript("");
    setVideoStatus("idle");
    setVideoUrl(null);
    setVideoError(null);
    setStep("upload");
  };

  const handleContinueToCharacter = async () => {
    setStep("character");
    if (!avatarsLoaded) {
      setLoadingAvatars(true);
      try {
        const res = await fetch("/api/ugc/avatars");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setAvatars(data);
          }
        }
      } catch {
        // Keep placeholders
      } finally {
        setLoadingAvatars(false);
        setAvatarsLoaded(true);
      }
    }
  };

  const handleContinueToScript = () => {
    setStep("script");
  };

  const handleGenerateScript = async () => {
    if (!productDescription && !productImage) return;
    setIsGeneratingScript(true);
    try {
      const res = await fetch("/api/ugc/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "script",
          productDescription: productDescription || "a product",
          avatarName: selectedAvatar?.name,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setScript(data.script);
      }
    } catch {
      // silently fail
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const handleGenerate = useCallback(async () => {
    if (!script || !selectedAvatar) return;
    setStep("result");
    setVideoStatus("generating");
    setVideoUrl(null);
    setVideoError(null);

    try {
      // Save record to DB
      const saveRes = await fetch("/api/ugc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productImage,
          productDescription,
          avatarId: selectedAvatar.id,
          avatarName: selectedAvatar.name,
          avatarThumbnail: selectedAvatar.previewVideoUrl || selectedAvatar.thumbnailUrl || null,
          script,
          scriptSource: "custom",
          aspectRatio,
        }),
      });

      let dbId: string | null = null;
      if (saveRes.ok) {
        const saved = await saveRes.json();
        dbId = saved.id;
      }

      // Start video generation
      const genRes = await fetch("/api/ugc/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "video",
          script,
          avatarId: selectedAvatar.id,
          aspectRatio,
          productImageUrl: productImage || undefined,
        }),
      });

      if (!genRes.ok) {
        const err = await genRes.json();
        throw new Error(err.error || "Generation failed");
      }

      const genData = await genRes.json();
      setVideoStatus("processing");

      if (dbId) {
        fetch(`/api/ugc/${dbId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            providerVideoId: genData.videoId,
            status: "processing",
          }),
        }).catch(() => {});
      }

      // Poll for completion
      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch("/api/ugc/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "status",
              videoId: genData.videoId,
            }),
          });

          if (statusRes.ok) {
            const statusData = await statusRes.json();

            if (statusData.status === "completed" && statusData.videoUrl) {
              if (pollRef.current) clearInterval(pollRef.current);
              setVideoStatus("completed");
              setVideoUrl(statusData.videoUrl);

              if (dbId) {
                fetch(`/api/ugc/${dbId}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    status: "completed",
                    videoUrl: statusData.videoUrl,
                    thumbnailUrl: statusData.thumbnailUrl,
                    duration: statusData.duration,
                  }),
                }).catch(() => {});
              }
              fetchSavedVideos();
            } else if (statusData.status === "failed") {
              if (pollRef.current) clearInterval(pollRef.current);
              setVideoStatus("failed");
              setVideoError(statusData.error || "Generation failed");

              if (dbId) {
                fetch(`/api/ugc/${dbId}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    status: "failed",
                    errorMessage: statusData.error,
                  }),
                }).catch(() => {});
              }
            }
          }
        } catch {
          // Keep polling
        }
      }, 5000);
    } catch (e) {
      setVideoStatus("failed");
      setVideoError(e instanceof Error ? e.message : "Generation failed");
    }
  }, [script, selectedAvatar, productImage, productDescription, aspectRatio]);

  const handleViewVideo = (video: SavedVideo) => {
    setProductDescription(video.productDescription || "");
    setScript(video.script);
    setSelectedAvatar({
      id: "",
      name: video.avatarName || "Creator",
      thumbnailUrl: video.avatarThumbnail || "",
      gender: "female",
      style: "",
    });
    setVideoUrl(video.videoUrl);
    setVideoStatus(video.status === "completed" ? "completed" : video.status);
    setVideoError(null);
    setStep("result");
  };

  const handleDeleteVideo = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/ugc/${id}`, { method: "DELETE" });
      if (res.ok) setSavedVideos((prev) => prev.filter((v) => v.id !== id));
    } catch {
      // silently fail
    }
  };

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto">
        <AnimatePresence mode="wait">
          {/* ─── Gallery ─── */}
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
                    UGC Studio
                  </h1>
                  <p className="text-sm text-muted">
                    Create AI influencer videos for your products
                  </p>
                </div>
                <Button onClick={handleNewVideo}>
                  <Video className="w-4 h-4" />
                  New Video
                </Button>
              </div>

              {loadingGallery ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-5 h-5 text-muted animate-spin" />
                </div>
              ) : savedVideos.length === 0 ? (
                <div className="text-center py-20">
                  <Video className="w-10 h-10 text-muted/20 mx-auto mb-4" />
                  <h2 className="text-lg font-medium mb-2">No UGC videos yet</h2>
                  <p className="text-sm text-muted mb-6">
                    Create your first AI influencer video
                  </p>
                  <Button onClick={handleNewVideo}>
                    <Sparkles className="w-4 h-4" />
                    Create First Video
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {savedVideos.map((video) => (
                    <motion.button
                      key={video.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      onClick={() => handleViewVideo(video)}
                      className="rounded-xl overflow-hidden border border-border bg-card hover:border-accent/30 transition-all text-left group cursor-pointer relative"
                    >
                      <div className="aspect-[9/16] max-h-64 bg-gradient-to-br from-card-hover to-card relative">
                        {video.thumbnailUrl || video.videoUrl ? (
                          <>
                            {video.thumbnailUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={video.thumbnailUrl} alt="Video" className="w-full h-full object-cover" />
                            ) : (
                              <video src={video.videoUrl!} className="w-full h-full object-cover" muted />
                            )}
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="w-10 h-10 rounded-full bg-black/50 backdrop-blur flex items-center justify-center">
                                <Play className="w-4 h-4 text-white ml-0.5" />
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            {video.status === "processing" || video.status === "generating" ? (
                              <Loader2 className="w-6 h-6 text-muted/30 animate-spin" />
                            ) : (
                              <Video className="w-6 h-6 text-muted/20" />
                            )}
                          </div>
                        )}
                        {video.duration && (
                          <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/60 text-[10px] text-white font-medium">
                            {video.duration}s
                          </div>
                        )}
                      </div>

                      <div className="p-3">
                        <div className="flex items-center gap-2 mb-1">
                          {video.avatarThumbnail ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={video.avatarThumbnail} alt="" className="w-5 h-5 rounded-full object-cover" />
                          ) : (
                            <div className="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center">
                              <User className="w-3 h-3 text-accent" />
                            </div>
                          )}
                          <span className="text-xs font-medium truncate">{video.avatarName || "Creator"}</span>
                        </div>
                        <p className="text-[11px] text-muted line-clamp-2">{video.script.slice(0, 80)}...</p>
                        <div className="flex items-center gap-1 text-[10px] text-muted mt-2">
                          <Clock className="w-3 h-3" />
                          {new Date(video.createdAt).toLocaleDateString()}
                        </div>
                      </div>

                      <button
                        onClick={(e) => handleDeleteVideo(video.id, e)}
                        className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 backdrop-blur flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/80 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3 text-white" />
                      </button>
                    </motion.button>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ─── Step 1: Upload Product ─── */}
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
                    New UGC Video
                  </h1>
                  <p className="text-sm text-muted">Upload your product for the AI creator</p>
                </div>
              </div>

              {/* Step indicators */}
              <div className="flex items-center gap-2 mb-8">
                {["Product", "Creator", "Script", "Generate"].map((label, i) => (
                  <div key={label} className="flex items-center gap-2 flex-1">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${i === 0 ? "bg-accent text-background" : "bg-card border border-border text-muted"}`}>
                      {i + 1}
                    </div>
                    <span className={`text-xs ${i === 0 ? "text-accent font-medium" : "text-muted"} hidden sm:inline`}>{label}</span>
                    {i < 3 && <div className="flex-1 h-px bg-border" />}
                  </div>
                ))}
              </div>

              <div className="mb-6">
                {productImage ? (
                  <div className="relative rounded-xl overflow-hidden border border-border bg-card">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={productImage} alt="Product" className="w-full max-h-80 object-contain bg-white p-4" />
                    <button
                      onClick={() => setProductImage(null)}
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
                  placeholder="Describe your product — what it does, key features, who it's for..."
                  className="w-full bg-card border border-border rounded-xl p-4 text-sm text-foreground placeholder:text-muted/30 resize-none focus:outline-none focus:border-accent/30"
                  rows={3}
                />
              </div>

              {/* Aspect ratio */}
              <div className="mb-6">
                <p className="text-xs font-medium text-muted mb-2">Video Format</p>
                <div className="flex gap-2">
                  {[
                    { value: "9:16" as const, label: "Vertical", desc: "TikTok / Reels" },
                    { value: "16:9" as const, label: "Horizontal", desc: "YouTube" },
                    { value: "1:1" as const, label: "Square", desc: "Feed posts" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setAspectRatio(opt.value)}
                      className={`flex-1 rounded-lg border-2 p-3 text-center transition-all cursor-pointer ${
                        aspectRatio === opt.value
                          ? "border-accent bg-accent-muted"
                          : "border-border hover:border-accent/30"
                      }`}
                    >
                      <p className="text-xs font-medium">{opt.label}</p>
                      <p className="text-[10px] text-muted mt-0.5">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <Button
                className="w-full py-3"
                disabled={!productDescription}
                onClick={handleContinueToCharacter}
              >
                Choose AI Creator
                <ArrowLeft className="w-4 h-4 rotate-180" />
              </Button>
            </motion.div>
          )}

          {/* ─── Step 2: Character Selection ─── */}
          {step === "character" && (
            <motion.div
              key="character"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <div className="flex items-center gap-3 mb-8">
                <button
                  onClick={() => setStep("upload")}
                  className="w-8 h-8 rounded-full border border-border flex items-center justify-center hover:bg-card cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4 text-muted" />
                </button>
                <div>
                  <h1 className="text-xl font-[family-name:var(--font-heading)] italic">
                    Choose your AI creator
                  </h1>
                  <p className="text-sm text-muted">Hover to preview — select your AI influencer</p>
                </div>
              </div>

              {/* Step indicators */}
              <div className="flex items-center gap-2 mb-8 max-w-xl">
                {["Product", "Creator", "Script", "Generate"].map((label, i) => (
                  <div key={label} className="flex items-center gap-2 flex-1">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      i < 1 ? "bg-accent/30 text-accent" : i === 1 ? "bg-accent text-background" : "bg-card border border-border text-muted"
                    }`}>
                      {i < 1 ? <Check className="w-3 h-3" /> : i + 1}
                    </div>
                    <span className={`text-xs ${i === 1 ? "text-accent font-medium" : "text-muted"} hidden sm:inline`}>{label}</span>
                    {i < 3 && <div className="flex-1 h-px bg-border" />}
                  </div>
                ))}
              </div>

              {loadingAvatars ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-5 h-5 text-muted animate-spin" />
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                  {avatars.map((avatar) => (
                    <CharacterCard
                      key={avatar.id}
                      avatar={avatar}
                      isSelected={selectedAvatar?.id === avatar.id}
                      onSelect={() => setSelectedAvatar(avatar)}
                    />
                  ))}
                </div>
              )}

              <div className="sticky bottom-0 bg-background/80 backdrop-blur-lg border-t border-border mt-10 -mx-8 px-8 py-4 flex justify-end">
                <Button
                  disabled={!selectedAvatar}
                  onClick={handleContinueToScript}
                  className="px-8"
                >
                  Write Script
                  <ArrowLeft className="w-4 h-4 rotate-180" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* ─── Step 3: Script ─── */}
          {step === "script" && (
            <motion.div
              key="script"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-xl mx-auto"
            >
              <div className="flex items-center gap-3 mb-8">
                <button
                  onClick={() => setStep("character")}
                  className="w-8 h-8 rounded-full border border-border flex items-center justify-center hover:bg-card cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4 text-muted" />
                </button>
                <div>
                  <h1 className="text-xl font-[family-name:var(--font-heading)] italic">
                    Script
                  </h1>
                  <p className="text-sm text-muted">Write or generate the script for {selectedAvatar?.name}</p>
                </div>
              </div>

              {/* Step indicators */}
              <div className="flex items-center gap-2 mb-8">
                {["Product", "Creator", "Script", "Generate"].map((label, i) => (
                  <div key={label} className="flex items-center gap-2 flex-1">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      i < 2 ? "bg-accent/30 text-accent" : i === 2 ? "bg-accent text-background" : "bg-card border border-border text-muted"
                    }`}>
                      {i < 2 ? <Check className="w-3 h-3" /> : i + 1}
                    </div>
                    <span className={`text-xs ${i === 2 ? "text-accent font-medium" : "text-muted"} hidden sm:inline`}>{label}</span>
                    {i < 3 && <div className="flex-1 h-px bg-border" />}
                  </div>
                ))}
              </div>

              {/* Context card */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border mb-6">
                {selectedAvatar?.previewVideoUrl ? (
                  <video
                    src={selectedAvatar.previewVideoUrl}
                    muted
                    loop
                    autoPlay
                    playsInline
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : selectedAvatar?.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selectedAvatar.thumbnailUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
                    <User className="w-5 h-5 text-accent" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{selectedAvatar?.name}</p>
                  <p className="text-[11px] text-muted">{selectedAvatar?.style}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-muted">Format</p>
                  <p className="text-xs font-medium">{aspectRatio}</p>
                </div>
              </div>

              {/* AI generate button */}
              <div className="mb-3 flex justify-end">
                <Button
                  variant="secondary"
                  onClick={handleGenerateScript}
                  disabled={isGeneratingScript || (!productDescription && !productImage)}
                >
                  {isGeneratingScript ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="w-3.5 h-3.5" />
                  )}
                  {isGeneratingScript ? "Writing..." : "AI Write Script"}
                </Button>
              </div>

              {/* Script textarea */}
              <textarea
                value={script}
                onChange={(e) => setScript(e.target.value)}
                placeholder={`Write what ${selectedAvatar?.name || "the creator"} should say about your product...\n\nTip: Keep it 15-30 seconds (40-80 words) for best results.`}
                className="w-full bg-card border border-border rounded-xl p-4 text-sm text-foreground placeholder:text-muted/30 resize-none focus:outline-none focus:border-accent/30 min-h-[200px]"
                rows={8}
              />

              {/* Word count */}
              <div className="flex justify-between mt-2 mb-6">
                <p className="text-[10px] text-muted">
                  {script.split(/\s+/).filter(Boolean).length} words
                  {script.split(/\s+/).filter(Boolean).length > 0 &&
                    ` (~${Math.round(script.split(/\s+/).filter(Boolean).length / 2.5)}s)`}
                </p>
                {script && (
                  <button
                    onClick={handleGenerateScript}
                    disabled={isGeneratingScript}
                    className="text-[10px] text-accent hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Regenerate
                  </button>
                )}
              </div>

              <Button
                className="w-full py-3"
                disabled={!script.trim()}
                onClick={handleGenerate}
              >
                <Sparkles className="w-4 h-4" />
                Generate Video
              </Button>
            </motion.div>
          )}

          {/* ─── Step 4: Result ─── */}
          {step === "result" && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-3xl mx-auto"
            >
              <button
                onClick={() => {
                  if (pollRef.current) clearInterval(pollRef.current);
                  setStep("gallery");
                  fetchSavedVideos();
                }}
                className="flex items-center gap-2 text-sm text-muted hover:text-accent transition-colors mb-6 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to UGC Studio
              </button>

              <div className="flex gap-6">
                {/* Left sidebar */}
                <div className="w-56 flex-shrink-0">
                  <div className="sticky top-8 space-y-5">
                    <div>
                      <p className="text-xs font-medium text-muted mb-2">AI Creator</p>
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border">
                        {selectedAvatar?.previewVideoUrl ? (
                          <video
                            src={selectedAvatar.previewVideoUrl}
                            muted
                            loop
                            autoPlay
                            playsInline
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        ) : selectedAvatar?.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={selectedAvatar.thumbnailUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
                            <User className="w-5 h-5 text-accent" />
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-medium">{selectedAvatar?.name}</p>
                          <p className="text-[10px] text-muted">{selectedAvatar?.style}</p>
                        </div>
                      </div>
                    </div>

                    {productImage && (
                      <div>
                        <p className="text-xs font-medium text-muted mb-2">Product</p>
                        <div className="w-20 h-20 rounded-lg overflow-hidden border border-border">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={productImage} alt="Product" className="w-full h-full object-cover" />
                        </div>
                      </div>
                    )}

                    <div>
                      <p className="text-xs font-medium text-muted mb-2">Script</p>
                      <p className="text-[11px] text-foreground/70 leading-relaxed line-clamp-6">{script}</p>
                    </div>
                  </div>
                </div>

                {/* Main video area */}
                <div className="flex-1 min-w-0">
                  <div
                    className={`rounded-xl overflow-hidden border border-border bg-card ${
                      aspectRatio === "9:16"
                        ? "max-w-sm mx-auto aspect-[9/16]"
                        : aspectRatio === "16:9"
                          ? "w-full aspect-video"
                          : "max-w-md mx-auto aspect-square"
                    }`}
                  >
                    {videoStatus === "completed" && videoUrl ? (
                      <video
                        src={videoUrl}
                        controls
                        autoPlay
                        className="w-full h-full object-contain bg-black"
                      />
                    ) : videoStatus === "failed" ? (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-card gap-3 p-8">
                        <X className="w-8 h-8 text-danger/50" />
                        <p className="text-sm text-danger/70 text-center">{videoError}</p>
                        <Button variant="secondary" onClick={handleGenerate} className="mt-2">
                          <RefreshCw className="w-3.5 h-3.5" />
                          Retry
                        </Button>
                      </div>
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-card-hover to-card">
                        <div className="relative mb-6">
                          <svg className="w-16 h-16 animate-spin" viewBox="0 0 64 64">
                            <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="2" className="text-border" />
                            <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent" strokeDasharray="50 126" strokeLinecap="round" />
                          </svg>
                          <Video className="w-6 h-6 text-accent absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                        </div>
                        <p className="text-sm font-medium mb-1">
                          {videoStatus === "generating"
                            ? "Starting generation..."
                            : "Creating your video..."}
                        </p>
                        <p className="text-xs text-muted">
                          This usually takes 1-3 minutes
                        </p>
                      </div>
                    )}
                  </div>

                  {videoStatus === "completed" && videoUrl && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center justify-center gap-3 mt-6"
                    >
                      <a
                        href={videoUrl}
                        download={`ugc-${selectedAvatar?.name?.toLowerCase() || "video"}.mp4`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button variant="secondary">
                          <Download className="w-3.5 h-3.5" />
                          Download
                        </Button>
                      </a>
                      <Button variant="secondary" onClick={handleNewVideo}>
                        <Sparkles className="w-3.5 h-3.5" />
                        New Video
                      </Button>
                    </motion.div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AppShell>
  );
}

"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Instagram,
  Linkedin,
  Facebook,
  Twitter,
  Calendar,
  Send,
  Edit3,
  Check,
  X,
  MoreVertical,
  Sparkles,
  Loader2,
} from "lucide-react";

interface AssetCardProps {
  asset: {
    id: string;
    platform: string;
    caption: string;
    hashtags: string[];
    imageUrl: string | null;
    imagePrompt: string | null;
    status: string;
    scheduledAt: string | null;
    publishedAt: string | null;
  };
  onPublish?: (id: string) => void;
  onSchedule?: (id: string, date: string) => void;
  onUpdateCaption?: (id: string, caption: string) => void;
  onGenerateImage?: (id: string, prompt: string) => Promise<string | null>;
}

const platformIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  instagram: Instagram,
  linkedin: Linkedin,
  facebook: Facebook,
  twitter: Twitter,
};

const statusStyles: Record<string, string> = {
  draft: "text-muted",
  scheduled: "text-warning",
  published: "text-success",
  failed: "text-danger",
};

export function AssetCard({
  asset,
  onPublish,
  onSchedule,
  onUpdateCaption,
  onGenerateImage,
}: AssetCardProps) {
  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState(asset.caption);
  const [showScheduler, setShowScheduler] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const [imageUrl, setImageUrl] = useState(asset.imageUrl);
  const [generatingImage, setGeneratingImage] = useState(false);

  const Icon = platformIcons[asset.platform] || Send;

  const handleSaveCaption = () => {
    onUpdateCaption?.(asset.id, caption);
    setEditing(false);
  };

  const handleGenerateImage = async () => {
    if (!asset.imagePrompt || !onGenerateImage) return;
    setGeneratingImage(true);
    try {
      const url = await onGenerateImage(asset.id, asset.imagePrompt);
      if (url) setImageUrl(url);
    } finally {
      setGeneratingImage(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="overflow-hidden p-0">
        {/* Visual creative area */}
        <div className="relative aspect-[4/5] bg-gradient-to-br from-card-hover to-card flex items-center justify-center p-8 overflow-hidden">
          {/* Generated image */}
          {imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt="Generated"
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}

          {/* Platform badge */}
          <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2 py-1 rounded bg-background/60 backdrop-blur-sm z-10">
            <Icon className="w-3 h-3 text-foreground/70" />
            <span className="text-[10px] text-foreground/70 capitalize">{asset.platform}</span>
          </div>

          {/* Status */}
          <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
            <span className={`text-[10px] capitalize ${statusStyles[asset.status]}`}>
              {asset.status}
            </span>
            {asset.status === "draft" && (
              <div className="relative">
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="p-1 rounded hover:bg-background/40 transition-colors cursor-pointer"
                >
                  <MoreVertical className="w-3.5 h-3.5 text-muted" />
                </button>
                {showMenu && (
                  <div className="absolute right-0 top-full mt-1 w-36 rounded-lg border border-border bg-card shadow-xl shadow-black/30 overflow-hidden z-10">
                    <button
                      onClick={() => { onPublish?.(asset.id); setShowMenu(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-card-hover cursor-pointer"
                    >
                      <Send className="w-3 h-3" />
                      Publish Now
                    </button>
                    <button
                      onClick={() => { setShowScheduler(true); setShowMenu(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-card-hover cursor-pointer"
                    >
                      <Calendar className="w-3 h-3" />
                      Schedule
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Content overlay */}
          {generatingImage ? (
            <Loader2 className="w-8 h-8 text-accent animate-spin" />
          ) : !imageUrl ? (
            <div className="max-w-[86%] text-center">
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted/70">
                Copy draft
              </p>
              <p className="mt-3 text-sm font-medium leading-relaxed text-foreground/80 line-clamp-4">
                {caption.split(/(?<=[.!?])\s+/)[0]?.slice(0, 140)}
              </p>
            </div>
          ) : null}
        </div>

        {/* Caption + actions */}
        <div className="p-4">
          {editing ? (
            <div className="space-y-2">
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                className="w-full bg-surface border border-border rounded-lg p-3 text-sm text-foreground resize-none focus:outline-none focus:border-accent/30"
                rows={4}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveCaption}>
                  <Check className="w-3 h-3" />
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setCaption(asset.caption);
                    setEditing(false);
                  }}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="group relative">
              <p className="text-sm text-foreground/70 line-clamp-3">
                {asset.caption}
              </p>
              <button
                onClick={() => setEditing(true)}
                className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-card-hover cursor-pointer"
              >
                <Edit3 className="w-3 h-3 text-muted" />
              </button>
            </div>
          )}

          {/* Hashtags */}
          {asset.hashtags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {asset.hashtags.slice(0, 5).map((tag) => (
                <span key={tag} className="text-[11px] text-accent/70">
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* Generate image button */}
          {asset.imagePrompt && !imageUrl && onGenerateImage && (
            <Button
              size="sm"
              variant="secondary"
              className="w-full mt-3"
              onClick={handleGenerateImage}
              disabled={generatingImage}
            >
              <Sparkles className="w-3 h-3" />
              {generatingImage ? "Generating..." : "Generate Image · Uses Credits"}
            </Button>
          )}

          {showScheduler && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="mt-3 flex gap-2"
            >
              <input
                type="datetime-local"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                className="flex-1 bg-surface border border-border rounded-lg px-3 py-1.5 text-xs text-foreground"
              />
              <Button
                size="sm"
                disabled={!scheduleDate}
                onClick={() => {
                  onSchedule?.(asset.id, new Date(scheduleDate).toISOString());
                  setShowScheduler(false);
                }}
              >
                Confirm
              </Button>
            </motion.div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}

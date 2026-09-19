"use client";

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  Suspense,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AnalysisProgress } from "@/components/brand-dna/analysis-progress";
import { DNAPreview } from "@/components/brand-dna/dna-preview";
import type { BrandDNA, CrawlProgress } from "@/lib/brand-dna/types";
import { Globe, ArrowRight, Dna } from "lucide-react";

type Phase = "input" | "analyzing" | "preview";

interface WorkspaceOption {
  id: string;
  name: string;
  role: string;
}

export default function NewBrandPage() {
  return (
    <Suspense>
      <NewBrandContent />
    </Suspense>
  );
}

function NewBrandContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialUrl = searchParams.get("url") || "";
  const autoAnalyze = searchParams.get("autoAnalyze") === "1";
  const autoAnalyzeStarted = useRef(false);

  const [url, setUrl] = useState(initialUrl);
  const [normalisedUrl, setNormalisedUrl] = useState("");
  const [phase, setPhase] = useState<Phase>("input");
  const [steps, setSteps] = useState<CrawlProgress[]>([]);
  const [dna, setDna] = useState<BrandDNA | null>(null);
  const [brandId, setBrandId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [workspacesLoaded, setWorkspacesLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    fetch("/api/workspaces")
      .then(async (response) => {
        if (!response.ok) return [];
        return response.json();
      })
      .then((items: WorkspaceOption[]) => {
        if (!active) return;
        const editable = items.filter(
          (workspace) =>
            workspace.role === "owner" || workspace.role === "admin"
        );
        setWorkspaces(editable);
        if (editable.length > 0) {
          setWorkspaceId((current) => current || editable[0].id);
        }
      })
      .catch(() => {
        // Brand analysis can still fall back to the personal workspace.
      })
      .finally(() => {
        if (active) setWorkspacesLoaded(true);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!url) return;

    // Normalise: prepend https:// if the user typed a bare domain
    const normalised = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    setNormalisedUrl(normalised);

    setPhase("analyzing");
    setSteps([]);
    setError("");

    try {
      const response = await fetch("/api/brands/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: normalised,
          ...(workspaceId ? { workspaceId } : {}),
        }),
      });

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = JSON.parse(line.slice(6));

          if (data.type === "progress") {
            setSteps((prev) => {
              const existing = prev.findIndex((s) => s.step === data.step);
              if (existing >= 0) {
                const updated = [...prev];
                updated[existing] = data;
                return updated;
              }
              return [...prev, data];
            });
          } else if (data.type === "complete") {
            setDna(data.brand.dna);
            setBrandId(data.brand.id);
            setPhase("preview");
          } else if (data.type === "error") {
            setError(data.message);
            setPhase("input");
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
      setPhase("input");
    }
  }, [url, workspaceId]);

  useEffect(() => {
    if (
      !autoAnalyze ||
      !initialUrl ||
      !workspacesLoaded ||
      autoAnalyzeStarted.current
    ) {
      return;
    }

    autoAnalyzeStarted.current = true;
    void handleAnalyze();
  }, [autoAnalyze, handleAnalyze, initialUrl, workspacesLoaded]);

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto">
        <AnimatePresence mode="wait">
          {phase === "input" && (
            <motion.div
              key="input"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <div className="text-center mb-10">
                <Dna className="w-6 h-6 text-accent mx-auto mb-4" />
                <h1 className="text-3xl font-[family-name:var(--font-heading)] italic mb-2">
                  Extract Brand DNA
                </h1>
                <p className="text-sm text-muted max-w-md mx-auto">
                  Enter a website URL and we&apos;ll analyze everything — colors,
                  fonts, tone, audience, and more.
                </p>
              </div>

              <Card className="p-6">
                {workspaces.length > 1 && (
                  <div className="mb-4">
                    <label
                      htmlFor="brand-workspace"
                      className="block text-xs text-muted mb-2"
                    >
                      Workspace
                    </label>
                    <select
                      id="brand-workspace"
                      value={workspaceId}
                      onChange={(event) => setWorkspaceId(event.target.value)}
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent/50"
                    >
                      {workspaces.map((workspace) => (
                        <option key={workspace.id} value={workspace.id}>
                          {workspace.name}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-[11px] text-muted">
                      Team members in this workspace will be able to work with
                      the brand and its campaigns.
                    </p>
                  </div>
                )}

                <div className="flex gap-3">
                  <div className="flex-1 flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-surface">
                    <Globe className="w-4 h-4 text-muted flex-shrink-0" />
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://example.com"
                      className="w-full bg-transparent text-foreground placeholder:text-muted/30 focus:outline-none text-sm"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAnalyze();
                      }}
                      autoFocus
                    />
                  </div>
                  <Button onClick={handleAnalyze} disabled={!url}>
                    Analyze
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </div>

                {error && (
                  <p className="text-sm text-danger mt-3 text-center">
                    {error}
                  </p>
                )}
              </Card>
            </motion.div>
          )}

          {phase === "analyzing" && (
            <motion.div
              key="analyzing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <div className="text-center mb-8">
                <h1 className="text-2xl font-[family-name:var(--font-heading)] italic mb-2">
                  Analyzing Brand DNA
                </h1>
                <p className="text-xs text-muted">{normalisedUrl}</p>
              </div>

              <Card className="p-8">
                <AnalysisProgress steps={steps} />
              </Card>
            </motion.div>
          )}

          {phase === "preview" && dna && (
            <motion.div
              key="preview"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="text-center mb-8">
                <h1 className="text-2xl font-[family-name:var(--font-heading)] italic mb-2">
                  Brand DNA Extracted
                </h1>
                <p className="text-xs text-muted">
                  Review the analysis below. You can edit these values later.
                </p>
              </div>

              <DNAPreview dna={dna} />

              <div className="flex justify-center gap-3 pt-4">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setPhase("input");
                    setDna(null);
                  }}
                >
                  Start Over
                </Button>
                <Button
                  onClick={() => router.push(`/brands/${brandId}`)}
                >
                  Looks Good
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AppShell>
  );
}

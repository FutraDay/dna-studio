"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Dna, Globe } from "lucide-react";

interface Brand {
  id: string;
  name: string;
  url: string;
  colors: string[];
  tone: string;
  industry: string;
  audience: string;
  logoUrl: string | null;
  _count: { campaigns: number };
}

export default function DashboardPage() {
  const router = useRouter();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/brands")
      .then((response) => response.json())
      .then((brandsData) => {
        setBrands(Array.isArray(brandsData) ? brandsData : []);
      })
      .finally(() => setLoading(false));
  }, []);

  // Redirect to first brand if user has brands
  useEffect(() => {
    if (!loading && brands.length > 0) {
      router.replace(`/brands/${brands[0].id}`);
    }
  }, [loading, brands, router]);

  if (loading) {
    return (
      <AppShell>
        <div className="max-w-3xl mx-auto flex items-center justify-center min-h-[60vh]">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      </AppShell>
    );
  }

  // Empty state - no brands yet
  if (brands.length === 0) {
    return (
      <AppShell>
        <div className="max-w-xl mx-auto text-center pt-32">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="w-16 h-16 rounded-2xl bg-accent-muted flex items-center justify-center mx-auto mb-6">
              <Dna className="w-8 h-8 text-accent" />
            </div>
            <h1 className="text-3xl font-[family-name:var(--font-heading)] italic mb-3">
              Welcome to DNA Studio
            </h1>
            <p className="text-sm text-muted mb-8 max-w-sm mx-auto">
              Start by analyzing your brand&apos;s website. We&apos;ll extract colors, fonts,
              tone, and audience to create on-brand content.
            </p>
            <Button size="lg" onClick={() => router.push("/brands/new")}>
              <Globe className="w-4 h-4" />
              Analyze Your First Brand
            </Button>
          </motion.div>
        </div>
      </AppShell>
    );
  }

  return null;
}

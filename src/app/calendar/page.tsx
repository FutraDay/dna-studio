"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Facebook,
  Instagram,
  Linkedin,
  Loader2,
  Send,
  Twitter,
  XCircle,
} from "lucide-react";

interface CalendarPost {
  id: string;
  platform: string;
  caption: string;
  status: string;
  imageUrl: string | null;
  scheduledAt: string;
  publishedAt: string | null;
  campaignId: string;
  campaignGoal: string;
  variantLabel: string | null;
  brand: {
    id: string;
    name: string;
  };
  overdue: boolean;
}

interface CalendarData {
  brands: Array<{ id: string; name: string }>;
  range: {
    start: string;
    end: string;
  };
  filters: {
    brandId: string | null;
    platform: string | null;
  };
  summary: {
    total: number;
    scheduled: number;
    published: number;
    failed: number;
    overdue: number;
    upcoming: number;
  };
  posts: CalendarPost[];
}

const emptyData: CalendarData = {
  brands: [],
  range: { start: "", end: "" },
  filters: { brandId: null, platform: null },
  summary: {
    total: 0,
    scheduled: 0,
    published: 0,
    failed: 0,
    overdue: 0,
    upcoming: 0,
  },
  posts: [],
};

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const platformIcons: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  instagram: Instagram,
  facebook: Facebook,
  linkedin: Linkedin,
  twitter: Twitter,
};

const platformLabels: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  twitter: "X",
};

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function nextMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildCalendarDays(month: Date) {
  const first = monthStart(month);
  const offset = (first.getDay() + 6) % 7;
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - offset);

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    return day;
  });
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-AU", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusClass(post: CalendarPost) {
  if (post.overdue) return "border-warning/40 bg-warning/10";
  if (post.status === "published") return "border-success/35 bg-success/10";
  if (post.status === "failed") return "border-danger/35 bg-danger/10";
  return "border-accent/25 bg-accent/5";
}

export default function CalendarPage() {
  const [selectedMonth, setSelectedMonth] = useState(() =>
    monthStart(new Date())
  );
  const [brandId, setBrandId] = useState("");
  const [platform, setPlatform] = useState("");
  const [data, setData] = useState<CalendarData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const start = monthStart(selectedMonth);
    const end = nextMonth(selectedMonth);
    const params = new URLSearchParams({
      start: start.toISOString(),
      end: end.toISOString(),
    });

    if (brandId) params.set("brandId", brandId);
    if (platform) params.set("platform", platform);

    fetch(`/api/calendar?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Calendar request failed");
        return response.json();
      })
      .then((calendarData: CalendarData) => {
        setData(calendarData);
      })
      .catch((requestError) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") {
          return;
        }
        setError("Couldn’t load the scheduled-post calendar.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [selectedMonth, brandId, platform]);

  const days = useMemo(
    () => buildCalendarDays(selectedMonth),
    [selectedMonth]
  );

  const postsByDay = useMemo(() => {
    const grouped = new Map<string, CalendarPost[]>();
    for (const post of data.posts) {
      const key = dateKey(new Date(post.scheduledAt));
      const current = grouped.get(key) ?? [];
      current.push(post);
      grouped.set(key, current);
    }
    return grouped;
  }, [data.posts]);

  const upcomingPosts = useMemo(
    () =>
      data.posts
        .filter(
          (post) =>
            post.status === "scheduled" &&
            !post.overdue &&
            new Date(post.scheduledAt) >= new Date()
        )
        .slice(0, 5),
    [data.posts]
  );

  const todayKey = dateKey(new Date());
  const beginReload = () => {
    setLoading(true);
    setError(null);
  };
  const monthLabel = new Intl.DateTimeFormat("en-AU", {
    month: "long",
    year: "numeric",
  }).format(selectedMonth);

  return (
    <AppShell>
      <div className="max-w-[1500px] mx-auto">
        <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-5 mb-8">
          <div>
            <div className="flex items-center gap-2 text-xs text-accent mb-3">
              <CalendarDays className="w-4 h-4" />
              Publishing
            </div>
            <h1 className="text-3xl font-[family-name:var(--font-heading)] italic mb-2">
              Content calendar
            </h1>
            <p className="text-sm text-muted max-w-2xl">
              See when campaign posts are queued to publish and track what
              happened after their scheduled time. This view does not modify
              queue jobs.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <select
              value={brandId}
              onChange={(event) => {
                beginReload();
                setBrandId(event.target.value);
              }}
              aria-label="Filter calendar by brand"
              className="min-w-44 rounded-lg border border-border bg-card px-3.5 py-2 text-sm text-foreground outline-none focus:border-accent/60"
            >
              <option value="">All brands</option>
              {data.brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>

            <select
              value={platform}
              onChange={(event) => {
                beginReload();
                setPlatform(event.target.value);
              }}
              aria-label="Filter calendar by platform"
              className="min-w-40 rounded-lg border border-border bg-card px-3.5 py-2 text-sm text-foreground outline-none focus:border-accent/60"
            >
              <option value="">All platforms</option>
              <option value="instagram">Instagram</option>
              <option value="facebook">Facebook</option>
              <option value="linkedin">LinkedIn</option>
              <option value="twitter">X</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="mb-5 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          <Card className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted mb-2">
              <Clock3 className="w-3.5 h-3.5" />
              Upcoming
            </div>
            <p className="text-2xl font-semibold">{data.summary.upcoming}</p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted mb-2">
              <Send className="w-3.5 h-3.5" />
              Scheduled
            </div>
            <p className="text-2xl font-semibold">{data.summary.scheduled}</p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted mb-2">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Published
            </div>
            <p className="text-2xl font-semibold">{data.summary.published}</p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted mb-2">
              <XCircle className="w-3.5 h-3.5" />
              Failed
            </div>
            <p className="text-2xl font-semibold">{data.summary.failed}</p>
          </Card>

          <Card className="p-4 col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2 text-xs text-muted mb-2">
              <AlertTriangle className="w-3.5 h-3.5" />
              Overdue
            </div>
            <p className="text-2xl font-semibold">{data.summary.overdue}</p>
          </Card>
        </div>

        <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_320px] gap-5">
          <Card className="p-0 overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Previous month"
                  onClick={() => {
                    beginReload();
                    setSelectedMonth(
                      new Date(
                        selectedMonth.getFullYear(),
                        selectedMonth.getMonth() - 1,
                        1
                      )
                    );
                  }}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <h2 className="text-base font-semibold min-w-40 text-center">
                  {monthLabel}
                </h2>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Next month"
                  onClick={() => {
                    beginReload();
                    setSelectedMonth(
                      new Date(
                        selectedMonth.getFullYear(),
                        selectedMonth.getMonth() + 1,
                        1
                      )
                    );
                  }}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>

              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  beginReload();
                  setSelectedMonth(monthStart(new Date()));
                }}
              >
                Today
              </Button>
            </div>

            <div className="overflow-x-auto">
              <div className="min-w-[980px]">
                <div className="grid grid-cols-7 border-b border-border bg-background/20">
                  {weekdays.map((weekday) => (
                    <div
                      key={weekday}
                      className="px-3 py-2 text-[10px] uppercase tracking-wider text-muted font-medium"
                    >
                      {weekday}
                    </div>
                  ))}
                </div>

                {loading ? (
                  <div className="min-h-[650px] flex items-center justify-center">
                    <Loader2 className="w-6 h-6 text-accent animate-spin" />
                  </div>
                ) : (
                  <div className="grid grid-cols-7">
                    {days.map((day) => {
                      const key = dateKey(day);
                      const dayPosts = postsByDay.get(key) ?? [];
                      const outsideMonth =
                        day.getMonth() !== selectedMonth.getMonth();
                      const isToday = key === todayKey;

                      return (
                        <div
                          key={key}
                          className={`min-h-[135px] border-r border-b border-border p-2 last:border-r-0 ${
                            outsideMonth ? "bg-background/15" : ""
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span
                              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs ${
                                isToday
                                  ? "bg-accent text-background font-semibold"
                                  : outsideMonth
                                    ? "text-muted/45"
                                    : "text-muted"
                              }`}
                            >
                              {day.getDate()}
                            </span>
                            {dayPosts.length > 0 && (
                              <span className="text-[10px] text-muted">
                                {dayPosts.length}
                              </span>
                            )}
                          </div>

                          <div className="space-y-1.5">
                            {dayPosts.slice(0, 3).map((post) => {
                              const Icon =
                                platformIcons[post.platform] ?? Send;

                              return (
                                <Link
                                  key={post.id}
                                  href={`/campaigns/${post.campaignId}`}
                                  className={`block rounded-md border px-2 py-1.5 hover:border-accent/45 transition-colors ${statusClass(
                                    post
                                  )}`}
                                >
                                  <div className="flex items-center gap-1.5">
                                    <Icon className="w-3 h-3 flex-shrink-0" />
                                    <span className="text-[10px] font-medium truncate">
                                      {formatTime(post.scheduledAt)}
                                    </span>
                                    {post.variantLabel && (
                                      <span className="ml-auto text-[9px] text-muted">
                                        V{post.variantLabel}
                                      </span>
                                    )}
                                  </div>
                                  <p className="mt-1 text-[10px] leading-snug line-clamp-2">
                                    {post.caption}
                                  </p>
                                </Link>
                              );
                            })}

                            {dayPosts.length > 3 && (
                              <p className="text-[10px] text-muted px-1">
                                +{dayPosts.length - 3} more
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </Card>

          <div className="space-y-4">
            <Card className="p-5">
              <h2 className="text-sm font-semibold">Next up</h2>
              <p className="text-xs text-muted mt-1 mb-4">
                The next scheduled posts visible in this month.
              </p>

              {upcomingPosts.length === 0 ? (
                <div className="py-8 text-center">
                  <Clock3 className="w-6 h-6 text-muted mx-auto mb-3" />
                  <p className="text-xs font-medium">
                    No upcoming posts in this view
                  </p>
                  <p className="text-[11px] text-muted mt-1">
                    Schedule posts from a campaign review.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {upcomingPosts.map((post) => {
                    const Icon = platformIcons[post.platform] ?? Send;

                    return (
                      <Link
                        key={post.id}
                        href={`/campaigns/${post.campaignId}`}
                        className="block rounded-lg border border-border p-3 hover:border-accent/35 transition-colors"
                      >
                        <div className="flex items-center gap-2 text-[10px] text-muted">
                          <Icon className="w-3.5 h-3.5" />
                          <span>
                            {platformLabels[post.platform] ?? post.platform}
                          </span>
                          <span>·</span>
                          <span>{formatTime(post.scheduledAt)}</span>
                        </div>
                        <p className="text-xs font-medium mt-2 line-clamp-2">
                          {post.caption}
                        </p>
                        <p className="text-[10px] text-muted mt-1">
                          {post.brand.name}
                          {post.variantLabel
                            ? ` · Variant ${post.variantLabel}`
                            : ""}
                        </p>
                      </Link>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card className="p-4">
              <h3 className="text-xs font-semibold mb-3">Status key</h3>
              <div className="grid grid-cols-2 gap-2 text-[10px] text-muted">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-accent" />
                  Scheduled
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-success" />
                  Published
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-danger" />
                  Failed
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-warning" />
                  Overdue
                </div>
              </div>
            </Card>

            <p className="text-[10px] text-muted leading-relaxed px-1">
              Calendar is intentionally view-only. Rescheduling an existing
              BullMQ job safely requires storing its queue job ID first.
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

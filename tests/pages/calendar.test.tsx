// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import CalendarPage from "@/app/calendar/page";

const now = new Date();
const year = now.getFullYear();
const month = now.getMonth();

const isoAt = (day: number, hour = 8) =>
  new Date(Date.UTC(year, month, day, hour, 0, 0)).toISOString();

const calendarData = {
  brands: [
    { id: "brand_1", name: "FutraDay" },
    { id: "brand_2", name: "NudgeWin" },
  ],
  range: {
    start: new Date(year, month, 1).toISOString(),
    end: new Date(year, month + 1, 1).toISOString(),
  },
  filters: {
    brandId: null,
    platform: null,
  },
  summary: {
    total: 3,
    scheduled: 1,
    published: 1,
    failed: 1,
    overdue: 0,
    upcoming: 0,
  },
  posts: [
    {
      id: "scheduled_1",
      platform: "linkedin",
      caption: "Scheduled campaign post",
      status: "scheduled",
      imageUrl: null,
      scheduledAt: isoAt(12),
      publishedAt: null,
      campaignId: "camp_1",
      campaignGoal: "Generate leads",
      variantLabel: "A",
      brand: { id: "brand_1", name: "FutraDay" },
      overdue: false,
    },
    {
      id: "published_1",
      platform: "instagram",
      caption: "Published campaign post",
      status: "published",
      imageUrl: null,
      scheduledAt: isoAt(14),
      publishedAt: isoAt(14, 9),
      campaignId: "camp_2",
      campaignGoal: "Awareness",
      variantLabel: null,
      brand: { id: "brand_1", name: "FutraDay" },
      overdue: false,
    },
    {
      id: "failed_1",
      platform: "facebook",
      caption: "Failed campaign post",
      status: "failed",
      imageUrl: null,
      scheduledAt: isoAt(16),
      publishedAt: null,
      campaignId: "camp_3",
      campaignGoal: "Awareness",
      variantLabel: null,
      brand: { id: "brand_2", name: "NudgeWin" },
      overdue: false,
    },
  ],
};

const response = (data: unknown, ok = true) => ({
  ok,
  json: async () => data,
});

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Content calendar page", () => {
  it("renders the month, scheduled history and campaign links", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response(calendarData))
    );

    render(<CalendarPage />);

    expect(
      await screen.findByRole("heading", { name: "Content calendar" })
    ).toBeInTheDocument();

    const monthLabel = new Intl.DateTimeFormat("en-AU", {
      month: "long",
      year: "numeric",
    }).format(new Date(year, month, 1));

    expect(screen.getByRole("heading", { name: monthLabel })).toBeInTheDocument();
    expect(screen.getByText("Scheduled campaign post")).toBeInTheDocument();
    expect(screen.getByText("Published campaign post")).toBeInTheDocument();
    expect(screen.getByText("Failed campaign post")).toBeInTheDocument();

    expect(
      screen.getByRole("link", { name: /scheduled campaign post/i })
    ).toHaveAttribute("href", "/campaigns/camp_1");
  });

  it("requests the next month when navigating forward", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response(calendarData));
    vi.stubGlobal("fetch", fetchMock);

    render(<CalendarPage />);

    await screen.findByText("Scheduled campaign post");
    await user.click(
      screen.getByRole("button", { name: /next month/i })
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const secondUrl = String(fetchMock.mock.calls[1][0]);
    const parsed = new URL(secondUrl, "http://localhost");
    const start = new Date(parsed.searchParams.get("start")!);

    expect(start.getFullYear()).toBe(
      new Date(year, month + 1, 1).getFullYear()
    );
    expect(start.getMonth()).toBe(
      new Date(year, month + 1, 1).getMonth()
    );
  });

  it("adds brand and platform filters without calling queue mutations", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response(calendarData));
    vi.stubGlobal("fetch", fetchMock);

    render(<CalendarPage />);

    await screen.findByText("Scheduled campaign post");

    await user.selectOptions(
      screen.getByRole("combobox", { name: /filter calendar by brand/i }),
      "brand_2"
    );
    await user.selectOptions(
      screen.getByRole("combobox", {
        name: /filter calendar by platform/i,
      }),
      "facebook"
    );

    await waitFor(() => {
      const urls = fetchMock.mock.calls.map(([input]) => String(input));
      expect(
        urls.some(
          (url) =>
            url.includes("brandId=brand_2") &&
            url.includes("platform=facebook")
        )
      ).toBe(true);
    });

    expect(
      fetchMock.mock.calls.every(
        ([input, init]) =>
          String(input).startsWith("/api/calendar?") &&
          (!init || !init.method || init.method === "GET")
      )
    ).toBe(true);

    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes("/schedule")
      )
    ).toBe(false);
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes("/publish")
      )
    ).toBe(false);
  });

  it("shows an empty month without inventing scheduled content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response({
          ...calendarData,
          summary: {
            total: 0,
            scheduled: 0,
            published: 0,
            failed: 0,
            overdue: 0,
            upcoming: 0,
          },
          posts: [],
        })
      )
    );

    render(<CalendarPage />);

    expect(
      await screen.findByText("No upcoming posts in this view")
    ).toBeInTheDocument();
    expect(screen.queryByText("Scheduled campaign post")).not.toBeInTheDocument();
  });
});

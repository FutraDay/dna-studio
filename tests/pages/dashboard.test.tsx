// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
}));

vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

import DashboardPage from "@/app/dashboard/page";

afterEach(cleanup);

beforeEach(() => {
  navigation.push.mockReset();
  navigation.replace.mockReset();
});

describe("DashboardPage", () => {
  it("shows the first-brand onboarding state when there are no brands", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => [],
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<DashboardPage />);

    expect(
      await screen.findByRole("heading", { name: /welcome to dna studio/i })
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/brands");
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("navigates the onboarding button to brand analysis", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => [],
      })
    );

    render(<DashboardPage />);

    await user.click(
      await screen.findByRole("button", { name: /analyze your first brand/i })
    );
    expect(navigation.push).toHaveBeenCalledWith("/brands/new");
  });

  it("redirects an existing user to their first brand without fetching campaigns", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => [
        {
          id: "brand_1",
          name: "FutraDay",
          url: "https://futraday.com.au",
          colors: ["#050706"],
          tone: "direct",
          industry: "software",
          audience: "small business",
          logoUrl: null,
          _count: { campaigns: 1 },
        },
      ],
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(navigation.replace).toHaveBeenCalledWith("/brands/brand_1");
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/brands");
  });

  it("treats a malformed brands response as an empty list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({ error: "unexpected response" }),
      })
    );

    render(<DashboardPage />);

    expect(
      await screen.findByRole("heading", { name: /welcome to dna studio/i })
    ).toBeInTheDocument();
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});

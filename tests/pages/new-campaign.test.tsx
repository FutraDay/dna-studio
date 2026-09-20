// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  params: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push }),
  useSearchParams: () => navigation.params,
}));

vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

vi.mock("next/image", () => ({
  default: ({ alt = "", ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}));

import NewCampaignPage from "@/app/campaigns/new/page";

function jsonResponse(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
    })
  );
}

afterEach(cleanup);

beforeEach(() => {
  vi.restoreAllMocks();
  navigation.push.mockReset();
  navigation.params = new URLSearchParams();
});

describe("NewCampaignPage suggestion previews", () => {
  it("loads text suggestions without automatically spending image-generation credits", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/brands") {
        return jsonResponse([
          {
            id: "brand_1",
            name: "FutraDay",
            colors: ["#050706", "#B8FF2C"],
            logoUrl: null,
          },
        ]);
      }

      if (url === "/api/campaigns/suggestions?brandId=brand_1") {
        return jsonResponse([
          {
            title: "Lead machine",
            description: "Turn repetitive admin into an automated workflow.",
            imagePrompt: "A premium workflow visualization",
          },
        ]);
      }

      return jsonResponse({ error: `unexpected request: ${url}` });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<NewCampaignPage />);

    expect(await screen.findByText("Lead machine")).toBeInTheDocument();
    expect(
      screen.getByText("Visual concept - no image generated automatically")
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) =>
          String(input).startsWith("/api/images/generate")
        )
      ).toBe(false);
    });
  });
});
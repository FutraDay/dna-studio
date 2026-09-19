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

vi.mock("@/components/brand-dna/analysis-progress", () => ({
  AnalysisProgress: () => <div>analysis-progress</div>,
}));

vi.mock("@/components/brand-dna/dna-preview", () => ({
  DNAPreview: () => <div>dna-preview</div>,
}));

import NewBrandPage from "@/app/brands/new/page";

const ownerWorkspace = {
  id: "ws_1",
  name: "FutraDay",
  role: "owner",
};

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

describe("NewBrandPage extension handoff", () => {
  it("auto-starts analysis for a URL supplied by the Chrome extension", async () => {
    navigation.params = new URLSearchParams({
      url: "https://example.com/products?ref=extension",
      autoAnalyze: "1",
    });

    const fetchMock = vi.fn(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url === "/api/workspaces") {
          return jsonResponse([ownerWorkspace]);
        }

        if (url === "/api/brands/analyze" && init?.method === "POST") {
          return Promise.resolve(
            new Response(
              'data: {"type":"complete","brand":{"id":"brand_1","dna":{"name":"Example"}}}\n\n',
              { headers: { "Content-Type": "text/event-stream" } }
            )
          );
        }

        return jsonResponse({ error: "unexpected request" });
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<NewBrandPage />);

    expect(await screen.findByText("dna-preview")).toBeInTheDocument();

    const analyzeCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input) === "/api/brands/analyze" &&
        init?.method === "POST"
    );
    expect(analyzeCall).toBeTruthy();

    const body = JSON.parse(String(analyzeCall?.[1]?.body));
    expect(body).toEqual({
      url: "https://example.com/products?ref=extension",
      workspaceId: "ws_1",
    });
  });

  it("prefills a supplied URL without auto-running when autoAnalyze is absent", async () => {
    navigation.params = new URLSearchParams({
      url: "https://example.com",
    });

    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (String(input) === "/api/workspaces") {
        return jsonResponse([ownerWorkspace]);
      }
      return jsonResponse({ error: "unexpected request" });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<NewBrandPage />);

    expect(
      await screen.findByDisplayValue("https://example.com")
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});

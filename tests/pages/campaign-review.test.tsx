// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "camp_a" }),
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

vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

vi.mock("@/components/campaigns/asset-card", () => ({
  AssetCard: ({ asset }: { asset: { id: string; caption: string } }) => (
    <div data-testid={`asset-${asset.id}`}>{asset.caption}</div>
  ),
}));

import CampaignPage from "@/app/campaigns/[id]/page";

const baseCampaign = {
  id: "camp_a",
  goal: "Generate qualified leads",
  experimentId: null,
  variantLabel: null,
  isPreferredVariant: false,
  experiment: null,
  concepts: [
    {
      name: "Admin tax",
      description: "Manual work creates invisible cost.",
      theme: "operations",
    },
  ],
  brand: {
    id: "brand_1",
    name: "FutraDay",
    colors: ["#050706"],
    tone: "professional",
  },
  assets: [
    {
      id: "asset_a",
      platform: "linkedin",
      caption: "Control copy",
      hashtags: ["operations"],
      imageUrl: null,
      imagePrompt: "A clean office workflow scene",
      status: "draft",
      scheduledAt: null,
      publishedAt: null,
      conceptIndex: 0,
    },
  ],
  createdAt: "2026-09-19T00:00:00.000Z",
};

const experimentCampaign = {
  ...baseCampaign,
  experimentId: "exp_1",
  variantLabel: "A",
  experiment: {
    id: "exp_1",
    preferredCampaignId: null,
    variants: [
      {
        id: "camp_a",
        variantLabel: "A",
        isPreferredVariant: false,
        createdAt: "2026-09-19T00:00:00.000Z",
        updatedAt: "2026-09-19T00:01:00.000Z",
      },
      {
        id: "camp_b",
        variantLabel: "B",
        isPreferredVariant: false,
        createdAt: "2026-09-19T00:02:00.000Z",
        updatedAt: "2026-09-19T00:02:00.000Z",
      },
    ],
  },
};

const response = (data: unknown, ok = true) => ({
  ok,
  json: async () => data,
});

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Campaign review A/B controls", () => {
  it("creates Variant B through the zero-credit clone endpoint", async () => {
    const user = userEvent.setup();
    let campaignReads = 0;
    const fetchMock = vi.fn().mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url === "/api/settings" && !init?.method) {
          return response({ effective: { imageProvider: "openai" } });
        }

        if (url === "/api/campaigns/camp_a" && !init?.method) {
          campaignReads += 1;
          return response(
            campaignReads === 1 ? baseCampaign : experimentCampaign
          );
        }

        if (
          url === "/api/campaigns/camp_a/variants" &&
          init?.method === "POST"
        ) {
          return response(
            { created: true, variant: { id: "camp_b", variantLabel: "B" } },
            true
          );
        }

        throw new Error(`Unexpected fetch: ${url} ${init?.method ?? "GET"}`);
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<CampaignPage />);

    await user.click(
      await screen.findByRole("button", {
        name: /create variant b.*no credits/i,
      })
    );

    expect(
      await screen.findByRole("link", { name: /variant b/i })
    ).toHaveAttribute("href", "/campaigns/camp_b");
    expect(
      screen.getByRole("link", { name: /variant a/i })
    ).toHaveAttribute("href", "/campaigns/camp_a");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/campaigns/camp_a/variants",
      { method: "POST" }
    );
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes("/api/images/generate")
      )
    ).toBe(false);
  });

  it("marks the current A/B campaign as the preferred variant", async () => {
    const user = userEvent.setup();
    let campaignReads = 0;
    const selectedCampaign = {
      ...experimentCampaign,
      isPreferredVariant: true,
      experiment: {
        ...experimentCampaign.experiment,
        preferredCampaignId: "camp_a",
        variants: experimentCampaign.experiment.variants.map((variant) =>
          variant.id === "camp_a"
            ? { ...variant, isPreferredVariant: true }
            : variant
        ),
      },
    };

    const fetchMock = vi.fn().mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url === "/api/settings" && !init?.method) {
          return response({ effective: { imageProvider: "openai" } });
        }

        if (url === "/api/campaigns/camp_a" && !init?.method) {
          campaignReads += 1;
          return response(
            campaignReads === 1 ? experimentCampaign : selectedCampaign
          );
        }

        if (
          url === "/api/campaigns/camp_a/variants" &&
          init?.method === "PATCH"
        ) {
          return response({
            experimentId: "exp_1",
            preferredCampaignId: "camp_a",
          });
        }

        throw new Error(`Unexpected fetch: ${url} ${init?.method ?? "GET"}`);
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<CampaignPage />);

    await user.click(
      await screen.findByRole("button", { name: /choose this variant/i })
    );

    expect(await screen.findByText("Preferred variant")).toBeInTheDocument();

    const patchCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url) === "/api/campaigns/camp_a/variants" &&
        (init as RequestInit | undefined)?.method === "PATCH"
    );
    expect(patchCall).toBeDefined();
    expect(JSON.parse((patchCall?.[1] as RequestInit).body as string)).toEqual({
      preferredCampaignId: "camp_a",
    });

    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes("/publish")
      )
    ).toBe(false);
  });

  it("shows free-local image controls when ComfyUI is the effective provider", async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/campaigns/camp_a") return response(baseCampaign);
      if (url === "/api/settings") {
        return response({ effective: { imageProvider: "comfyui" } });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CampaignPage />);

    expect(await screen.findByText(/local comfyui is active/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate 1 backgrounds - free local/i })).toBeInTheDocument();
    expect(screen.queryByText(/uses your configured image-provider api credits/i)).not.toBeInTheDocument();
  });

  it("shows the preferred state without offering a second selection action", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response({
          ...experimentCampaign,
          isPreferredVariant: true,
          experiment: {
            ...experimentCampaign.experiment,
            preferredCampaignId: "camp_a",
          },
        })
      )
    );

    render(<CampaignPage />);

    expect(await screen.findByText("Preferred variant")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /choose this variant/i })
    ).not.toBeInTheDocument();
  });
});

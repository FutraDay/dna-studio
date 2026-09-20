import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  workspaceMember: { findMany: vi.fn() },
  brand: { findMany: vi.fn(), create: vi.fn() },
  campaign: { findMany: vi.fn() },
}));

const mobileAuth = vi.hoisted(() => ({
  issueMobileToken: vi.fn(),
  requireMobileUser: vi.fn(),
  revokeMobileToken: vi.fn(),
}));

const workspaceAccess = vi.hoisted(() => ({
  brandAccessWhere: vi.fn(() => ({ workspace: { members: { some: {} } } })),
  campaignAccessWhere: vi.fn(() => ({ brand: { workspace: {} } })),
  ensurePersonalWorkspace: vi.fn(),
  requireWorkspaceRole: vi.fn(),
}));

const crawler = vi.hoisted(() => ({
  crawlBrandDNA: vi.fn(),
}));

const webhook = vi.hoisted(() => ({
  safeQueueWebhookEvents: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/mobile/auth", () => mobileAuth);
vi.mock("@/lib/workspaces/access", () => workspaceAccess);
vi.mock("@/lib/brand-dna/crawler", () => crawler);
vi.mock("@/lib/webhooks/queue", () => webhook);
vi.mock("bcryptjs", () => ({
  default: { compare: vi.fn() },
}));

import bcrypt from "bcryptjs";
import { POST as login } from "@/app/api/mobile/auth/login/route";
import { POST as logout } from "@/app/api/mobile/auth/logout/route";
import { GET as overview } from "@/app/api/mobile/overview/route";
import { POST as analyze } from "@/app/api/mobile/brands/analyze/route";

const compare = vi.mocked(bcrypt.compare);
const jsonRequest = (path: string, body: unknown, token?: string) =>
  new Request("http://localhost" + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: JSON.stringify(body),
  });

const mobileUser = {
  id: "user_1",
  email: "eric@example.com",
  name: "Eric",
  image: null,
};

const dna = {
  name: "Example",
  url: "https://example.com",
  logoUrl: null,
  colors: [{ hex: "#111111", usage: "primary" }],
  fonts: [{ family: "Inter", role: "body" }],
  tone: { primary: "direct", traits: [] },
  industry: "software",
  category: "SaaS",
  audience: { primary: "operators", demographics: [], psychographics: [] },
  keywords: [],
  painPoints: [],
  valuePropositions: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  compare.mockResolvedValue(true as never);
  db.user.findUnique.mockResolvedValue({
    ...mobileUser,
    password: "hashed",
  } as never);
  mobileAuth.issueMobileToken.mockResolvedValue({
    token: "dna_mob_test_token",
    expiresAt: new Date("2026-10-20T00:00:00.000Z"),
  });
  mobileAuth.requireMobileUser.mockResolvedValue({ user: mobileUser });
  mobileAuth.revokeMobileToken.mockResolvedValue(true);
  db.workspaceMember.findMany.mockResolvedValue([]);
  db.brand.findMany.mockResolvedValue([]);
  db.campaign.findMany.mockResolvedValue([]);
  workspaceAccess.ensurePersonalWorkspace.mockResolvedValue({
    id: "ws_1",
    name: "Eric Workspace",
  });
  workspaceAccess.requireWorkspaceRole.mockResolvedValue({
    workspace: { id: "ws_1" },
  });
  crawler.crawlBrandDNA.mockResolvedValue(dna as never);
  db.brand.create.mockResolvedValue({
    id: "brand_1",
    userId: "user_1",
    workspaceId: "ws_1",
  } as never);
  webhook.safeQueueWebhookEvents.mockResolvedValue(1);
});
describe("mobile auth routes", () => {
  it("logs in with credentials and returns an opaque mobile token", async () => {
    const response = await login(
      jsonRequest("/api/mobile/auth/login", {
        email: "ERIC@EXAMPLE.COM",
        password: "correct horse battery",
        deviceName: "Eric phone",
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      token: "dna_mob_test_token",
      user: mobileUser,
    });
    expect(db.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: "eric@example.com" } })
    );
    expect(mobileAuth.issueMobileToken).toHaveBeenCalledWith(
      "user_1",
      "Eric phone"
    );
  });

  it("returns the same generic 401 for an unknown account", async () => {
    db.user.findUnique.mockResolvedValue(null);

    const response = await login(
      jsonRequest("/api/mobile/auth/login", {
        email: "missing@example.com",
        password: "password",
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid email or password",
    });
    expect(mobileAuth.issueMobileToken).not.toHaveBeenCalled();
  });

  it("returns the same generic 401 for a bad password", async () => {
    compare.mockResolvedValue(false as never);

    const response = await login(
      jsonRequest("/api/mobile/auth/login", {
        email: "eric@example.com",
        password: "wrong",
      })
    );

    expect(response.status).toBe(401);
    expect(mobileAuth.issueMobileToken).not.toHaveBeenCalled();
  });
  it("validates mobile login input", async () => {
    const response = await login(
      jsonRequest("/api/mobile/auth/login", {
        email: "not-email",
        password: "",
      })
    );

    expect(response.status).toBe(400);
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed login JSON", async () => {
    const response = await login(
      new Request("http://localhost/api/mobile/auth/login", {
        method: "POST",
        body: "{",
      })
    );

    expect(response.status).toBe(400);
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("logs out idempotently", async () => {
    const response = await logout(
      jsonRequest("/api/mobile/auth/logout", {}, "dna_mob_test_token")
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(mobileAuth.revokeMobileToken).toHaveBeenCalledOnce();
  });
});

describe("GET /api/mobile/overview", () => {
  it("returns mobile-safe workspace, brand, and campaign data", async () => {
    db.workspaceMember.findMany.mockResolvedValue([
      {
        role: "owner",
        workspace: { id: "ws_1", name: "FutraDay", ownerId: "user_1" },
      },
    ] as never);
    db.brand.findMany.mockResolvedValue([{ id: "brand_1", name: "FutraDay" }] as never);
    db.campaign.findMany.mockResolvedValue([
      { id: "campaign_1", goal: "Brand awareness" },
    ] as never);

    const response = await overview(
      new Request("http://localhost/api/mobile/overview")
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      user: mobileUser,
      workspaces: [{ id: "ws_1", name: "FutraDay", role: "owner" }],
      brands: [{ id: "brand_1", name: "FutraDay" }],
      campaigns: [{ id: "campaign_1", goal: "Brand awareness" }],
    });
  });

  it("returns 401 for an invalid mobile token", async () => {
    mobileAuth.requireMobileUser.mockRejectedValue(new Error("Unauthorized"));

    const response = await overview(
      new Request("http://localhost/api/mobile/overview")
    );

    expect(response.status).toBe(401);
  });
});
describe("POST /api/mobile/brands/analyze", () => {
  it("creates a brand with the existing Brand DNA crawler", async () => {
    const response = await analyze(
      jsonRequest(
        "/api/mobile/brands/analyze",
        { url: "https://example.com" },
        "dna_mob_test_token"
      )
    );

    expect(response.status).toBe(200);
    expect(crawler.crawlBrandDNA).toHaveBeenCalledWith("https://example.com");
    expect(workspaceAccess.ensurePersonalWorkspace).toHaveBeenCalledWith(
      "user_1"
    );
    expect(db.brand.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user_1",
          workspaceId: "ws_1",
          name: "Example",
          colors: ["#111111"],
          fonts: ["Inter"],
        }),
      })
    );
    expect(webhook.safeQueueWebhookEvents).toHaveBeenCalledOnce();
  });

  it("supports an owner/admin-selected workspace", async () => {
    const response = await analyze(
      jsonRequest(
        "/api/mobile/brands/analyze",
        { url: "https://example.com", workspaceId: "ws_team" },
        "dna_mob_test_token"
      )
    );

    expect(response.status).toBe(200);
    expect(workspaceAccess.requireWorkspaceRole).toHaveBeenCalledWith(
      "user_1",
      "ws_team",
      ["owner", "admin"]
    );
    expect(workspaceAccess.ensurePersonalWorkspace).not.toHaveBeenCalled();
  });
  it("rejects a workspace the user cannot manage", async () => {
    workspaceAccess.requireWorkspaceRole.mockResolvedValue(null);

    const response = await analyze(
      jsonRequest("/api/mobile/brands/analyze", {
        url: "https://example.com",
        workspaceId: "ws_locked",
      })
    );

    expect(response.status).toBe(403);
    expect(crawler.crawlBrandDNA).not.toHaveBeenCalled();
  });

  it("validates the analysis URL", async () => {
    const response = await analyze(
      jsonRequest("/api/mobile/brands/analyze", { url: "not a url" })
    );

    expect(response.status).toBe(400);
    expect(crawler.crawlBrandDNA).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed analysis JSON", async () => {
    const response = await analyze(
      new Request("http://localhost/api/mobile/brands/analyze", {
        method: "POST",
        body: "{",
      })
    );

    expect(response.status).toBe(400);
    expect(crawler.crawlBrandDNA).not.toHaveBeenCalled();
  });

  it("returns 401 when the mobile token is invalid", async () => {
    mobileAuth.requireMobileUser.mockRejectedValue(new Error("Unauthorized"));

    const response = await analyze(
      jsonRequest("/api/mobile/brands/analyze", {
        url: "https://example.com",
      })
    );

    expect(response.status).toBe(401);
    expect(crawler.crawlBrandDNA).not.toHaveBeenCalled();
  });
});

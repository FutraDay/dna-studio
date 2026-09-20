import "dotenv/config";
import fs from "node:fs";
import { Prisma } from "@prisma/client";
import { chromium } from "playwright";
import { encode } from "next-auth/jwt";
import { prisma } from "../src/lib/db";

const baseUrl = process.env.CAMPAIGN_SMOKE_BASE_URL ?? "http://127.0.0.1:3000";
const brandQuery = process.env.CAMPAIGN_SMOKE_BRAND ?? "FutraDay";
const marker = "[Analytics smoke verified]";

async function main() {
  const authSecret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
  if (!authSecret) {
    throw new Error("NextAuth secret is not configured");
  }

  const source = await prisma.campaign.findFirst({
    where: {
      brand: {
        name: {
          contains: brandQuery,
          mode: "insensitive",
        },
      },
    },
    orderBy: { createdAt: "desc" },
    select: {
      userId: true,
      brandId: true,
      concepts: true,
      brand: { select: { name: true } },
    },
  });

  if (!source) {
    throw new Error(`No campaign found for ${brandQuery}`);
  }

  const tempCampaign = await prisma.campaign.create({
    data: {
      brandId: source.brandId,
      userId: source.userId,
      goal: `${marker} dashboard verification`,
      concepts: source.concepts as Prisma.InputJsonValue,
      assets: {
        create: {
          platform: "linkedin",
          caption: `${marker} Synthetic post used only for browser verification.`,
          hashtags: ["analyticssmoke"],
          imagePrompt: null,
          imageUrl: null,
          providerPostId: "urn:li:ugcPost:analytics-smoke",
          status: "published",
          publishedAt: new Date(),
          metrics: {
            create: {
              impressions: 987654,
              reach: 765432,
              likes: 4321,
              comments: 321,
              shares: 210,
              clicks: 1234,
              saves: 98,
              source: "smoke",
            },
          },
        },
      },
    },
    select: { id: true },
  });

  const token = await encode({
    secret: authSecret,
    token: { sub: source.userId },
    maxAge: 60 * 60,
  });

  const preferredChrome =
    process.env.CAMPAIGN_SMOKE_CHROME_PATH ??
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

  const browser = await chromium.launch({
    headless: true,
    ...(fs.existsSync(preferredChrome)
      ? { executablePath: preferredChrome }
      : {}),
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });

  await context.addCookies([
    {
      name: "next-auth.session-token",
      value: token,
      url: baseUrl,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  const page = await context.newPage();
  const browserErrors: string[] = [];
  const forbiddenRequests: string[] = [];

  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("request", (request) => {
    const url = request.url();
    if (
      url.includes("graph.facebook.com") ||
      url.includes("api.twitter.com") ||
      url.includes("api.linkedin.com")
    ) {
      forbiddenRequests.push(`${request.method()} ${url}`);
    }
  });

  try {
    const response = await page.goto(`${baseUrl}/analytics`, {
      waitUntil: "networkidle",
      timeout: 30_000,
    });

    if (!response?.ok()) {
      throw new Error(
        `Analytics page failed with HTTP ${response?.status() ?? "unknown"}`
      );
    }

    await page.getByRole("heading", { name: "Analytics" }).waitFor();
    await page.getByText(
      `${marker} Synthetic post used only for browser verification.`,
      { exact: true }
    ).waitFor();

    const refreshButton = page.getByRole("button", {
      name: /refresh metrics.*no ai credits/i,
    });
    await refreshButton.waitFor();

    const filter = page.getByRole("combobox", {
      name: /filter analytics by brand/i,
    });
    await filter.selectOption(source.brandId);
    await page.waitForLoadState("networkidle");

    await page.getByText(
      `${marker} Synthetic post used only for browser verification.`,
      { exact: true }
    ).waitFor();

    if (forbiddenRequests.length > 0) {
      throw new Error(
        `Analytics smoke unexpectedly called social APIs: ${forbiddenRequests.join(" | ")}`
      );
    }

    if (browserErrors.length > 0) {
      throw new Error(
        `Browser emitted page errors: ${browserErrors.join(" | ")}`
      );
    }

    const stored = await prisma.asset.findFirst({
      where: { campaignId: tempCampaign.id },
      include: {
        metrics: {
          orderBy: { fetchedAt: "desc" },
          take: 1,
        },
      },
    });

    if (!stored || stored.metrics[0]?.impressions !== 987654) {
      throw new Error("Seeded metric snapshot was not retained");
    }

    console.log(
      JSON.stringify(
        {
          passed: true,
          temporaryCampaignId: tempCampaign.id,
          brand: source.brand.name,
          publishedPostVisible: true,
          metricSnapshotVisibleToApi: true,
          refreshControlPresent: true,
          socialApiCallsTriggered: false,
          browserErrors,
        },
        null,
        2
      )
    );
  } finally {
    await browser.close();
    await prisma.campaign.deleteMany({
      where: { id: tempCampaign.id, userId: source.userId },
    });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("ANALYTICS_BROWSER_SMOKE_FAILED", error);
  process.exitCode = 1;
});

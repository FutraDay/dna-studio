import "dotenv/config";
import fs from "node:fs";
import { Prisma } from "@prisma/client";
import { chromium } from "playwright";
import { encode } from "next-auth/jwt";
import { prisma } from "../src/lib/db";

const baseUrl = process.env.CAMPAIGN_SMOKE_BASE_URL ?? "http://127.0.0.1:3000";
const brandQuery = process.env.CAMPAIGN_SMOKE_BRAND ?? "FutraDay";
const marker = "[Calendar smoke verified]";

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

  const now = new Date();
  const scheduledAt = new Date(
    now.getFullYear(),
    now.getMonth(),
    15,
    10,
    30,
    0,
    0
  );
  const publishedAt = new Date(scheduledAt.getTime() + 30_000);

  const tempCampaign = await prisma.campaign.create({
    data: {
      brandId: source.brandId,
      userId: source.userId,
      goal: `${marker} view-only verification`,
      concepts: source.concepts as Prisma.InputJsonValue,
      assets: {
        create: [
          {
            platform: "linkedin",
            caption: `${marker} Scheduled post.`,
            hashtags: ["calendarsmoke"],
            imagePrompt: null,
            imageUrl: null,
            status: "scheduled",
            scheduledAt,
          },
          {
            platform: "instagram",
            caption: `${marker} Published post.`,
            hashtags: ["calendarsmoke"],
            imagePrompt: null,
            imageUrl: null,
            status: "published",
            scheduledAt,
            publishedAt,
          },
          {
            platform: "facebook",
            caption: `${marker} Failed post.`,
            hashtags: ["calendarsmoke"],
            imagePrompt: null,
            imageUrl: null,
            status: "failed",
            scheduledAt,
          },
        ],
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
    viewport: { width: 1500, height: 1150 },
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
    const method = request.method();

    if (
      url.includes("/schedule") ||
      url.includes("/publish") ||
      url.includes("graph.facebook.com") ||
      url.includes("api.twitter.com") ||
      url.includes("api.linkedin.com")
    ) {
      forbiddenRequests.push(`${method} ${url}`);
    }
  });

  try {
    const response = await page.goto(`${baseUrl}/calendar`, {
      waitUntil: "networkidle",
      timeout: 30_000,
    });

    if (!response?.ok()) {
      throw new Error(
        `Calendar page failed with HTTP ${response?.status() ?? "unknown"}`
      );
    }

    await page
      .getByRole("heading", { name: "Content calendar" })
      .waitFor();

    await page
      .getByText(`${marker} Scheduled post.`, { exact: true })
      .waitFor();

    await page
      .getByText(`${marker} Published post.`, { exact: true })
      .waitFor();

    await page
      .getByText(`${marker} Failed post.`, { exact: true })
      .waitFor();

    const brandFilter = page.getByRole("combobox", {
      name: /filter calendar by brand/i,
    });
    await brandFilter.selectOption(source.brandId);
    await page.waitForLoadState("networkidle");

    const platformFilter = page.getByRole("combobox", {
      name: /filter calendar by platform/i,
    });
    await platformFilter.selectOption("linkedin");
    await page.waitForLoadState("networkidle");

    await page
      .getByText(`${marker} Scheduled post.`, { exact: true })
      .waitFor();

    await page.getByRole("button", { name: "Next month" }).click();
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Today" }).click();
    await page.waitForLoadState("networkidle");

    await page
      .getByText(`${marker} Scheduled post.`, { exact: true })
      .waitFor();

    if (forbiddenRequests.length > 0) {
      throw new Error(
        `Calendar smoke triggered a forbidden request: ${forbiddenRequests.join(" | ")}`
      );
    }

    if (browserErrors.length > 0) {
      throw new Error(
        `Browser emitted page errors: ${browserErrors.join(" | ")}`
      );
    }

    const stored = await prisma.asset.findMany({
      where: { campaignId: tempCampaign.id },
      select: {
        id: true,
        status: true,
        scheduledAt: true,
      },
      orderBy: { platform: "asc" },
    });

    if (stored.length !== 3 || stored.some((asset) => !asset.scheduledAt)) {
      throw new Error("Synthetic calendar assets were not retained");
    }

    console.log(
      JSON.stringify(
        {
          passed: true,
          temporaryCampaignId: tempCampaign.id,
          brand: source.brand.name,
          scheduledPostVisible: true,
          publishedHistoryVisible: true,
          failedHistoryVisible: true,
          brandFilterVerified: true,
          platformFilterVerified: true,
          monthNavigationVerified: true,
          queueOrPublishCallsTriggered: false,
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
  console.error("CALENDAR_BROWSER_SMOKE_FAILED", error);
  process.exitCode = 1;
});

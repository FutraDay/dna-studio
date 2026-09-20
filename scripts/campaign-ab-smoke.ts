import "dotenv/config";
import fs from "node:fs";
import { Prisma } from "@prisma/client";
import { chromium } from "playwright";
import { encode } from "next-auth/jwt";
import { prisma } from "../src/lib/db";

const baseUrl = process.env.CAMPAIGN_SMOKE_BASE_URL ?? "http://127.0.0.1:3000";
const brandQuery = process.env.CAMPAIGN_SMOKE_BRAND ?? "FutraDay";

async function selectSourceCampaign() {
  return prisma.campaign.findFirst({
    where: {
      brand: {
        name: {
          contains: brandQuery,
          mode: "insensitive",
        },
      },
    },
    orderBy: { createdAt: "desc" },
    include: { assets: true },
  });
}

async function main() {
  const authSecret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
  if (!authSecret) {
    throw new Error("NextAuth secret is not configured");
  }

  const source = await selectSourceCampaign();
  if (!source) {
    throw new Error(`No source campaign found for ${brandQuery}`);
  }

  const tempCampaign = await prisma.campaign.create({
    data: {
      brandId: source.brandId,
      userId: source.userId,
      goal: `[A/B smoke] ${source.goal}`,
      concepts: source.concepts as Prisma.InputJsonValue,
      assets: {
        create: source.assets.map((asset) => ({
          platform: asset.platform,
          caption: asset.caption,
          imageUrl: asset.imageUrl,
          imagePrompt: asset.imagePrompt,
          hashtags: asset.hashtags,
          status: "draft",
        })),
      },
    },
    select: { id: true, userId: true },
  });

  const token = await encode({
    secret: authSecret,
    token: { sub: tempCampaign.userId },
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
  const forbiddenRequests: string[] = [];
  const browserErrors: string[] = [];

  page.on("request", (request) => {
    const url = request.url();
    if (
      url.includes("/api/images/generate") ||
      url.includes("/api/campaigns/generate") ||
      url.includes("/publish") ||
      url.includes("/schedule")
    ) {
      forbiddenRequests.push(`${request.method()} ${url}`);
    }
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  let experimentId: string | null = null;

  try {
    const firstResponse = await page.goto(
      `${baseUrl}/campaigns/${tempCampaign.id}`,
      {
        waitUntil: "networkidle",
        timeout: 30_000,
      }
    );

    if (!firstResponse?.ok()) {
      throw new Error(
        `Temporary campaign page failed with HTTP ${firstResponse?.status() ?? "unknown"}`
      );
    }

    const createButton = page.getByRole("button", {
      name: /create variant b.*no credits/i,
    });
    await createButton.waitFor();
    await createButton.click();

    const variantBLink = page.getByRole("link", { name: /variant b/i });
    await variantBLink.waitFor({ timeout: 10_000 });
    const variantBHref = await variantBLink.getAttribute("href");
    if (!variantBHref) {
      throw new Error("Variant B link did not include a campaign URL");
    }

    const storedA = await prisma.campaign.findUnique({
      where: { id: tempCampaign.id },
      select: {
        experimentId: true,
        variantLabel: true,
        assets: true,
      },
    });

    if (!storedA?.experimentId || storedA.variantLabel !== "A") {
      throw new Error("Source campaign was not promoted to Variant A");
    }
    experimentId = storedA.experimentId;

    const variants = await prisma.campaign.findMany({
      where: {
        userId: source.userId,
        experimentId,
      },
      orderBy: { variantLabel: "asc" },
      include: { assets: true },
    });

    if (variants.length !== 2) {
      throw new Error(`Expected 2 variants, found ${variants.length}`);
    }

    const variantB = variants.find((variant) => variant.variantLabel === "B");
    if (!variantB) {
      throw new Error("Variant B was not stored");
    }

    if (variantB.assets.length !== source.assets.length) {
      throw new Error(
        `Variant B expected ${source.assets.length} assets, found ${variantB.assets.length}`
      );
    }

    const nonDraftAsset = variantB.assets.find(
      (asset) =>
        asset.status !== "draft" ||
        asset.scheduledAt !== null ||
        asset.publishedAt !== null
    );
    if (nonDraftAsset) {
      throw new Error(
        `Variant B asset ${nonDraftAsset.id} did not start as a clean draft`
      );
    }

    await variantBLink.click();
    await page.waitForURL(`${baseUrl}/campaigns/${variantB.id}`, {
      timeout: 10_000,
    });

    await page.getByText("Variant B", { exact: true }).first().waitFor();
    const chooseButton = page.getByRole("button", {
      name: /choose this variant/i,
    });
    await chooseButton.waitFor();
    await chooseButton.click();
    await page.getByText("Preferred variant", { exact: true }).waitFor();

    const preferred = await prisma.campaign.findFirst({
      where: {
        userId: source.userId,
        experimentId,
        isPreferredVariant: true,
      },
      select: { id: true, variantLabel: true },
    });

    if (preferred?.id !== variantB.id || preferred.variantLabel !== "B") {
      throw new Error("Variant B was not persisted as the preferred variant");
    }

    if (forbiddenRequests.length > 0) {
      throw new Error(
        `A/B smoke called forbidden endpoints: ${forbiddenRequests.join(" | ")}`
      );
    }

    if (browserErrors.length > 0) {
      throw new Error(
        `Browser emitted page errors: ${browserErrors.join(" | ")}`
      );
    }

    console.log(
      JSON.stringify(
        {
          passed: true,
          temporaryCampaignId: tempCampaign.id,
          experimentId,
          variantAId: tempCampaign.id,
          variantBId: variantB.id,
          copiedAssets: variantB.assets.length,
          variantBStartedAsDraft: true,
          preferredVariant: "B",
          paidOrDeliveryEndpointsCalled: false,
          browserErrors,
        },
        null,
        2
      )
    );
  } finally {
    await browser.close();

    if (experimentId) {
      await prisma.campaign.deleteMany({
        where: {
          userId: source.userId,
          experimentId,
        },
      });
    } else {
      await prisma.campaign.deleteMany({
        where: { id: tempCampaign.id, userId: source.userId },
      });
    }

    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("CAMPAIGN_AB_SMOKE_FAILED", error);
  process.exitCode = 1;
});

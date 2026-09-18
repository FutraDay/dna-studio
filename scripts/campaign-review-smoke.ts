import "dotenv/config";
import fs from "node:fs";
import { Prisma } from "@prisma/client";
import { chromium } from "playwright";
import { encode } from "next-auth/jwt";
import { prisma } from "../src/lib/db";

type ConceptAsset = {
  platform?: string;
  caption?: string;
  [key: string]: unknown;
};

type CampaignConcept = {
  assets?: ConceptAsset[];
  [key: string]: unknown;
};

const baseUrl = process.env.CAMPAIGN_SMOKE_BASE_URL ?? "http://127.0.0.1:3000";
const brandQuery = process.env.CAMPAIGN_SMOKE_BRAND ?? "FutraDay";
const marker = " [Browser smoke verified]";

function conceptsFromJson(value: Prisma.JsonValue): CampaignConcept[] {
  if (!Array.isArray(value)) return [];
  return JSON.parse(JSON.stringify(value)) as CampaignConcept[];
}

async function restoreTemporaryEdit(
  campaignId: string,
  originalCaption: string
): Promise<void> {
  const current = await prisma.asset.findFirst({
    where: {
      campaignId,
      caption: { contains: marker.trim() },
    },
  });
  const storedCampaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { concepts: true },
  });

  const concepts = conceptsFromJson(storedCampaign?.concepts ?? []);
  let conceptChanged = false;
  for (const concept of concepts) {
    if (!Array.isArray(concept.assets)) continue;
    for (const asset of concept.assets) {
      if (asset.caption === originalCaption + marker) {
        asset.caption = originalCaption;
        conceptChanged = true;
      }
    }
  }

  const operations: Prisma.PrismaPromise<unknown>[] = [];
  if (current) {
    operations.push(
      prisma.asset.update({
        where: { id: current.id },
        data: { caption: originalCaption },
      })
    );
  }
  if (conceptChanged) {
    operations.push(
      prisma.campaign.update({
        where: { id: campaignId },
        data: { concepts: concepts as unknown as Prisma.InputJsonValue },
      })
    );
  }
  if (operations.length > 0) {
    await prisma.$transaction(operations);
  }
}

async function selectCampaign() {
  const explicitId = process.env.CAMPAIGN_SMOKE_ID;
  if (explicitId) {
    return prisma.campaign.findUnique({
      where: { id: explicitId },
      select: { id: true, userId: true },
    });
  }

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
    select: { id: true, userId: true },
  });
}

async function main() {
  const authSecret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
  if (!authSecret) {
    throw new Error("NextAuth secret is not configured");
  }

  const campaign = await selectCampaign();
  if (!campaign) {
    throw new Error(
      `No campaign found for ${process.env.CAMPAIGN_SMOKE_ID ?? brandQuery}`
    );
  }

  const token = await encode({
    secret: authSecret,
    token: { sub: campaign.userId },
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
  page.on("pageerror", (error) => browserErrors.push(error.message));

  let originalCaption = "";
  let restored = false;

  try {
    const response = await page.goto(
      `${baseUrl}/campaigns/${campaign.id}`,
      {
        waitUntil: "networkidle",
        timeout: 30_000,
      }
    );
    if (!response?.ok()) {
      throw new Error(
        `Campaign page failed with HTTP ${response?.status() ?? "unknown"}`
      );
    }

    await page.getByRole("heading", { name: "Campaign review" }).waitFor();

    const conceptCount = await page.locator('section[id^="concept-"]').count();
    if (conceptCount !== 5) {
      throw new Error(`Expected 5 concept sections, found ${conceptCount}`);
    }

    const allEditCount = await page.getByRole("button", { name: "Edit copy" }).count();
    if (allEditCount !== 20) {
      throw new Error(`Expected 20 editable posts, found ${allEditCount}`);
    }

    await page.getByRole("button", { name: /LinkedIn \(5\)/ }).click();
    await page.waitForTimeout(150);

    const visibleLinkedInCards = await page.getByText("linkedin", {
      exact: true,
    }).count();
    if (visibleLinkedInCards !== 5) {
      throw new Error(
        `LinkedIn filter expected 5 cards, found ${visibleLinkedInCards}`
      );
    }

    await page.getByRole("button", { name: "Edit copy" }).first().click();
    const textarea = page.locator("textarea").first();
    await textarea.waitFor();
    originalCaption = await textarea.inputValue();
    if (!originalCaption.trim()) {
      throw new Error("Original LinkedIn caption was empty");
    }

    await textarea.fill(originalCaption + marker);
    await page.getByRole("button", { name: "Save" }).first().click();
    await page.waitForFunction(
      (text) => document.body.innerText.includes(text),
      marker,
      { timeout: 10_000 }
    );

    await page.reload({ waitUntil: "networkidle" });
    if (!(await page.locator("body").innerText()).includes(marker)) {
      throw new Error("Edited caption did not persist after reload");
    }

    await page.getByRole("button", { name: /LinkedIn \(5\)/ }).click();
    await page.waitForTimeout(150);
    await page.getByRole("button", { name: "Edit copy" }).first().click();
    const restoreTextarea = page.locator("textarea").first();
    if (!(await restoreTextarea.inputValue()).endsWith(marker)) {
      throw new Error("Could not locate the edited LinkedIn post for rollback");
    }
    await restoreTextarea.fill(originalCaption);
    await page.getByRole("button", { name: "Save" }).first().click();

    await page.reload({ waitUntil: "networkidle" });
    if ((await page.locator("body").innerText()).includes(marker)) {
      throw new Error("Temporary browser smoke edit was not restored");
    }
    restored = true;

    await page.getByRole("button", { name: /All \(20\)/ }).click();
    await page.waitForTimeout(150);

    const postActions = page.getByRole("button", { name: "Post actions" }).first();
    await postActions.waitFor();
    await postActions.click();

    if ((await page.getByRole("button", { name: "Publish Now" }).count()) !== 1) {
      throw new Error("Publish Now control missing from post actions");
    }

    await page.getByRole("button", { name: "Schedule" }).click();
    const scheduleInput = page.locator('input[type="datetime-local"]').first();
    await scheduleInput.waitFor();

    const confirm = page.getByRole("button", { name: "Confirm" }).first();
    if (!(await confirm.isDisabled())) {
      throw new Error(
        "Schedule confirm should remain disabled until a date is chosen"
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
          campaignId: campaign.id,
          conceptSections: conceptCount,
          editablePosts: allEditCount,
          linkedInFilteredPosts: visibleLinkedInCards,
          editPersistedAfterReload: true,
          scheduleControlVerified: true,
          publishControlVerifiedWithoutPublishing: true,
          temporaryEditRestored: true,
          browserErrors,
        },
        null,
        2
      )
    );
  } finally {
    if (!restored && originalCaption) {
      await restoreTemporaryEdit(campaign.id, originalCaption);
    }
    await browser.close();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("CAMPAIGN_BROWSER_SMOKE_FAILED", error);
  process.exitCode = 1;
});

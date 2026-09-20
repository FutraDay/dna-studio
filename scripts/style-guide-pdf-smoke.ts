import "dotenv/config";
import fs from "node:fs";
import { chromium } from "playwright";
import { encode } from "next-auth/jwt";
import { prisma } from "../src/lib/db";

const baseUrl =
  process.env.CAMPAIGN_SMOKE_BASE_URL ?? "http://127.0.0.1:3000";
const brandQuery = process.env.CAMPAIGN_SMOKE_BRAND ?? "FutraDay";
const outputPath =
  process.env.STYLE_GUIDE_SMOKE_OUTPUT ?? ".tmp-style-guide-smoke.pdf";

async function main() {
  const authSecret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
  if (!authSecret) {
    throw new Error("NextAuth secret is not configured");
  }

  const brand = await prisma.brand.findFirst({
    where: {
      name: {
        contains: brandQuery,
        mode: "insensitive",
      },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      workspace: {
        select: {
          ownerId: true,
        },
      },
    },
  });

  if (!brand) {
    throw new Error(`No brand found for ${brandQuery}`);
  }

  const token = await encode({
    secret: authSecret,
    token: { sub: brand.workspace.ownerId },
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

  const context = await browser.newContext();

  await context.addCookies([
    {
      name: "next-auth.session-token",
      value: token,
      url: baseUrl,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  try {
    const page = await context.newPage();
    const brandPageResponse = await page.goto(
      `${baseUrl}/brands/${brand.id}`,
      {
        waitUntil: "networkidle",
        timeout: 30_000,
      }
    );

    if (!brandPageResponse?.ok()) {
      throw new Error(
        `Brand page failed with HTTP ${brandPageResponse?.status() ?? "unknown"}`
      );
    }

    const downloadLink = page.getByRole("link", {
      name: /download style guide pdf/i,
    });
    await downloadLink.waitFor();

    const href = await downloadLink.getAttribute("href");
    const expectedHref = `/api/brands/${brand.id}/style-guide`;
    if (href !== expectedHref) {
      throw new Error(
        `Style guide download link mismatch: expected ${expectedHref}, got ${href}`
      );
    }

    const response = await context.request.get(
      `${baseUrl}${expectedHref}`,
      { timeout: 30_000 }
    );

    if (!response.ok()) {
      throw new Error(
        `Style guide endpoint failed with HTTP ${response.status()}: ${await response.text()}`
      );
    }

    const contentType = response.headers()["content-type"] ?? "";
    const disposition = response.headers()["content-disposition"] ?? "";
    const bytes = await response.body();

    if (!contentType.includes("application/pdf")) {
      throw new Error(`Unexpected content type: ${contentType}`);
    }

    if (!disposition.includes("attachment;")) {
      throw new Error(`Missing attachment disposition: ${disposition}`);
    }

    if (bytes.subarray(0, 4).toString() !== "%PDF") {
      throw new Error("Style guide response does not contain a PDF header");
    }

    if (bytes.length < 10_000) {
      throw new Error(`Style guide PDF is unexpectedly small: ${bytes.length} bytes`);
    }

    fs.writeFileSync(outputPath, bytes);

    console.log(
      JSON.stringify(
        {
          passed: true,
          brandId: brand.id,
          brand: brand.name,
          bytes: bytes.length,
          contentType,
          disposition,
          downloadActionVisible: true,
          downloadActionHrefVerified: true,
          outputPath,
        },
        null,
        2
      )
    );
  } finally {
    await context.close();
    await browser.close();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("STYLE_GUIDE_PDF_SMOKE_FAILED", error);
  process.exitCode = 1;
});

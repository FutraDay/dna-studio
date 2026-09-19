import fs from "node:fs";
import { chromium } from "playwright";

export interface HtmlPdfOptions {
  format?: "A4" | "Letter";
  marginMm?: number;
}

function chromiumExecutable(): string | undefined {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ].filter((value): value is string => Boolean(value));

  return candidates.find((candidate) => fs.existsSync(candidate));
}

export async function renderHtmlToPdf(
  html: string,
  options: HtmlPdfOptions = {}
): Promise<Buffer> {
  const executablePath = chromiumExecutable();
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage({
      viewport: { width: 1240, height: 1754 },
    });

    // Style guides are self-contained. Blocking all external requests prevents
    // saved brand URLs from becoming an SSRF/network side channel.
    await page.route("**/*", async (route) => {
      const url = route.request().url();
      if (url === "about:blank" || url.startsWith("data:")) {
        await route.continue();
        return;
      }
      await route.abort();
    });

    await page.setContent(html, {
      waitUntil: "domcontentloaded",
      timeout: 15_000,
    });
    await page.emulateMedia({ media: "print" });
    await page.evaluate(async () => {
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
    });

    const margin = `${options.marginMm ?? 12}mm`;
    const pdf = await page.pdf({
      format: options.format ?? "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: margin,
        right: margin,
        bottom: margin,
        left: margin,
      },
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

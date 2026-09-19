import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const extensionDir = resolve(process.cwd(), "extensions/chrome");

function loadHelpers() {
  const source = readFileSync(resolve(extensionDir, "shared.js"), "utf8");
  const context: Record<string, unknown> = {
    URL,
  };

  vm.runInNewContext(source, context, {
    filename: "extensions/chrome/shared.js",
  });

  return context.DNAStudioExtension as {
    DEFAULT_APP_URL: string;
    buildAnalysisUrl: (appBaseUrl: string, pageUrl: string) => string;
    isAnalyzablePageUrl: (value: string) => boolean;
    isValidAppBaseUrl: (value: string) => boolean;
    normalizeAppBaseUrl: (value: string) => string;
  };
}

describe("DNA Studio Chrome extension", () => {
  it("uses a minimal Manifest V3 permission set", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(extensionDir, "manifest.json"), "utf8")
    );

    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toEqual([
      "activeTab",
      "storage",
      "contextMenus",
    ]);
    expect(manifest).not.toHaveProperty("host_permissions");
    expect(manifest.background.service_worker).toBe("background.js");
  });

  it("builds an auto-analysis URL without exposing credentials", () => {
    const helpers = loadHelpers();
    const target = new URL(
      helpers.buildAnalysisUrl(
        "http://localhost:3000/",
        "https://example.com/path?q=1"
      )
    );

    expect(target.origin).toBe("http://localhost:3000");
    expect(target.pathname).toBe("/brands/new");
    expect(target.searchParams.get("url")).toBe(
      "https://example.com/path?q=1"
    );
    expect(target.searchParams.get("autoAnalyze")).toBe("1");
    expect(target.search).not.toMatch(/token|secret|api[_-]?key/i);
  });

  it("does not forward Chrome-internal pages for analysis", () => {
    const helpers = loadHelpers();
    const target = new URL(
      helpers.buildAnalysisUrl(
        "http://localhost:3000",
        "chrome://extensions/"
      )
    );

    expect(target.pathname).toBe("/brands/new");
    expect(target.searchParams.has("url")).toBe(false);
    expect(target.searchParams.has("autoAnalyze")).toBe(false);
  });

  it("accepts local or hosted DNA Studio URLs and rejects unsafe schemes", () => {
    const helpers = loadHelpers();

    expect(helpers.isValidAppBaseUrl("http://localhost:3000")).toBe(true);
    expect(helpers.isValidAppBaseUrl("https://dna.example.com")).toBe(true);
    expect(helpers.isValidAppBaseUrl("javascript:alert(1)")).toBe(false);
    expect(helpers.normalizeAppBaseUrl("javascript:alert(1)")).toBe(
      helpers.DEFAULT_APP_URL
    );
  });
});

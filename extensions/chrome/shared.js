(() => {
  const DEFAULT_APP_URL = "http://localhost:3000";

  function isValidAppBaseUrl(value) {
    try {
      const parsed = new URL(String(value || "").trim());
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }

  function normalizeAppBaseUrl(value) {
    const candidate = isValidAppBaseUrl(value)
      ? String(value).trim()
      : DEFAULT_APP_URL;
    const parsed = new URL(candidate);

    parsed.hash = "";
    parsed.search = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");

    return parsed.toString().replace(/\/$/, "");
  }
  function isAnalyzablePageUrl(value) {
    try {
      const parsed = new URL(String(value || ""));
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }

  function buildAnalysisUrl(appBaseUrl, pageUrl) {
    const baseUrl = normalizeAppBaseUrl(appBaseUrl);
    const target = new URL(baseUrl + "/brands/new");

    if (isAnalyzablePageUrl(pageUrl)) {
      target.searchParams.set("url", pageUrl);
      target.searchParams.set("autoAnalyze", "1");
    }

    return target.toString();
  }

  globalThis.DNAStudioExtension = Object.freeze({
    DEFAULT_APP_URL,
    buildAnalysisUrl,
    isAnalyzablePageUrl,
    isValidAppBaseUrl,
    normalizeAppBaseUrl,
  });
})();

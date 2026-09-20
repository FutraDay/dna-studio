/* global chrome, importScripts */
importScripts("shared.js");

const {
  DEFAULT_APP_URL,
  buildAnalysisUrl,
  normalizeAppBaseUrl,
} = globalThis.DNAStudioExtension;

function getAppBaseUrl() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      { appBaseUrl: DEFAULT_APP_URL },
      ({ appBaseUrl }) => resolve(normalizeAppBaseUrl(appBaseUrl))
    );
  });
}

async function openAnalysis(tab) {
  const appBaseUrl = await getAppBaseUrl();
  const targetUrl = buildAnalysisUrl(appBaseUrl, tab?.url || "");
  await chrome.tabs.create({ url: targetUrl });
}

chrome.action.onClicked.addListener((tab) => {
  void openAnalysis(tab);
});
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get("appBaseUrl", ({ appBaseUrl }) => {
    if (!appBaseUrl) {
      chrome.storage.sync.set({ appBaseUrl: DEFAULT_APP_URL });
    }
  });

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "dna-studio-analyze",
      title: "Analyze this site with DNA Studio",
      contexts: ["page"],
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "dna-studio-analyze") {
    void openAnalysis(tab);
  }
});

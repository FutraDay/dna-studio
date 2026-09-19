/* global chrome */
const {
  DEFAULT_APP_URL,
  isValidAppBaseUrl,
  normalizeAppBaseUrl,
} = globalThis.DNAStudioExtension;

const form = document.getElementById("settings-form");
const input = document.getElementById("app-url");
const status = document.getElementById("status");
const openApp = document.getElementById("open-app");

function setStatus(message, kind = "") {
  status.textContent = message;
  status.dataset.kind = kind;
}

function applyUrl(value) {
  const normalized = normalizeAppBaseUrl(value);
  input.value = normalized;
  openApp.href = normalized;
}

chrome.storage.sync.get(
  { appBaseUrl: DEFAULT_APP_URL },
  ({ appBaseUrl }) => applyUrl(appBaseUrl)
);
form.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!isValidAppBaseUrl(input.value)) {
    setStatus("Enter a valid http:// or https:// DNA Studio URL.", "error");
    return;
  }

  const appBaseUrl = normalizeAppBaseUrl(input.value);
  chrome.storage.sync.set({ appBaseUrl }, () => {
    applyUrl(appBaseUrl);
    setStatus("Saved.", "success");
  });
});

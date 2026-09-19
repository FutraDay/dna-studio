import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  launch: vi.fn(),
  close: vi.fn(),
  newPage: vi.fn(),
  route: vi.fn(),
  setContent: vi.fn(),
  emulateMedia: vi.fn(),
  evaluate: vi.fn(),
  pdf: vi.fn(),
}));

vi.mock("node:fs", () => ({
  default: {
    existsSync: mocks.existsSync,
  },
}));

vi.mock("playwright", () => ({
  chromium: {
    launch: mocks.launch,
  },
}));

import { renderHtmlToPdf } from "@/lib/pdf/render-html";

const {
  existsSync,
  launch,
  close,
  newPage,
  route,
  setContent,
  emulateMedia,
  evaluate,
  pdf,
} = mocks;

type RouteHandler = (route: {
  request: () => { url: () => string };
  continue: () => Promise<void>;
  abort: () => Promise<void>;
}) => Promise<void>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();

  route.mockResolvedValue(undefined);
  setContent.mockResolvedValue(undefined);
  emulateMedia.mockResolvedValue(undefined);
  evaluate.mockResolvedValue(undefined);
  pdf.mockResolvedValue(Buffer.from("%PDF-test"));

  newPage.mockResolvedValue({
    route,
    setContent,
    emulateMedia,
    evaluate,
    pdf,
  });

  launch.mockResolvedValue({
    newPage,
    close,
  });

  close.mockResolvedValue(undefined);
  existsSync.mockReturnValue(false);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("renderHtmlToPdf", () => {
  it("uses an explicitly configured Chromium executable and custom PDF options", async () => {
    vi.stubEnv("PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH", "C:\\custom\\chrome.exe");
    existsSync.mockImplementation(
      (candidate: unknown) => candidate === "C:\\custom\\chrome.exe"
    );

    const output = await renderHtmlToPdf("<html>guide</html>", {
      format: "Letter",
      marginMm: 18,
    });

    expect(output.toString()).toBe("%PDF-test");
    expect(launch).toHaveBeenCalledWith({
      headless: true,
      executablePath: "C:\\custom\\chrome.exe",
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    expect(newPage).toHaveBeenCalledWith({
      viewport: { width: 1240, height: 1754 },
    });
    expect(setContent).toHaveBeenCalledWith("<html>guide</html>", {
      waitUntil: "domcontentloaded",
      timeout: 15_000,
    });
    expect(emulateMedia).toHaveBeenCalledWith({ media: "print" });
    expect(pdf).toHaveBeenCalledWith({
      format: "Letter",
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: "18mm",
        right: "18mm",
        bottom: "18mm",
        left: "18mm",
      },
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it("uses defaults and lets Playwright choose Chromium when no candidate exists", async () => {
    await renderHtmlToPdf("<html>defaults</html>");

    expect(launch).toHaveBeenCalledWith({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    expect(pdf).toHaveBeenCalledWith(
      expect.objectContaining({
        format: "A4",
        margin: {
          top: "12mm",
          right: "12mm",
          bottom: "12mm",
          left: "12mm",
        },
      })
    );
    expect(close).toHaveBeenCalledOnce();
  });

  it("continues only self-contained page requests and aborts external network requests", async () => {
    await renderHtmlToPdf("<html>network isolated</html>");

    const handler = route.mock.calls[0][1] as RouteHandler;

    const blankContinue = vi.fn().mockResolvedValue(undefined);
    const blankAbort = vi.fn().mockResolvedValue(undefined);
    await handler({
      request: () => ({ url: () => "about:blank" }),
      continue: blankContinue,
      abort: blankAbort,
    });
    expect(blankContinue).toHaveBeenCalledOnce();
    expect(blankAbort).not.toHaveBeenCalled();

    const dataContinue = vi.fn().mockResolvedValue(undefined);
    const dataAbort = vi.fn().mockResolvedValue(undefined);
    await handler({
      request: () => ({ url: () => "data:image/png;base64,AA==" }),
      continue: dataContinue,
      abort: dataAbort,
    });
    expect(dataContinue).toHaveBeenCalledOnce();
    expect(dataAbort).not.toHaveBeenCalled();

    const remoteContinue = vi.fn().mockResolvedValue(undefined);
    const remoteAbort = vi.fn().mockResolvedValue(undefined);
    await handler({
      request: () => ({ url: () => "https://example.com/logo.png" }),
      continue: remoteContinue,
      abort: remoteAbort,
    });
    expect(remoteAbort).toHaveBeenCalledOnce();
    expect(remoteContinue).not.toHaveBeenCalled();
  });

  it("always closes Chromium when PDF generation fails", async () => {
    pdf.mockRejectedValue(new Error("print failed"));

    await expect(
      renderHtmlToPdf("<html>broken</html>")
    ).rejects.toThrow("print failed");

    expect(close).toHaveBeenCalledOnce();
  });
});

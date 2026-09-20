import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    brand: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn(),
}));

vi.mock("@/lib/pdf/render-html", () => ({
  renderHtmlToPdf: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { renderHtmlToPdf } from "@/lib/pdf/render-html";
import { GET } from "@/app/api/brands/[id]/style-guide/route";
import { makeBrandDNA } from "../fixtures/brand-dna";

const brand = vi.mocked(prisma.brand);
const session = vi.mocked(requireSession);
const renderPdf = vi.mocked(renderHtmlToPdf);

const params = (id = "brand_1") => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  session.mockResolvedValue({
    user: { id: "user_1", email: "owner@example.com" },
  } as never);

  brand.findFirst.mockResolvedValue({
    id: "brand_1",
    name: "Acme Coffee",
    url: "https://acme.coffee",
    dna: makeBrandDNA(),
    workspace: {
      name: "Acme Team",
    },
  } as never);

  renderPdf.mockResolvedValue(
    Buffer.from("%PDF-1.7\nDNA Studio style guide") as never
  );
});

describe("GET /api/brands/[id]/style-guide", () => {
  it("returns a downloadable PDF for a workspace-accessible brand", async () => {
    const response = await GET(
      new Request("http://localhost/api/brands/brand_1/style-guide"),
      params()
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="Acme-Coffee-style-guide.pdf"'
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");

    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.subarray(0, 4).toString()).toBe("%PDF");

    expect(brand.findFirst).toHaveBeenCalledWith({
      where: {
        id: "brand_1",
        workspace: {
          members: {
            some: { userId: "user_1" },
          },
        },
      },
      select: {
        id: true,
        name: true,
        url: true,
        dna: true,
        workspace: {
          select: {
            name: true,
          },
        },
      },
    });

    expect(renderPdf).toHaveBeenCalledWith(
      expect.stringContaining("Acme Coffee"),
      {
        format: "A4",
        marginMm: 12,
      }
    );
  });

  it("returns 404 without rendering for an inaccessible brand", async () => {
    brand.findFirst.mockResolvedValue(null as never);

    const response = await GET(
      new Request("http://localhost/api/brands/other/style-guide"),
      params("other")
    );

    expect(response.status).toBe(404);
    expect(renderPdf).not.toHaveBeenCalled();
  });

  it("returns 422 when stored Brand DNA is unavailable", async () => {
    brand.findFirst.mockResolvedValue({
      id: "brand_1",
      name: "Acme Coffee",
      url: "https://acme.coffee",
      dna: null,
      workspace: { name: "Acme Team" },
    } as never);

    const response = await GET(
      new Request("http://localhost/api/brands/brand_1/style-guide"),
      params()
    );

    expect(response.status).toBe(422);
    expect(renderPdf).not.toHaveBeenCalled();
  });

  it("answers 401 when signed out", async () => {
    session.mockRejectedValue(new Error("Unauthorized"));

    const response = await GET(
      new Request("http://localhost/api/brands/brand_1/style-guide"),
      params()
    );

    expect(response.status).toBe(401);
    expect(brand.findFirst).not.toHaveBeenCalled();
  });

  it("returns a generic 500 if PDF rendering fails", async () => {
    renderPdf.mockRejectedValue(new Error("chromium exploded"));

    const response = await GET(
      new Request("http://localhost/api/brands/brand_1/style-guide"),
      params()
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Style guide export failed",
    });
  });
});

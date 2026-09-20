import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mobileToken = vi.hoisted(() => ({
  create: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: { mobileToken },
}));

import {
  getMobileBearerToken,
  hashMobileToken,
  issueMobileToken,
  requireMobileUser,
  revokeMobileToken,
} from "@/lib/mobile/auth";

const request = (authorization?: string) =>
  new Request("http://localhost/api/mobile/overview", {
    headers: authorization ? { authorization } : undefined,
  });

beforeEach(() => {
  vi.clearAllMocks();
  mobileToken.create.mockResolvedValue({} as never);
  mobileToken.deleteMany.mockResolvedValue({ count: 1 } as never);
  mobileToken.update.mockResolvedValue({} as never);
});

describe("mobile auth", () => {
  it("hashes tokens with sha256", () => {
    const token = "dna_mob_example_token_that_is_long_enough";
    expect(hashMobileToken(token)).toBe(
      createHash("sha256").update(token).digest("hex")
    );
  });  it("accepts only DNA Studio bearer tokens", () => {
    expect(
      getMobileBearerToken(
        request("Bearer dna_mob_abcdefghijklmnopqrstuvwxyz123456")
      )
    ).toBe("dna_mob_abcdefghijklmnopqrstuvwxyz123456");
    expect(getMobileBearerToken(request("Basic abc"))).toBeNull();
    expect(getMobileBearerToken(request("Bearer other_token"))).toBeNull();
    expect(getMobileBearerToken(request())).toBeNull();
  });

  it("stores only a hash when issuing a token", async () => {
    const issued = await issueMobileToken("user_1", "Eric phone");

    expect(issued.token).toMatch(/^dna_mob_/);
    expect(issued.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(mobileToken.create).toHaveBeenCalledOnce();

    const data = mobileToken.create.mock.calls[0][0].data;
    expect(data.userId).toBe("user_1");
    expect(data.deviceName).toBe("Eric phone");
    expect(data.tokenHash).toBe(hashMobileToken(issued.token));
    expect(JSON.stringify(data)).not.toContain(issued.token);
  });

  it("rejects requests without a bearer token", async () => {
    await expect(requireMobileUser(request())).rejects.toThrow("Unauthorized");
    expect(mobileToken.findUnique).not.toHaveBeenCalled();
  });  it("rejects unknown bearer tokens", async () => {
    mobileToken.findUnique.mockResolvedValue(null);

    await expect(
      requireMobileUser(
        request("Bearer dna_mob_abcdefghijklmnopqrstuvwxyz123456")
      )
    ).rejects.toThrow("Unauthorized");
  });

  it("removes and rejects expired bearer tokens", async () => {
    mobileToken.findUnique.mockResolvedValue({
      id: "token_1",
      expiresAt: new Date(Date.now() - 1000),
      user: { id: "user_1", email: "e@example.com" },
    });

    await expect(
      requireMobileUser(
        request("Bearer dna_mob_abcdefghijklmnopqrstuvwxyz123456")
      )
    ).rejects.toThrow("Unauthorized");

    expect(mobileToken.deleteMany).toHaveBeenCalledOnce();
    expect(mobileToken.update).not.toHaveBeenCalled();
  });

  it("returns the user and records last use for a valid token", async () => {
    const user = {
      id: "user_1",
      email: "e@example.com",
      name: "Eric",
      image: null,
    };
    mobileToken.findUnique.mockResolvedValue({
      id: "token_1",
      expiresAt: new Date(Date.now() + 60_000),
      user,
    });

    await expect(
      requireMobileUser(
        request("Bearer dna_mob_abcdefghijklmnopqrstuvwxyz123456")
      )
    ).resolves.toEqual({ tokenId: "token_1", user });

    expect(mobileToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "token_1" } })
    );
  });  it("revokes a bearer token by its hash", async () => {
    const raw = "dna_mob_abcdefghijklmnopqrstuvwxyz123456";

    await expect(revokeMobileToken(request("Bearer " + raw))).resolves.toBe(
      true
    );
    expect(mobileToken.deleteMany).toHaveBeenCalledWith({
      where: { tokenHash: hashMobileToken(raw) },
    });
  });

  it("treats missing logout credentials as an idempotent no-op", async () => {
    await expect(revokeMobileToken(request())).resolves.toBe(false);
    expect(mobileToken.deleteMany).not.toHaveBeenCalled();
  });
});

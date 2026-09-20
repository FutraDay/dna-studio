import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";

const MOBILE_TOKEN_PREFIX = "dna_mob_";
const MOBILE_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export function hashMobileToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function getMobileBearerToken(request: Request) {
  const authorization = request.headers.get("authorization")?.trim();
  if (!authorization?.toLowerCase().startsWith("bearer ")) return null;

  const token = authorization.slice(7).trim();
  if (!token.startsWith(MOBILE_TOKEN_PREFIX) || token.length < 32) return null;
  return token;
}

export async function issueMobileToken(
  userId: string,
  deviceName?: string | null
) {
  const token = MOBILE_TOKEN_PREFIX + randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + MOBILE_TOKEN_TTL_MS);

  await prisma.mobileToken.create({
    data: {
      userId,
      tokenHash: hashMobileToken(token),
      deviceName: deviceName?.trim().slice(0, 100) || null,
      expiresAt,
    },
  });

  return { token, expiresAt };
}

export async function requireMobileUser(request: Request) {
  const token = getMobileBearerToken(request);
  if (!token) throw new Error("Unauthorized");

  const tokenHash = hashMobileToken(token);
  const record = await prisma.mobileToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      expiresAt: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
        },
      },
    },
  });

  if (!record) throw new Error("Unauthorized");

  if (record.expiresAt <= new Date()) {
    await prisma.mobileToken.deleteMany({ where: { tokenHash } });
    throw new Error("Unauthorized");
  }

  await prisma.mobileToken.update({
    where: { id: record.id },
    data: { lastUsedAt: new Date() },
  });

  return { tokenId: record.id, user: record.user };
}

export async function revokeMobileToken(request: Request) {
  const token = getMobileBearerToken(request);
  if (!token) return false;

  const result = await prisma.mobileToken.deleteMany({
    where: { tokenHash: hashMobileToken(token) },
  });

  return result.count > 0;
}

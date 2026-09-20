-- CreateTable
CREATE TABLE "MobileToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "deviceName" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MobileToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MobileToken_tokenHash_key" ON "MobileToken"("tokenHash");
CREATE INDEX "MobileToken_userId_idx" ON "MobileToken"("userId");
CREATE INDEX "MobileToken_expiresAt_idx" ON "MobileToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "MobileToken"
ADD CONSTRAINT "MobileToken_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Asset"
  ADD COLUMN "providerPostId" TEXT;

CREATE INDEX "Asset_providerPostId_idx"
  ON "Asset"("providerPostId");

CREATE TABLE "PostMetricSnapshot" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'provider',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostMetricSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PostMetricSnapshot_assetId_fetchedAt_idx"
  ON "PostMetricSnapshot"("assetId", "fetchedAt");

ALTER TABLE "PostMetricSnapshot"
  ADD CONSTRAINT "PostMetricSnapshot_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "Asset"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

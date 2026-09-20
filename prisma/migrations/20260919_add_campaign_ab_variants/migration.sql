ALTER TABLE "Campaign"
  ADD COLUMN "experimentId" TEXT,
  ADD COLUMN "variantLabel" TEXT,
  ADD COLUMN "isPreferredVariant" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Campaign_userId_experimentId_idx"
  ON "Campaign"("userId", "experimentId");

CREATE UNIQUE INDEX "Campaign_userId_experimentId_variantLabel_key"
  ON "Campaign"("userId", "experimentId", "variantLabel");
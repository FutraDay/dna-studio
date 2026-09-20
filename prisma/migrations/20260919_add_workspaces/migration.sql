CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkspaceMember" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Brand"
  ADD COLUMN "workspaceId" TEXT;

INSERT INTO "Workspace" ("id", "name", "ownerId", "createdAt", "updatedAt")
SELECT
  'legacy_ws_' || md5("id"),
  COALESCE(NULLIF(BTRIM("name"), ''), NULLIF(split_part("email", '@', 1), ''), 'Personal') || ' Workspace',
  "id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User";

INSERT INTO "WorkspaceMember" ("id", "workspaceId", "userId", "role", "createdAt")
SELECT
  'legacy_wm_' || md5("id"),
  'legacy_ws_' || md5("id"),
  "id",
  'owner',
  CURRENT_TIMESTAMP
FROM "User";

UPDATE "Brand"
SET "workspaceId" = 'legacy_ws_' || md5("userId");

ALTER TABLE "Brand"
  ALTER COLUMN "workspaceId" SET NOT NULL;

CREATE INDEX "Workspace_ownerId_idx"
  ON "Workspace"("ownerId");

CREATE UNIQUE INDEX "WorkspaceMember_workspaceId_userId_key"
  ON "WorkspaceMember"("workspaceId", "userId");

CREATE INDEX "WorkspaceMember_userId_idx"
  ON "WorkspaceMember"("userId");

CREATE INDEX "Brand_workspaceId_idx"
  ON "Brand"("workspaceId");

ALTER TABLE "Workspace"
  ADD CONSTRAINT "Workspace_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceMember"
  ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceMember"
  ADD CONSTRAINT "WorkspaceMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Brand"
  ADD CONSTRAINT "Brand_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX "Campaign_userId_experimentId_variantLabel_key";

CREATE UNIQUE INDEX "Campaign_experimentId_variantLabel_key"
  ON "Campaign"("experimentId", "variantLabel");

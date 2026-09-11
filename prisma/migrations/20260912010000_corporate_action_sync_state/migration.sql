CREATE TABLE "CorporateActionSyncRun" (
    "id" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "CorporateActionSyncRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CorporateActionSyncAsset" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "CorporateActionSyncAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CorporateActionSyncAsset_runId_assetId_key" ON "CorporateActionSyncAsset"("runId", "assetId");
CREATE INDEX "CorporateActionSyncRun_market_status_createdAt_idx" ON "CorporateActionSyncRun"("market", "status", "createdAt");
CREATE INDEX "CorporateActionSyncAsset_runId_status_idx" ON "CorporateActionSyncAsset"("runId", "status");
ALTER TABLE "CorporateActionSyncAsset" ADD CONSTRAINT "CorporateActionSyncAsset_runId_fkey" FOREIGN KEY ("runId") REFERENCES "CorporateActionSyncRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CorporateActionSyncAsset" ADD CONSTRAINT "CorporateActionSyncAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

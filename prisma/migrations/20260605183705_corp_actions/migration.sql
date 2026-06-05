-- CreateTable
CREATE TABLE "CorporateAction" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "exDate" TIMESTAMP(3) NOT NULL,
    "ratio" DECIMAL(65,30) NOT NULL,
    "source" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "beforePrice" DECIMAL(65,30),
    "afterPrice" DECIMAL(65,30),

    CONSTRAINT "CorporateAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorporateActionApplication" (
    "id" TEXT NOT NULL,
    "corporateActionId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorporateActionApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CorporateAction_assetId_exDate_idx" ON "CorporateAction"("assetId", "exDate");

-- CreateIndex
CREATE UNIQUE INDEX "CorporateAction_assetId_exDate_type_source_key" ON "CorporateAction"("assetId", "exDate", "type", "source");

-- CreateIndex
CREATE INDEX "CorporateActionApplication_accountId_idx" ON "CorporateActionApplication"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "CorporateActionApplication_corporateActionId_accountId_key" ON "CorporateActionApplication"("corporateActionId", "accountId");

-- AddForeignKey
ALTER TABLE "CorporateAction" ADD CONSTRAINT "CorporateAction_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorporateActionApplication" ADD CONSTRAINT "CorporateActionApplication_corporateActionId_fkey" FOREIGN KEY ("corporateActionId") REFERENCES "CorporateAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorporateActionApplication" ADD CONSTRAINT "CorporateActionApplication_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

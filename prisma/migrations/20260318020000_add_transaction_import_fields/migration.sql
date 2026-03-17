-- AlterTable
ALTER TABLE "Account"
ADD COLUMN "broker" TEXT;

-- AlterTable
ALTER TABLE "Transaction"
ADD COLUMN "brokerOrderNo" TEXT,
ADD COLUMN "tax" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "AssetAlias" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "broker" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "AssetAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_accountId_brokerOrderNo_key" ON "Transaction"("accountId", "brokerOrderNo");

-- CreateIndex
CREATE UNIQUE INDEX "AssetAlias_alias_broker_key" ON "AssetAlias"("alias", "broker");

-- CreateIndex
CREATE INDEX "AssetAlias_assetId_idx" ON "AssetAlias"("assetId");

-- AddForeignKey
ALTER TABLE "AssetAlias"
ADD CONSTRAINT "AssetAlias_assetId_fkey"
FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

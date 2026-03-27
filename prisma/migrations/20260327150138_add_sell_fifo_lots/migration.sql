-- CreateTable
CREATE TABLE "PositionLot" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "sourceTransactionId" TEXT NOT NULL,
    "originalQuantity" DECIMAL(65,30) NOT NULL,
    "remainingQuantity" DECIMAL(65,30) NOT NULL,
    "unitCost" DECIMAL(65,30) NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "PositionLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellLotMatch" (
    "id" TEXT NOT NULL,
    "sellTransactionId" TEXT NOT NULL,
    "buyLotId" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "unitCost" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "SellLotMatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PositionLot_accountId_assetId_openedAt_idx" ON "PositionLot"("accountId", "assetId", "openedAt");

-- CreateIndex
CREATE INDEX "PositionLot_accountId_assetId_closedAt_idx" ON "PositionLot"("accountId", "assetId", "closedAt");

-- CreateIndex
CREATE INDEX "PositionLot_sourceTransactionId_idx" ON "PositionLot"("sourceTransactionId");

-- CreateIndex
CREATE INDEX "SellLotMatch_sellTransactionId_idx" ON "SellLotMatch"("sellTransactionId");

-- CreateIndex
CREATE INDEX "SellLotMatch_buyLotId_idx" ON "SellLotMatch"("buyLotId");

-- AddForeignKey
ALTER TABLE "PositionLot" ADD CONSTRAINT "PositionLot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionLot" ADD CONSTRAINT "PositionLot_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionLot" ADD CONSTRAINT "PositionLot_sourceTransactionId_fkey" FOREIGN KEY ("sourceTransactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellLotMatch" ADD CONSTRAINT "SellLotMatch_sellTransactionId_fkey" FOREIGN KEY ("sellTransactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellLotMatch" ADD CONSTRAINT "SellLotMatch_buyLotId_fkey" FOREIGN KEY ("buyLotId") REFERENCES "PositionLot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

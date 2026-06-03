-- AlterTable
ALTER TABLE "Price" ADD COLUMN     "open" DECIMAL(65,30),
ADD COLUMN     "high" DECIMAL(65,30),
ADD COLUMN     "low" DECIMAL(65,30),
ADD COLUMN     "volume" DECIMAL(65,30),
ADD COLUMN     "turnoverAmount" DECIMAL(65,30),
ADD COLUMN     "changeRate" DECIMAL(65,30),
ADD COLUMN     "tradeCount" DECIMAL(65,30),
ADD COLUMN     "adjClose" DECIMAL(65,30);

-- CreateIndex
CREATE UNIQUE INDEX "Price_assetId_asOf_key" ON "Price"("assetId", "asOf");

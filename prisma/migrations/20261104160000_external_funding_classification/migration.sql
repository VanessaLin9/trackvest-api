-- Existing deposit/withdraw rows stay unknown. This does not reclassify them as external principal.
CREATE TYPE "CashflowOrigin" AS ENUM ('unknown', 'external', 'internal');

ALTER TABLE "Transaction" ADD COLUMN "cashflowOrigin" "CashflowOrigin" NOT NULL DEFAULT 'unknown';
ALTER TABLE "Transaction" ADD COLUMN "transferGroupId" TEXT;

CREATE INDEX "Transaction_transferGroupId_idx" ON "Transaction"("transferGroupId");

CREATE TABLE "ExternalFundingCoverage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currency" "Currency" NOT NULL,
    "year" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalFundingCoverage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExternalFundingCoverage_userId_currency_year_key" ON "ExternalFundingCoverage"("userId", "currency", "year");

ALTER TABLE "ExternalFundingCoverage" ADD CONSTRAINT "ExternalFundingCoverage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

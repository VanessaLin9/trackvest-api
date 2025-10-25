-- CreateEnum
CREATE TYPE "GlAccountType" AS ENUM ('asset', 'liability', 'equity', 'income', 'expense');

-- CreateEnum
CREATE TYPE "GlSide" AS ENUM ('debit', 'credit');

-- CreateTable
CREATE TABLE "GlAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "type" "GlAccountType" NOT NULL,
    "currency" "Currency",
    "linkedAccountId" TEXT,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "GlAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "memo" TEXT,
    "source" TEXT,
    "refTxId" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "GlEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlLine" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "glAccountId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "side" "GlSide" NOT NULL,
    "currency" "Currency" NOT NULL,
    "note" TEXT,

    CONSTRAINT "GlLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GlAccount_userId_type_idx" ON "GlAccount"("userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "GlAccount_userId_name_key" ON "GlAccount"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "GlAccount_linkedAccountId_key" ON "GlAccount"("linkedAccountId");

-- CreateIndex
CREATE INDEX "GlEntry_userId_date_idx" ON "GlEntry"("userId", "date");

-- CreateIndex
CREATE INDEX "GlEntry_refTxId_idx" ON "GlEntry"("refTxId");

-- CreateIndex
CREATE INDEX "GlLine_entryId_idx" ON "GlLine"("entryId");

-- CreateIndex
CREATE INDEX "GlLine_glAccountId_idx" ON "GlLine"("glAccountId");

-- CreateIndex
CREATE INDEX "GlLine_glAccountId_currency_idx" ON "GlLine"("glAccountId", "currency");

-- AddForeignKey
ALTER TABLE "GlAccount" ADD CONSTRAINT "GlAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlAccount" ADD CONSTRAINT "GlAccount_linkedAccountId_fkey" FOREIGN KEY ("linkedAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlEntry" ADD CONSTRAINT "GlEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlLine" ADD CONSTRAINT "GlLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "GlEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlLine" ADD CONSTRAINT "GlLine_glAccountId_fkey" FOREIGN KEY ("glAccountId") REFERENCES "GlAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

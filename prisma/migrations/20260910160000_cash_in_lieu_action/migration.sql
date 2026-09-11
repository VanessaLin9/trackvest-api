ALTER TABLE "Transaction" ADD COLUMN "cashInLieuActionId" TEXT;
CREATE UNIQUE INDEX "Transaction_accountId_cashInLieuActionId_key"
ON "Transaction"("accountId", "cashInLieuActionId");
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_cashInLieuActionId_fkey"
FOREIGN KEY ("cashInLieuActionId") REFERENCES "CorporateAction"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

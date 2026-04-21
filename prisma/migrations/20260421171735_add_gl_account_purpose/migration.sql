-- CreateEnum
CREATE TYPE "GlAccountPurpose" AS ENUM (
  'investment_bucket',
  'equity_contribution',
  'fee_expense',
  'dividend_income',
  'realized_gain_income',
  'realized_loss_expense'
);

-- AlterTable
ALTER TABLE "GlAccount" ADD COLUMN "purpose" "GlAccountPurpose";

-- CreateIndex
CREATE INDEX "GlAccount_userId_purpose_idx" ON "GlAccount"("userId", "purpose");

-- Backfill purpose from existing Chinese naming conventions used by seed
-- and production data. Custom user-defined accounts (e.g. 餐飲/交通) stay NULL.

-- investment_bucket: 資產類且非 linked cash、名稱含「投資」
UPDATE "GlAccount"
SET "purpose" = 'investment_bucket'
WHERE "type" = 'asset'
  AND "linkedAccountId" IS NULL
  AND "name" LIKE '%投資%';

-- equity_contribution: 權益類且名稱含「權益」
UPDATE "GlAccount"
SET "purpose" = 'equity_contribution'
WHERE "type" = 'equity'
  AND "name" LIKE '%權益%';

-- realized_gain_income: 收入類且名稱含「已實現損益-收益」
UPDATE "GlAccount"
SET "purpose" = 'realized_gain_income'
WHERE "type" = 'income'
  AND "name" LIKE '%已實現損益-收益%';

-- realized_loss_expense: 費用類且名稱含「已實現損益-損失」
UPDATE "GlAccount"
SET "purpose" = 'realized_loss_expense'
WHERE "type" = 'expense'
  AND "name" LIKE '%已實現損益-損失%';

-- dividend_income: 收入類且名稱含「股利」
UPDATE "GlAccount"
SET "purpose" = 'dividend_income'
WHERE "type" = 'income'
  AND "name" LIKE '%股利%';

-- fee_expense: 費用類且名稱含「手續費」
UPDATE "GlAccount"
SET "purpose" = 'fee_expense'
WHERE "type" = 'expense'
  AND "name" LIKE '%手續費%';

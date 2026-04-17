CREATE TYPE "AssetClass" AS ENUM ('equity', 'bond', 'cash', 'crypto', 'precious_metal');

ALTER TABLE "Asset" ADD COLUMN "assetClass" "AssetClass";

UPDATE "Asset"
SET "assetClass" = CASE
  WHEN "type" = 'equity' THEN 'equity'::"AssetClass"
  WHEN "type" = 'crypto' THEN 'crypto'::"AssetClass"
  WHEN "type" = 'cash' THEN 'cash'::"AssetClass"
  WHEN "type" = 'etf' AND ("symbol" IN ('SGOV', 'BNDW') OR "name" ILIKE '%bond%') THEN 'bond'::"AssetClass"
  WHEN "type" = 'etf' AND ("name" ILIKE '%gold%' OR "name" ILIKE '%silver%' OR "name" ILIKE '%precious%') THEN 'precious_metal'::"AssetClass"
  WHEN "type" = 'etf' THEN 'equity'::"AssetClass"
  ELSE 'equity'::"AssetClass"
END;

ALTER TABLE "Asset" ALTER COLUMN "assetClass" SET NOT NULL;

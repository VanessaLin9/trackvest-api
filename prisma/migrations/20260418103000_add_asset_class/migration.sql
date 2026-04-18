CREATE TYPE "AssetClass" AS ENUM ('equity', 'bond', 'cash', 'crypto', 'precious_metal');

ALTER TABLE "Asset" ADD COLUMN "assetClass" "AssetClass";

UPDATE "Asset"
SET "assetClass" = CASE
  WHEN "type" = 'equity' THEN 'equity'::"AssetClass"
  WHEN "type" = 'crypto' THEN 'crypto'::"AssetClass"
  WHEN "type" = 'cash' THEN 'cash'::"AssetClass"
  WHEN "type" = 'etf' AND "symbol" IN ('0050', '006208') THEN 'equity'::"AssetClass"
  WHEN "type" = 'etf' AND ("symbol" IN ('SGOV', 'BNDW') OR "name" ILIKE '%bond%') THEN 'bond'::"AssetClass"
  WHEN "type" = 'etf' AND ("name" ILIKE '%gold%' OR "name" ILIKE '%silver%' OR "name" ILIKE '%precious%') THEN 'precious_metal'::"AssetClass"
END;

DO $$
DECLARE
  unresolved_assets TEXT;
BEGIN
  SELECT string_agg(format('%s (%s)', "symbol", "name"), ', ' ORDER BY "symbol")
  INTO unresolved_assets
  FROM "Asset"
  WHERE "assetClass" IS NULL;

  IF unresolved_assets IS NOT NULL THEN
    RAISE EXCEPTION
      'AssetClass backfill requires manual classification for existing assets: %',
      unresolved_assets;
  END IF;
END $$;

ALTER TABLE "Asset" ALTER COLUMN "assetClass" SET NOT NULL;

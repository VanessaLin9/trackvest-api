DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Account" WHERE "id" = 'bank-twd')
     AND NOT EXISTS (
       SELECT 1 FROM "Account" WHERE "id" = '497f9b9a-7788-4fb5-93a2-4c8d3f0d5e01'
     ) THEN
    UPDATE "Account"
    SET "id" = '497f9b9a-7788-4fb5-93a2-4c8d3f0d5e01'
    WHERE "id" = 'bank-twd';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Account" WHERE "id" = 'broker-twd')
     AND NOT EXISTS (
       SELECT 1 FROM "Account" WHERE "id" = 'f0a6c5d2-4f9d-4d4d-b7fb-3c5ef0ddc201'
     ) THEN
    UPDATE "Account"
    SET "id" = 'f0a6c5d2-4f9d-4d4d-b7fb-3c5ef0ddc201'
    WHERE "id" = 'broker-twd';
  END IF;
END $$;

UPDATE "Account"
SET "broker" = 'cathay'
WHERE "id" = 'f0a6c5d2-4f9d-4d4d-b7fb-3c5ef0ddc201'
  AND "type" = 'broker'
  AND ("broker" IS NULL OR "broker" = '');

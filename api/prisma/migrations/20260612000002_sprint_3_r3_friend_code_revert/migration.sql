-- Sprint 3 R3: friendTag → friendCode (A modeline geri dönüş; gizli 8-char base32 anahtar)

-- friendCode sütunu ekle (önce nullable)
ALTER TABLE "User" ADD COLUMN "friendCode" TEXT;

-- Backfill: mevcut kullanıcılara benzersiz 8-char base32 kod (charset: ABCDEFGHJKLMNPQRSTUVWXYZ23456789)
DO $$
DECLARE
  charset TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code TEXT;
  uid TEXT;
BEGIN
  FOR uid IN SELECT id FROM "User" LOOP
    LOOP
      code := '';
      FOR i IN 1..8 LOOP
        code := code || substr(charset, floor(random() * 32)::int + 1, 1);
      END LOOP;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM "User" WHERE "friendCode" = code);
    END LOOP;
    UPDATE "User" SET "friendCode" = code WHERE id = uid;
  END LOOP;
END $$;

-- NOT NULL yap
ALTER TABLE "User" ALTER COLUMN "friendCode" SET NOT NULL;

-- UNIQUE constraint ekle
ALTER TABLE "User" ADD CONSTRAINT "User_friendCode_key" UNIQUE ("friendCode");

-- Eski friendTag sütununu kaldır
ALTER TABLE "User" DROP COLUMN "friendTag";

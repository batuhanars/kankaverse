-- Sprint 3 R1: friendCode → friendTag (rumuz#etiket modeli)

-- friendTag sütunu ekle (önce nullable)
ALTER TABLE "User" ADD COLUMN "friendTag" TEXT;

-- Backfill: mevcut kullanıcılara rastgele 4 haneli etiket
UPDATE "User" SET "friendTag" = LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');

-- NOT NULL yap
ALTER TABLE "User" ALTER COLUMN "friendTag" SET NOT NULL;

-- Eski friendCode unique index ve sütunu kaldır
DROP INDEX "User_friendCode_key";
ALTER TABLE "User" DROP COLUMN "friendCode";

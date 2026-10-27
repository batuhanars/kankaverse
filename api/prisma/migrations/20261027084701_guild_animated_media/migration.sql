-- AlterTable
ALTER TABLE "Guild" ADD COLUMN     "bannerAnimatedUrl" TEXT,
ADD COLUMN     "iconAnimatedUrl" TEXT;

-- Veri onarimi (C19 s2.5): D14 donemi ham GIF simgeler mobil ray'i cokertiyordu; simge yeniden yuklenecek.
UPDATE "Guild" SET "iconUrl" = NULL WHERE "iconUrl" ILIKE '%.gif';

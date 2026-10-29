-- C31c: oyun simgesi kenar kirpmasi icin mevcut simgeler yeniden uretilir (iconUrl null -> tembel/acilis doldurma)
UPDATE "Game" SET "iconUrl" = NULL WHERE "iconUrl" IS NOT NULL;

-- Ortam "rules" kolonu "description" olarak yeniden adlandırıldı.
-- RENAME COLUMN: mevcut canlı veri KORUNUR (drop+add veri kaybına yol açardı).
ALTER TABLE "Guild" RENAME COLUMN "rules" TO "description";

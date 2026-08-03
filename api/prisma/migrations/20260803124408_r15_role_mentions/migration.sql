-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "mentionRoles" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "NotificationPref" ADD COLUMN     "suppressRoleMentions" BOOLEAN NOT NULL DEFAULT false;

-- ─── R15 §2.3 — GÖÇ TELAFİSİ (davranış değişikliği önleyici) ──────────────────
-- `MENTION_EVERYONE` izni bugüne kadar ÖLÜ bir bayraktı: iki istemcinin rol ayarları ekranında
-- gösteriliyor ve kaydediliyordu ama backend hiçbir yerde okumuyordu. @everyone'ın tek kapısı
-- everyone rolünün `mentionable` anahtarıydı.
--
-- R15 izni gerçekten uygulamaya başlıyor. Hiçbir şey yapılmazsa, everyone rolü `mentionable: true`
-- olan ortamlarda BUGÜN @everyone yazabilen sıradan üyeler yarın yazamaz hâle gelirdi — kimsenin
-- istemediği sessiz bir kısıtlama. Bu UPDATE o ortamların everyone rolüne izni ekleyerek bugünkü
-- davranışı aynen korur; sahibi kısmak isterse izni ELLE alır (artık alabiliyor olması zaten
-- sprintin amacı).
--
-- `mentionable = false` olan ortamlara DOKUNULMAZ: orada zaten kimse @everyone yazamıyordu,
-- izin eklemek yeni bir yetenek açmak olurdu.
-- Idempotent: izin zaten varsa satır eşleşmez (NOT @> kontrolü).
UPDATE "Role"
SET "permissions" = array_append("permissions", 'MENTION_EVERYONE')
WHERE "isEveryone" = true
  AND "mentionable" = true
  AND NOT ("permissions" @> ARRAY['MENTION_EVERYONE']);

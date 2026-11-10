-- E1 acil geri alma (sözleşme §6.4). Bayrak KAPATILDIKTAN sonra çalışır: şifreli DM'leri şifresiz hale döndürür.
-- Cihaz ve ön anahtar kayıtlarına DOKUNMAZ (bayrak kapalıyken etkisiz; yeniden açılışta istemci bayat grubu
-- kendisi düşer, Rev.6). Şifreli mesajlar SİLİNMEZ, yumuşak silinir (deletedAt): geri getirilebilir.
BEGIN;
SELECT 'once' AS an, (SELECT count(*) FROM "E2eeGroup") AS grup, (SELECT count(*) FROM "E2eeHandshake") AS commit,
       (SELECT count(*) FROM "E2eeWelcome") AS davet,
       (SELECT count(*) FROM "Message" WHERE encrypted AND "deletedAt" IS NULL) AS sifreli_mesaj;
UPDATE "Message" SET "deletedAt" = now() WHERE encrypted AND "deletedAt" IS NULL;
DELETE FROM "E2eeWelcome";
DELETE FROM "E2eeHandshake";
DELETE FROM "E2eeGroup";
SELECT 'sonra' AS an, (SELECT count(*) FROM "E2eeGroup") AS grup, (SELECT count(*) FROM "E2eeHandshake") AS commit,
       (SELECT count(*) FROM "E2eeWelcome") AS davet,
       (SELECT count(*) FROM "Message" WHERE encrypted AND "deletedAt" IS NULL) AS sifreli_mesaj;
COMMIT;

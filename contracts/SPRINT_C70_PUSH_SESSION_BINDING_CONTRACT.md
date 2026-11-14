# C70 — Push kaydı oturuma bağlı (çıkış yapılmış cihaza bildirim gitmez)

> Durum: AKTİF · Tarih: 2026-11-14 · Tier: api + mobile · **R7** (oturum katmanı + T&S) — merge onayı sahipte.

## 1. Sorun

Push token (`PushToken`) yalnız **kullanıcıya** bağlı. Oturum kapanınca token silinmezse cihaz bildirim almaya
devam eder. Ortam mesajlarında bildirim gövdesi mesaj metnidir, yani çıkış yapılmış/kaybolmuş telefonu tutan kişi
içerik görür.

Bugün token yalnız mobil `logout()`'taki `DELETE /notifications/push-tokens/:token` ile siliniyor. Bu çağrı
sunucu çıkışından SONRA gittiği için `JwtStrategy` (iptal edilmiş oturum) 401 veriyordu, token hiç silinmiyordu
(sahip bulgusu 2026-11-14). Ayrıca şu yollarda hiç silme yok: başka cihazdan oturum kapatma, tüm oturumları kapatma,
şifre sıfırlama, refresh reuse-detection, çevrimdışı çıkış, eski sürüm istemci.

## 2. Karar

Token, kaydedildiği oturumun **token ailesine** (`Session.tokenFamily`) bağlanır. Aile, refresh rotasyonunda
değişmez; çıkış/iptal aile bazlı yapılır. **Gönderim anında** canlı oturumu olmayan ailenin token'ı kullanılmaz ve
silinir. Böylece tek tek iptal noktalarına dokunulmaz; bugünkü ve gelecekteki her iptal yolu kendiliğinden kapsanır.

## 3. API

### 3.1 Şema
- `PushToken.tokenFamily String?` + `@@index([tokenFamily])`. Migration adı: `c70_push_token_family`.
- Nullable: mevcut satırlar (eski kayıt) `null` kalır (§3.4).

### 3.2 Kayıt — `POST /notifications/push-tokens`
- İmza, DTO, envelope **değişmez**. Controller `@CurrentUser()`'dan `tokenFamily`'yi alır (JwtStrategy zaten
  döndürüyor) ve servise geçirir.
- `registerPushToken(userId, tokenFamily, dto)`: upsert'in **create ve update** dallarına `tokenFamily` yazılır
  (aynı cihazda yeni girişte token yeni aileye taşınır).

### 3.3 Gönderim — `PushService`
- Token okuyan **tüm** `pushToken.findMany` çağrıları (bugün 4 yer) tek bir özel yardımcıdan geçer, örn.
  `private async liveTokens(where: Prisma.PushTokenWhereInput)`:
  1. Token'ları getir.
  2. `tokenFamily` dolu olanların ailelerini topla; `session.findMany({ where: { tokenFamily: { in }, revokedAt: null }, select: { tokenFamily: true }, distinct })` ile canlı aileleri bul.
  3. Döndür: `tokenFamily === null` (eski kayıt, §3.4) **veya** ailesi canlı olanlar.
  4. Ailesi ölü olanları `deleteMany` ile sil. Silme hatası gönderimi bozmaz, yalnız loglanır.
- Mevcut davranış (v1/v2 biçimi, batch, dead token temizliği, hata yutma) değişmez.

### 3.4 Eski kayıtlar (geçiş)
- `tokenFamily = null` satırlar **şimdilik gönderilir**. Mobil uygulama oturum açıkken her açılışta token'ı yeniden
  kaydeder; aktif kullanıcıların satırları bu yolla dolar.
- Kapanış borcu PLAN.md'de: mobil sürüm yayınından 14 gün sonra `null` satırlar silinir, `null` artık ölü sayılır.

### 3.5 Testler (spec)
`liveTokens` / `sendToUsers` için en az:
- canlı ailenin token'ı gönderilir;
- iptal edilmiş ailenin token'ı gönderilmez **ve silinir**;
- `null` aileli token gönderilir, silinmez;
- karışık listede yalnız doğru alt küme gönderilir;
- kayıt: upsert create ve update dallarında `tokenFamily` yazılır.

## 4. Mobile

- `stores/auth.ts` `logout()`: `clearPushToken()` sunucu çıkışından **önce** (PM tarafından yazıldı, diff'te var; koru).
- Başka mobil değişiklik yok.

## 5. Kapsam dışı
- Web (push token yok). Uygulama içi istemci tarafı "oturum yoksa bildirimi çizme" savunması (ayrı iş, gerekirse).
- `DELETE` ucunun davranışı değişmez.

## 6. DoD
- [ ] Migration oluşturuldu ve yerel DB'ye uygulandı; `npx prisma migrate status` temiz.
- [ ] `npx prisma generate` + `npx tsc -p tsconfig.build.json` temiz.
- [ ] İlgili spec'ler yeşil (`npx jest src/shared/push src/modules/notifications`), mevcut testler bozulmadı.
- [ ] Dokunulan dosyalarda eslint temiz.
- [ ] Mobil: `npm run typecheck` yalnız bilinen 4 rota tipi hatası; `npx eslint src/stores/auth.ts` temiz.
- [ ] Commit/push YOK — R7 diff sahibe sunulur.

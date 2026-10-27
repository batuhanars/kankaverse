# SPRINT C17: Huni paneli

> Durum: **TASARIM KİLİTLİ (2026-10-27).** PM compose (Opus). Kurul verdikti 2026-09-08'in onayladığı
> "huni ölçümü" (PLAN A6). Sıra: **api → web.** Mobil kapsam dışı (yönetici yüzeyi web/masaüstünde, D-kararı
> "kurulum anında yapılan ağır yapılandırma web'de kalır" ile aynı mantık).
> **R7-nötr:** auth tablosu (`Session`) yalnız OKUNUR, auth akışına ve `PlatformAdminGuard`'a dokunulmaz.

---

## §0 Kapsam ve kararlar

**Neden:** 2026-10-27 elle çalıştırılan sorgu: kayıt 49 → ilk ortam 17 → ilk mesaj 15; son 7 gün aktif 8.
En büyük kayıp kayıt → ilk ortam. Sıradaki karşılama sprintinin etkisi ancak bu tablo düzenli görülürse ölçülür.

**Kilitli kararlar:**
- **Yeni veri toplanmaz, şema değişmez, migration yok.** Huni mevcut tablolardan türetilir:
  kayıt = `User.createdAt` · ilk ortam = `GuildMember.joinedAt` · ilk mesaj = `Message.authorId` (DM dahil) ·
  dönüş/aktiflik = `Session.createdAt` (refresh rotasyonu her yenilemede yeni satır açar, eski satırlar
  silinmez → fiilen aktivite günlüğü; veri 2026-06-19'dan beri var).
- **Yalnız toplam sayı döner.** Kullanıcı bazlı huni satırı, kullanıcı adı, e-posta YOK (KVKK: amaç dışı
  kişisel veri işlenmez; kişi bazlı görünüm zaten mevcut kullanıcı listesinde).
- **Sayılmayanlar:** silinmiş (`deletedAt`) hesaplar ve platform yöneticileri (`isModerator`, panelin sahibi
  kendi sayısını şişirmesin).
- **Gün sınırı İstanbul saatiyle** (`Europe/Istanbul`). "Ertesi gün dönüş" = kayıt gününden sonraki herhangi
  bir takvim gününde en az bir Session satırı.
- **Toplama SQL'de yapılır** (`prisma.$queryRaw` etiketli şablon, parametreli; string birleştirme YASAK).
  Kullanıcı sayısı ve 2.4k Session satırı için tek sorgu yeter; önbellek yok.
- 🔴 **Yapısal kısıt (PLAN'a yazılır):** revoked Session satırlarını temizleyen bir iş eklenirse huni kırılır.
  O gün gelirse önce günlük aktiflik tablosuna geçilir.

**OUT:** grafik/zaman serisi kütüphanesi · kohort ısı haritası · test hesabı ayıklama · olay izleme (analytics SDK) ·
mobil ekran · CSV dışa aktarma.

---

## §1 Backend

`GET /admin/funnel?cohortDays=<30|90|0>` — `PlatformUsersController` yanında, **aynı guard'larla**
(`JwtAuthGuard, PlatformAdminGuard`). Yeni modül açılmaz; `platform-users` modülüne `FunnelService` (ya da
mevcut servise metot, 30 satır sınırını aşarsa ayrı servis).

- `cohortDays`: yalnız son N günde kayıt olanlar. `0` veya yok = tümü. İzinli değerler dışında `400`.
- Yanıt (envelope içinde `data`):

```jsonc
{
  "cohortDays": 0,
  "generatedAt": "2026-10-27T08:30:00.000Z",
  "steps": {
    "registered": 49,        // kohorttaki hesaplar
    "joinedGuild": 17,       // en az bir GuildMember
    "sentMessage": 15,       // en az bir Message (DM dahil, silinmiş mesaj da sayılır: yazmış olmak yeter)
    "returnedNextDay": 18,   // kayıt gününden sonraki bir günde Session
    "returnedAfter7Days": 11,// kayıt gününden ≥7 gün sonra Session
    "activeOn3Days": 16      // ≥3 farklı takvim gününde Session
  },
  "activity": {              // kohorttan bağımsız, tüm (sayılan) kullanıcılar
    "activeLast7Days": 8,
    "activeLast30Days": 14,  // örnek değer
    "registeredLast7Days": 3
  }
}
```

- Sayılar `bigint` gelir → `Number` çevrilir.
- DTO `@nestjs/swagger` ile belgelenir (OpenAPI tek kaynak).
- **Test:** `$queryRaw` mock'lanır; bigint → number dönüşümü, `cohortDays` doğrulaması (geçersiz → 400),
  guard'ların uçta durduğu (metadata). SQL'in kendisi DoD'da **yerel DB'ye karşı elle** çalıştırılır
  (mock Prisma SQL'i denetlemez).

---

## §2 Web

1. `web/src/api/admin.ts`: `getFunnel(cohortDays)` + tip.
2. Yönetici sekmesine üçüncü alt sekme: **"Huni"** (`UserSettingsView.vue` `adminSub`). Yeni bileşen
   `PlatformFunnelSection.vue` (mevcut `PlatformUsersSection.vue` kalıbında).
3. Görünüm: kohort seçici (Tümü / Son 30 gün / Son 90 gün) + adım listesi. Her adımda sayı, kayda göre yüzde
   ve göreli genişlikte yatay çubuk (düz CSS, kütüphane yok, tasarım token'ları). Altında "Aktiflik" satırı
   (son 7 gün aktif, son 30 gün aktif, son 7 gün kayıt) ve "Güncelleme: 18.42" saati.
4. Kayıt sayısı 0 ise yüzde gösterilmez (bölme yok), boş durum metni.
5. i18n `admin.funnel.*`. Uzun çizgi yok, metinler sade. Adım adları: "Kayıt oldu", "Bir ortama girdi",
   "Mesaj yazdı", "Ertesi gün geri geldi", "Bir hafta sonra geri geldi", "En az 3 gün girdi".
6. Dar ekran: 390/320px'te taşma yok (yönetici yüzeyi ama masaüstü penceresi de daralır).

---

## §3 DoD
- [ ] api: uç + DTO + testler; guard'lar aynı; `$queryRaw` parametreli
- [ ] api: sorgu **yerel DB'de** çalıştırıldı, sayılar elle sayımla tutarlı (örn. `GuildMember` distinct userId)
- [ ] web: Huni alt sekmesi, kohort seçici, yüzde + çubuk, boş durum, 390/320 ölçüldü
- [ ] build/test: api `tsc --noEmit` + jest; web `vue-tsc -b` (bilinen 6) + `vite build`
- [x] PLAN teknik borç/kısıt satırı: "revoked Session temizliği huniyi kırar" (PM yazdı, D76)
- [ ] Sahip turu (canlı): panel rakamları 2026-10-27 elle sorgusuyla aynı mertebede (yönetici hariç tutulduğu için
      1-2 eksik beklenir)

## §4 Sapma kuralı
Şunlar → **DUR, PM'e dön:** şema/migration ihtiyacı · auth akışına veya guard'a dokunma · kullanıcı bazlı veri
dönme · yeni npm paketi (grafik kütüphanesi dahil) · mobil değişiklik.

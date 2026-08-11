# Sprint M5d — Cihaz Turu Bulguları (üç tier)

> **Kaynak:** sahibin M5c cihaz doğrulama turu, 2026-08-11. A ve C maddeleri turda çıktı, teşhisleri
> PM tarafından kaynak koddan yapıldı (tahmin yok, satır numarası var).
> **Tier'lar AYRIK:** §1 `mobile/`, §2 `api/`, §3 `web/`. Her biri ayrı dev oturumunda yapılabilir;
> aralarında dosya çakışması yok.
> 🔴 **§2 R7 yüzeyidir** — yetki kararı. Diff sahibin satır satır onayından geçmeden merge edilmez.

---

## §1 `mobile/` — Aramadayken bildirim ve okunmadı rozeti hiç gelmiyor

### Kök neden (PM buldu, doğrulandı)

`src/app/(app)/dm/[id].tsx:107` — "bu DM açık" kaydı **mount'a** bağlı, odağa değil:

```
useEffect(() => {
  store.setActiveDm(channelId);
  ...
  return () => useDmStore.getState().setActiveDm(null);
}, [channelId]);
```

Arama ekranı DM ekranının ÜSTÜNE itiliyor. Yığın gezinmesinde alttaki ekran **unmount olmuyor**, yalnız
odağı kaybediyor. Dolayısıyla `activeDmChannelId` dolu kalıyor ve uygulama kullanıcı arama ekranındayken
hâlâ "o DM'i okuyor" sanıyor.

Tek sebep, iki belirti:
- `notifications/push.ts` §2 istisnası tetikleniyor → **banner düşmüyor**
- `stores/dm.ts:166` `payload.channelId !== activeDmChannelId` false → **`unread` hiç set edilmiyor** →
  arama ekranındaki sohbet düğmesinde nokta çizilmiyor

🔬 Bunun bir sonucu: M5c DoD'undaki "o DM'in ekranındayken banner çıkmıyor" maddesi **aslında
doğrulanmadı** — hiç bildirim düşmediği için boş yere geçmiş göründü. Düzeltmeden sonra yeniden sınanacak.

### Yapılacak

1. `dm/[id].tsx` — `setActiveDm` kaydı **odağa** bağlansın (`useFocusEffect`, `expo-router`'dan;
   depoda zaten kullanılıyor: `home.tsx:4`, `me.tsx`, `notifications.tsx`). Odak gelince set, odak
   gidince `null`.
2. 🔴 `src/components/MessageScreen.tsx:171` — **aynı kusur sınıfı** ortam kanallarında da var
   (`setActiveChannel` mount'a bağlı). Onu da odağa bağla.
   **DİKKAT — cerrahi ol:** o effect aynı zamanda `fetchMessages`, `markRead`, `joinChannel` ve
   `leaveChannel` yapıyor. **Yalnız `setActiveChannel` odağa taşınacak.** Odak kaybında odadan
   çıkarsan (`leaveChannel`) arama sırasında mesajları almayı bırakırsın — kusuru büyütürsün.
   Katılım/ayrılma ve veri çekme mount'ta KALIR.
3. `clearUnread` çağrısı da odakta çalışabilir (zararsız, ekrana dönünce rozet düşer) — ama
   `markRead`'in sunucuya gidiş sıklığını artırma, mount'ta bırak.

### Sınır koşulu

Aynı DM ekranına geri dönünce `setActiveDm` yeniden set edilmeli, yoksa bu sefer ters kusur doğar
(kullanıcı DM'i okurken de banner düşer). Odak/blur çiftinin simetrik olduğundan emin ol.

---

## §2 `api/` — 🔴 R7: Sahiplik devri eski sahibi yönetici yapıyor

### Kök neden

`src/modules/guilds/guilds.service.ts:799` — devir işleminde eski sahip `GuildRole.ADMIN` yapılıyor.

Sahibin yaşadığı zincir: A→B devri (A ADMIN oldu), sonra B→A geri devri (**B ADMIN oldu**). B daha önce
hiç yönetici değildi, sıradan üyeydi. Yani gidiş dönüş o kişiyi **kalıcı olarak yöneticiye terfi
ettirdi**. Kullanıcının verdiği özel rolü geri alması bu enum alanına dokunmuyor, dolayısıyla yetki
kalıntı olarak duruyor.

Bu bir **sessiz yetki yükselmesidir**: kimse bir yetki vermedi, kimse bir şey görmedi, kişi yetkiyi
kazandı. Referans uygulama (Discord) devirde eski sahibe yönetici vermez.

### Yapılacak (sahip kararı 2026-08-11)

`GuildRole.ADMIN` → **`GuildRole.MEMBER`**. Devir kimseye yeni yetki VERMEZ; kişi yalnız kendi
atanmış rolleriyle kalır.

- Yeni sahibin `OWNER` olması **değişmez**.
- `guild.member_updated` yayını **değişmez** (iki üye için de yayılmaya devam eder).
- Testler: `guilds.service.spec.ts` bu davranışı sınıyorsa güncelle. 🔴 Testi "geçsin diye"
  değiştirme; beklentiyi yeni ve doğru davranışa göre yaz, gerekçeyi teste yorum olarak koy.

### Kapsam dışı

- Mevcut veriyi düzelten toplu betik **YAZILMAYACAK** (sahip kararı: elle düşürecek, §3 onun aracı).
- `PATCH /guilds/:id/members/:userId/role` ucu **değişmez**, zaten doğru çalışıyor.

---

## §3 `web/` — Üye rolünü düşürme arayüzü yok

### Durum

Backend ucu var ve doğru: `PATCH /guilds/:id/members/:userId/role`, yalnız OWNER, `ADMIN | MEMBER`.
**Mobilde** arayüzü var (`mobile/src/app/(app)/guild-member.tsx:152` → `guildsApi.setMemberRole`).
**Webde hiç yok** — `web/src/api/guilds.ts` içinde karşılığı bile tanımlı değil. Sahip bu yüzden
kalıntı yetkiyi kaldıramadı.

### Yapılacak

1. `web/src/api/guilds.ts` — `setMemberRole(guildId, userId, role)` eklensin. İmza mobildekiyle
   **birebir aynı** olsun (`'ADMIN' | 'MEMBER'`), envelope kuralı gereği gerçek veri
   `response.data.data`'dan çıkar.
2. Arayüz `web/src/views/app/components/GuildSettingsView.vue` üye listesine ya da
   `components/layout/GuildMemberRow.vue`'ya eklensin — **hangisinin doğru yer olduğunu koda bakarak
   sen karar ver**, üye yönetimi bugün nerede yapılıyorsa oraya.
3. Yalnız **OWNER**'a görünür. Yetkisize düğme render EDİLMEZ (disabled gösterilmez — mobil ve web
   ortak deseni). Kendine ve ortam sahibine eylem yok.
4. Yıkıcı olmayan ama yetki değiştiren bir işlem: **onay iste** (mevcut `ConfirmDialog` deseni).
5. Hata mesajı sunucudan gelen Türkçe `message` ile gösterilir, ham hata basılmaz.
6. i18n: yeni metinler `web/src/i18n/tr.json`'a. 🔴 Kaçırılmamış `@` KOYMA — vue-i18n'de sayfayı
   komple boşaltır ve tip denetimi, lint, derleme üçü de yeşil verir.

---

## §4 Doğrulama

| Tier | Komutlar |
|---|---|
| `mobile/` | `npm run typecheck` · `npm run lint` |
| `api/` | `npm run build` · `npm test` |
| `web/` | `npx vue-tsc -b` (bilinen 6 önceden-var hata) · dokunduğun dosyalarda `npx eslint` · `npx vite build` |

🔴 `web/` için depo geneli `npm run lint` YEŞİL DÖNMEZ, dönmesi de beklenmiyor (PLAN.md D64,
dondurulmuş borç). Dokunduğun dosyalar temiz olsun, toplu `--fix` çalıştırma.

Cihaz/tarayıcı doğrulaması **sahipte**. "Çalışıyor" beyanı üretme; ne yaptığını ve neyin sınanması
gerektiğini yaz.

## §5 Sapma kuralı

Sözleşme dışına çıkma ihtiyacı doğarsa **DUR, PM'e bildir.** Kendi tier'ının dışına dokunma.

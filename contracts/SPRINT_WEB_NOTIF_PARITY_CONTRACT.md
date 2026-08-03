# SPRINT WEB-PARITE — Web Bildirim Rozeti Paritesi + Menü Cilası + DM Profil Paneli

> **Tek doğruluk kaynağı.** Davranış tablosu ve bileşen sınırı buradan **sapamaz**.
> Sapma ihtiyacı → **DUR**, sahibe bildir, PM revize etsin.
>
> PM compose: 2026-08-03. Kaynak: **sahip canlı testi** (web). Mobilde M2a/M2b turlarıyla çözülmüş
> davranışların web'de eksik kaldığı yerler + Discord menü davranışı.

---

## §0 Bağlam — sahip testinde çıkan tablo

| Gözlem | Durum |
|---|---|
| DM susturuldu, DM satırında **rozet yine çıktı** | 🔴 gerçek hata |
| Kanal susturuldu → kanal satırı parlamıyor (doğru), ama o kanaldan mesaj gelince **rail'de ortam simgesi yandı** | 🔴 gerçek hata (mobilde M2b R1'de çözülen sınıfın web karşılığı) |
| Kanal sağ-tık menüsünde "Kanalı Sustur" **süre seçtirmiyor**, sadece işaretliyor | 🔴 eksik (DM menüsünde ve ortam menüsünde süre var, kanalda yok) |
| Flyout'lar (Sustur / Bildirim Ayarları) **tıklamayla** açılıyor | 🟡 cila: Discord hover ile açıyor |
| Responsive'de DM sağ profil paneli **hiç açılmıyor** | 🟡 önceden var olan boşluk (panel `max-xl:hidden`, açma yolu yok) |

**Kök neden (ilk iki satır):** web süzgeci **çizim anında** ve **aynı seviyede** uyguluyor —
`ServerRail` ortam susturulmuşsa gizliyor, `ChannelPanel` kanal susturulmuşsa gizliyor. Ama canlı
sayaç artışı (`useSocket`) hiçbir tercihe bakmıyor. Kanal susturulup **ortam** rozetine bakıldığında
kimse süzmüyor. Mobil bunu **artış anında** çözüyor (`stores/unread.ts` `bumpChannel` →
`channelBadgeEffect`), bu yüzden orada hiç oluşmuyor. DM tarafında web'de **hiçbir katmanda** süzgeç yok.

---

## §1 Kapsam

### IN
1. Canlı rozet paritesi: artış anında tercih süzgeci (§2)
2. DM listesinde susturulmuş sohbetin görsel dili (§2.3)
3. Kanal sağ-tık menüsünde süreli sustur (§3.1)
4. Flyout'ların hover ile açılması (§3.2)
5. Responsive'de DM profil paneline erişim (§4)

### OUT (bilinçli)
| Çıkarılan | Gerekçe |
|---|---|
| `ChannelPanel`/`ServerRail` menülerinin `ContextMenuShell`'e taşınması | D30 tetikleyicisi **dar yorumlanıyor**: bu sprint menü kabuğunu değil, içindeki bir öğeyi değiştiriyor; drift riski doğmuyor. D30 borç olarak duruyor |
| Sunucuda `mention` emit'inin tercih arkasına alınması | R15'e iliştirildi (aynı emit yolu orada zaten elleniyor). İstemciler bu sprintten sonra kendilerini süzüyor |
| DM unread sayısının sunucuda tercihe göre süzülmesi | `GET /dm/channels` ham sayı döndürmeye devam eder; iki istemci de tercihi kendisi uygular (mobil bugün de böyle). Sunucu değişikliği YOK → bu sprint saf `web/` |

---

## §2 Canlı rozet paritesi (asıl hata)

### 2.1 Paylaşılan saf yardımcı

`stores/notificationPrefs.ts` içine mobildeki `channelBadgeEffect`'in **birebir** karşılığı eklenir:

```ts
channelBadgeEffect(channelId: string): { countUnread: boolean; countMention: boolean }
// pref yok            → { true,  true  }   (varsayılan ALL, susturulmamış)
// aktif mute          → { false, false }
// level NONE          → { false, false }
// level MENTIONS      → { false, true  }
// level ALL           → { true,  true  }
```

🔴 **Yalnız `CHANNEL` tercihine bakar, `GUILD`'e düşmez.** Sebep: ortam düzeyi süzgeci `ServerRail`
çizim anında zaten uyguluyor; burada da uygulanırsa çift süzgeç olur. Mobil aynı ayrımı yapıyor
(`stores/notificationPrefs.ts` içindeki not) ve sunucu `guilds.service.ts`
`resolveChannelBadgeEffect` ile aynı tabloyu kullanıyor — üç kaynak böyle örtüşür.

### 2.2 `useSocket` artışları

| Event | Bugün | Olması gereken |
|---|---|---|
| `channel.activity` | koşulsuz `markChannelUnread` + `incrementGuildUnread` | `countUnread` false ise **ikisi de yapılmaz** |
| `mention` | koşulsuz `markChannelMentioned` + `incrementGuildMention` | `countMention` false ise **ikisi de yapılmaz** |
| `dm.message` | koşulsuz `dmStore.applyActivity` | DM kanalının `CHANNEL` tercihi mute/NONE ise **okunmamış sayılmaz**; son mesaj önizlemesi ve sıralama **güncellenmeye devam eder** (sohbet listede yaşamalı, sadece rozet yanmamalı) |

Masaüstü toast'ları (`useMessageToasts`) zaten süzülü, **dokunulmaz**.

### 2.3 DM listesi çizimi (`DmList.vue`)

Sunucu ham sayı döndüğü için yenilemeden sonra da doğru davranmak zorunda:

- Susturulmuş DM (`isMuted('CHANNEL', ch.id)`) → **okunmamış noktası çizilmez**, satır adı kalın olmaz
- Satır **sönük** görünür (mobil dili: `--kv-text-muted`), yani sohbet listede durur ama sessizdir
- `level === NONE` → aynı davranış; `MENTIONS` → DM'de bahsetme sayacı yok, mute'suz normal görünür
- Susturulmuş DM'i **listeden gizleme** (kayıp sohbet hissi yaratma)

---

## §3 Menü cilası

### 3.1 Kanal sağ-tık menüsü: süreli sustur

Bugün `ChannelPanel.vue` **kanal context menüsündeki** "Kanalı Sustur" düz bir toggle (✓ işaretli).
Aynı dosyadaki **ortam** başlık menüsü (satır ~1044) ve DM menüsü zaten `MuteDurationFlyout` kullanıyor.

- Kanal menüsündeki toggle → `MuteDurationFlyout` (etiket: "Kanalı Sustur"; DM menüsünde eklenen
  opsiyonel `label`/`unmuteLabel` prop'ları burada da kullanılır)
- `useChannelMenuActions`'a `muteChannelFor(minutes: number | null)` + `unmuteChannel()` eklenir
  (`useGuildMenuActions`'taki ikizinin deseni; `toggleChannelMute` çağıranı kalmıyorsa kaldırılır)
- Süre listesi **tek kaynak**: `MuteDurationFlyout`'un mevcut listesi (15dk / 1s / 3s / 8s / 24s /
  ben tekrar açana kadar). Yeni liste yazma
- Susturulmuşken öğe "Susturmayı Kaldır" olur ve bitiş zamanını gösterir (mevcut flyout davranışı)

### 3.2 Flyout'lar hover ile açılsın

`MuteDurationFlyout` + `NotifLevelFlyout` (yani her iki menüde de sağ ok işaretli öğeler):

- **`mouseenter` → açılır**, `mouseleave` → **~150ms gecikmeyle** kapanır (imleç öğeden panele
  geçerken kapanmasın; klasik submenu tuzağı)
- Tıklama **çalışmaya devam eder** (dokunmatik + erişilebilirlik); açıkken tıklama kapatır
- Klavye: `Enter`/`Space`/`→` açar, `Esc`/`←` kapatır, ok tuşlarıyla öğeler gezilir
- **Yalnız hover destekleyen cihazda** hover davranışı: `@media (hover: hover)` ya da mevcut
  `useResponsive`; alt-sayfa modunda (<768, DM menüsü) davranış **değişmez**, dokunmayla açılır
- Aynı anda tek flyout açık kalır (menü içi kardeş flyout'lar birbirini kapatır)

---

## §4 Responsive'de DM profil paneli

Bugün `DmView.vue` paneli `max-xl:hidden` ile gizliyor ve **açma yolu yok**. Ortam görünümünde üye
paneli için çözüm zaten var (`SPRINT_RESPONSIVE` §A: ≥1280 inline, <1280 overlay + toggle). DM paneli
aynı desene geçer:

- DM başlığına **profil paneli toggle'ı** (kişi ikonu), yalnız `<1280`'de görünür
- Açılınca panel **overlay** olarak gelir (üye panelindeki mevcut overlay davranışı + backdrop + ESC)
- ≥1280'de bugünkü inline davranış **aynen** kalır, toggle görünmez
- Yeni breakpoint/sistem uydurma; `useResponsive` + üye paneli deseni tekrar kullanılır
- `hidden xl:*` kalıbı **kullanılmaz** (eklenti `.hidden` çakışması — `DmView` içindeki mevcut not)

---

## §5 DoD

**Kod:**
- [x] `npx vue-tsc --noEmit` temiz · `npx vite build` geçer · yeni bağımlılık yok
- [x] Metinler `tr.json`; renk/ölçü `--kv-*`
- [x] `channelBadgeEffect` **tek** yerde tanımlı, `useSocket` üç handler'da onu kullanıyor
- [x] Sunucu (`api/`) diff'i **yok** (WEB-PARITE kapsamında; ağaçtaki `api/` diffi R14'e ait)

**Tarayıcı (sahip):**
- [ ] Kanalı sustur → o kanaldan mesaj gelince **ne kanal satırı ne rail ortam simgesi** yanıyor;
      susturulmamış başka kanaldan gelince ikisi de yanıyor
- [ ] DM'i sustur → DM satırında rozet **yok**, satır sönük, son mesaj yine güncelleniyor;
      yenileyince de rozet gelmiyor
- [ ] Kanal seviyesi "Sadece bahsetmeler" → düz mesaj rozeti yok, bahsetme rozeti var
- [ ] Kanala sağ-tık → "Kanalı Sustur" **süre listesi** açıyor; seçilen süre sonrası öğe
      "Susturmayı Kaldır" + bitiş saati gösteriyor
- [ ] Sustur ve Bildirim Ayarları **imleci üzerine getirince** açılıyor; imleç öğeden listeye
      giderken kapanmıyor; tıklama da çalışıyor
- [ ] Pencere <1280 → DM başlığındaki ikonla profil paneli açılıyor, ESC/backdrop kapatıyor;
      ≥1280'de ikon yok, panel eskisi gibi sabit

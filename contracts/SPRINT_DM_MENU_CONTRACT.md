# SPRINT DM-MENU — Web: DM Satırı Sağ-Tık Menüsü + Başlık Sadeleşmesi

> **Tek doğruluk kaynağı.** Menü öğe listesi, bileşen sınırı ve responsive davranış buradan **sapamaz**.
> Sapma ihtiyacı → **DUR**, sahibe bildir, PM revize etsin.
>
> PM compose: 2026-08-03. Kaynak: sahip talebi (mobil M2b/M2c turunda fark edildi).
> **Sprint-bağımsız, saf `web/` işi. SIFIR backend** (yeni uç yok, DTO değişmiyor, migration yok).

---

## §0 Bağlam

DM listesi, sağ-tık menüsü **olmayan tek yüzey**: ray'de ortam menüsü (`ServerRail`), kanal panelinde
kanal menüsü (`ChannelPanel`), üye satırında üye menüsü (`GuildMemberRow`) var. Mobilde `DmMenuSheet`
zaten altı aksiyonu taşıyor; web bunun gerisinde kaldı.

Aynı turda 1-1 DM başlığındaki **iki metin butonu** (Şikâyet Et · Sohbeti Temizle) ikon şeridinin
arasında sırıtıyor. İkisi de menüye/panele taşınır, başlıkta yalnız ikonlar kalır.

---

## §1 Kapsam

### IN

1. Paylaşılan menü kabuğu: `components/shared/ContextMenuShell.vue` (§2)
2. `DmList` satırında **sağ-tık** + **⋯ butonu** ile açılan DM menüsü (§3)
3. 1-1 DM başlığından **Şikâyet Et** ve **Sohbeti Temizle** metin butonlarının kaldırılması (§4)
4. **Şikâyet Et** ve **Kanka Ekle** → `DmProfilePanel` içinde aksiyon satırı (§4)
5. Responsive (<768) davranışı: ⋯ kalıcı görünür + menü alt sayfa (bottom sheet) olarak açılır (§5)

### OUT (bilinçli)

| Çıkarılan | Gerekçe |
|---|---|
| `ServerRail`/`ChannelPanel`/`GuildMemberRow` menülerinin kabuğa taşınması | **PM kararı (B seçeneği, sahip devretti):** bugünkü acı beşinci kopyayı yazmak; kabuk onu çözüyor. Üç canlı yüzeyi bugün riske atmak temizlik, acı değil. **Borç tablosuna tetikleyiciyle yazılır:** o menülerden biri bir sonraki değişimde kabuğa geçer |
| Uzun-basma (long-press) ile menü | ⋯ dokunmatikte yeterli ve güvenilir affordance; long-press metin seçimi/kaydırma ile çakışıyor. Gerekirse ayrı karar |
| Engelle / Arkadaşlıktan Çıkar'ın menüye eklenmesi | Bugün profil yüzeylerinde (`FullProfileModal`/`UserCardPopover`) duruyorlar, çalışıyorlar. Menüye kopyalamak üçüncü giriş noktası olur |
| Grup DM yönetim aksiyonlarının (yeniden adlandır/üye ekle/ayrıl/sil) yeniden düzenlenmesi | Mevcut yerlerinde kalır. Bu sprint listeye menü ekliyor, grup yönetimini taşımıyor |
| Mesaj İstekleri satırları | İstek kutusu ayrı akış; menü açılmaz |

---

## §2 `ContextMenuShell.vue` (yeni, `components/shared/`)

Dört kopyanın (`rail-ctx`, `ch-ctx`, `GuildMemberRow`, `VoiceParticipantList`) ortak iskeleti.
Bu sprintte **yalnız DM menüsü** kullanır.

**Props:**

| Prop | Tip | Anlam |
|---|---|---|
| `x` | `number` | İmleç/çapa X (viewport koordinatı) |
| `y` | `number` | İmleç/çapa Y |
| `menuId` | `string` | `useMenuCoordinator` kimliği (tekil açık menü) |

**Emit:** `close`

**Sorumluluk:** `Teleport to="body"` · `position: fixed` + **viewport kenar sıkıştırması** (menü ekran
dışına taşmaz) · `role="menu"` · dışarı tık + ESC ile kapanma · `useMenuCoordinator`
(`openExclusive`/`releaseIfOwner`/`closeOnOther`) ile başka menü açılınca kapanma ·
`@click.stop` + `@contextmenu.prevent.stop`.

**Slot:** `default` — öğeler çağıran tarafından yazılır.

🔴 **Stil kuralı (dev bunu atlarsa iş yanlış çıkar):** Vue'da **scoped stil slot içeriğine geçmez**
(slot içeriği çağıranın scope'una aittir). Kabuğun öğe stilleri bu yüzden **scoped olmayan** bir
`<style>` bloğunda, kök `.kv-ctx` sınıfı altında namespace'lenir: `.kv-ctx__item`,
`.kv-ctx__item--danger`, `.kv-ctx__divider`, `.kv-ctx__icon`, `.kv-ctx__label`, `.kv-ctx__check`.
Görsel `ch-ctx` ile **birebir aynı** olur (elevated bg, ince subtle kenarlık, **gölge yok** — tasarım
sistemi kuralı). Mevcut `ch-ctx`/`rail-ctx` sınıfları **silinmez, değiştirilmez**.

---

## §3 DM menüsü

Açılış: `DmList` satırında `@contextmenu.prevent` **veya** satır hover'ında beliren **⋯ butonu**
(`GuildMemberRow` deseni: iki giriş, tek menü). Hedef satır aktif DM değil, **sağ-tıklanan** kanaldır.

Aksiyonlar `composables/useDmMenuActions.ts` içinde toplanır (`useChannelMenuActions` deseni; hedef
kanal fonksiyonla verilir). Menü işaretlemesi ve mevcut yüzeyler aynı store'u okur, ikinci mute
mantığı yazılmaz.

### 3.1 1-1 DM öğeleri (sıra bağlayıcı)

| # | Öğe | Davranış | Kaynak |
|---|---|---|---|
| 1 | **Profil** | `FullProfileModal` açar | mevcut |
| 2 | **Kanka Ekle** | yalnız arkadaş değilse görünür; mevcut `by-user` akışı | mevcut (başlıktaki buton **kalır**) |
| 3 | **Okundu İşaretle** | `dmApi.markRead` | mevcut uç |
| 4 | **Sustur / Susturmayı Kaldır** | `MuteDurationFlyout` (süre seçimi), `NotifTargetType.CHANNEL` + kanal id | mevcut bileşen |
| 5 | **Bildirim Ayarları** | `NotifLevelFlyout` | mevcut bileşen |
| — | ayraç | | |
| 6 | **Sohbeti Temizle** | mevcut `ConfirmDialog` + `dmApi.clearChannel`; aktif DM temizlenirse bugünkü `cleared` davranışı korunur | başlıktan **taşındı** |
| 7 | **Şikâyet Et** (danger) | `ReportModal`, `targetType: USER`, hedef `otherUser.id` | başlıktan **taşındı** |

### 3.2 GROUP_DM öğeleri

Yalnız **3 · 4 · 5 · 6** (Profil ve Kanka Ekle 1-1'e özgü; şikâyet hedefi tek kullanıcı olduğu için
grupta **gösterilmez** — mevcut davranış zaten böyle).

---

## §4 Başlık ve profil paneli

**1-1 DM başlığı:** `Şikâyet Et` ve `Sohbeti Temizle` **metin butonları kaldırılır**. Kalan şerit:
Kanka Ekle (koşullu, aşağı bkz.) · sesli ara · görüntülü ara · 📌 sabitlenenler.
**Grup DM başlığına dokunulmaz.**

**`DmProfilePanel` (≥1280'de görünen panel) iki yeni aksiyon satırı alır:**

| Satır | Koşul | Davranış |
|---|---|---|
| **Kanka Ekle** | `card.friendStatus` arkadaş/bekleyen değilse | Mevcut `by-user` akışı; ret **jenerik** (sebep gösterme, Sprint 4A G2 kuralı). Gönderildikten sonra satır "İstek gönderildi" durumuna geçer |
| **Şikâyet Et** (danger) | her zaman | `ReportModal`, `targetType: USER` |

Panel gerekli veriyi zaten çekiyor (`usersApi.getCard` → `UserProfileCardDto`), yeni istek yok.

**Kanka Ekle'nin başlıktaki hâli:** bugün `xl:hidden` ile **yalnız panel gizliyken** görünüyor
(kod içindeki M1d-0 R1 notu). Bu koşul **korunur**, düğme yalnız **ikon-only**'ye iner (metin kalkar,
`title` + `aria-label` kalır) — şerit dar ekranda üç ikonla hizalanır. Yani her genişlikte **tek**
görünür giriş: ≥1280 panel, <1280 başlık ikonu. Menüdeki öğe bunlardan bağımsız, satır bazlı
(sohbeti açmadan ekleyebilmek için) ve mobil `DmMenuSheet` ile paritedir.

**Şikâyet erişim tabanı:** panel `max-xl:hidden` olduğu için panel **tek yol değildir**; menüdeki
7. öğe her genişlikte erişimi garanti eder (T&S: güvenlik aksiyonu hiçbir genişlikte kaybolmaz).

---

## §5 Responsive (<768)

Sahip kararı: mobil kullanıcının asıl yolu **mobil uygulama**; tarayıcı ikincil, ama sakat kalmaz.

- ⋯ butonu **kalıcı görünür** (dokunmatikte hover yok)
- Menü, `ContextMenuShell` içinde **alt sayfa** olarak açılır: tam genişlik, alttan yaslı, arka plan
  perdesi, güvenli alan dolgusu. İmleç konumu bu modda **yok sayılır**
- Öğe yüksekliği dokunmatik hedef için ≥44px
- ≥768'de bugünkü imleç-konumlu davranış aynen

---

## §6 Doğrulama / DoD

**Kod:**
- [ ] `vue-tsc --noEmit` temiz (hafıza: `-b` önceden var olan 6 hatayı gösterir, bu işin değil)
- [ ] `npm run build` çalışır; yeni bağımlılık **yok**
- [ ] Tüm metinler `tr.json`'da; renk/ölçü `--kv-*` token
- [ ] `ServerRail` / `ChannelPanel` / `GuildMemberRow` dosyalarında **diff yok**

**Tarayıcı (sahip):**
- [ ] DM satırına sağ-tık menüyü açıyor; ⋯ da aynı menüyü açıyor; başka menü açılınca kapanıyor
- [ ] Sustur (süre) + bildirim seviyesi seçimi anında kaydediliyor ve mobilde de görünüyor
- [ ] Sohbeti temizle menüden çalışıyor, onay diyaloğu çıkıyor, liste ve açık sohbet doğru davranıyor
- [ ] Şikâyet et hem menüden hem profil panelinden aynı modalı açıyor
- [ ] Arkadaş olmayan biriyle DM'de: ≥1280'de panelde "Kanka Ekle" var ve başlıkta **yok**;
      <1280'de başlıkta ikon var ve çift görünmüyor; arkadaşken ikisi de görünmüyor
- [ ] 1-1 DM başlığında iki metin butonu **yok**, ikon şeridi bozulmadı
- [ ] Pencereyi daraltınca (<768) ⋯ görünür kalıyor, menü alttan açılıyor, öğelere parmakla basılabiliyor
- [ ] Ekran kenarına yakın satırda menü taşmıyor

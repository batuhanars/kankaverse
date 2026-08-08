# Sprint R18 — Grup DM Menüsü: Düzenle + Grubu Sil

> **Tier:** yalnız `web/`. `api/` sıfır · `mobile/` sıfır.
> **Kaynak:** sahip 2026-08-08 — "grup DM'e sağ tıklayınca düzenleme yok, grup içinde sağ panelde
> kalmış; grubu silme de öyle. Menüde yalnız Gruptan Ayrıl var."
> **R7:** yeni yetki üretilmiyor. İki eylem de **yalnız grup sahibinde** ve kapı **sunucuda** zaten var.

---

## §0 Bugünkü durum

- `DmList.vue` bağlam menüsü grup DM'de: **Üye Ekle** · **Gruptan Ayrıl** (2026-08-03'te panelden
  buraya taşınmıştı).
- `GroupManagePanel.vue` (287 satır, grup içindeki sağ panel): üye listesi · üye çıkar (sahip) ·
  **yeniden adlandır** (sahip) · **grubu sil** (sahip).
- Uçlar hazır: `PATCH /dm/groups/:id` (ad) · `DELETE /dm/groups/:id` — ikisi de **yalnız owner**.
  Web istemcisi (`api/dm.ts`) ve store (`stores/dm.ts` `renameGroup`/`deleteGroup`) de hazır.

Yani eksik olan tek şey **menüden erişim**.

---

## §1 Kapsam

`web/src/views/home/components/DmList.vue` bağlam menüsüne grup DM için iki öğe:

1. **Düzenle** — grup ayarlarını açar (§2).
2. **Grubu Sil** — onaylı yıkıcı işlem (§3).

Sıra: Üye Ekle · Düzenle · Gruptan Ayrıl · **Grubu Sil** (yıkıcı olan en altta, ayırıcıyla).

**Kapsam dışı:** grup ikonu/avatarı · yeni ayar alanı icat etmek · mobil karşılığı · panelin yeniden
tasarımı.

---

## §2 "Düzenle" ne açar

🔴 **Yeni bir modal YAZILMAZ.** Grup ayarları yüzeyi zaten `GroupManagePanel.vue`. "Düzenle" o paneli
açar (gerekiyorsa önce gruba geçer). Sahibin sözü: *"grup ayarı açılsın, sadece başlık düzenleme var"*
— yani bugünkü ayar yüzeyi neyse o.

Gerekçe: yeniden adlandırma mantığı bugün panelde; menüye ikinci bir kopya koymak aynı işi iki yerde
tutmak olur (bu kod tabanında daha önce tam bu yüzden kusur çıktı). Panel büyüyünce menü kendiliğinden
zenginleşir.

Etiket: **"Düzenle"** (`group.renameGroup` **kullanılmaz** — o "Yeniden Adlandır" diyor). Uygun bir
anahtar yoksa `tr.json`a eklenir.

---

## §3 "Grubu Sil"

- Yalnız **sahip** görür (`ownerId === authStore.user?.id`). Sahip değilse öğe **çizilmez** —
  yetkisi olmayana pasif düğme gösterme.
- 🔴 **Onay zorunlu.** Geri alınamaz ve yalnız kendini değil **tüm üyeleri** etkiler. `DmList.vue`da
  "Gruptan Ayrıl" için zaten bir onay deseni var (`leaveGroupTarget`), aynısı kullanılır.
- Silme sonrası: açık olan grup silinense, kullanıcı o kanaldan çıkarılır (panelin `deleted` olayının
  bugünkü davranışı referans).
- Hata yutulmaz: başarısızlıkta mevcut toast deseniyle Türkçe mesaj gösterilir.

---

## §4 DoD

### Kod tarafı
- [ ] `npx vue-tsc -b` bilinen 6 hata (fazlası yok) · `npx vite build` başarılı
- [ ] `api/` + `mobile/` diffi sıfır
- [ ] Yeniden adlandırma/silme mantığı **kopyalanmadı**, mevcut store eylemleri çağrıldı

### Tarayıcıda (SAHİPTE)
- [ ] Grup sahibi olarak sağ tık → **Düzenle** ve **Grubu Sil** görünüyor
- [ ] Sahip **olmayan** üye için ikisi de **görünmüyor** (Üye Ekle · Gruptan Ayrıl duruyor)
- [ ] Düzenle → grup ayarları açılıyor, başlık değiştirilebiliyor
- [ ] Grubu Sil → onay çıkıyor; onaylayınca grup gidiyor, açıksa ekrandan çıkılıyor
- [ ] 1-1 DM'de bu iki öğe **hiç görünmüyor** (yalnız grup DM)
- [ ] Gruptan Ayrıl ve Üye Ekle **regresyonsuz**

---

## §5 Dev'e notlar

1. Panelin içeriğini taşıma/kopyalama — menü yalnız **açar**.
2. Sahip kontrolü istemcide **gizleme** amaçlıdır; kapı sunucuda (owner-only uçlar) ve orası
   değişmiyor.
3. Sözleşme dışına çıkma ihtiyacı → **DUR ve bildir.**
4. Tarayıcı testi yapma, commit atma.

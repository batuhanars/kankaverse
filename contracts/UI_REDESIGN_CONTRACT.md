# UI Redesign Contract — Özgün Tasarım Diline Geçiş (frontend-only)

> **Tek doğruluk kaynağı.** Dev session'lar buradan sapamaz. Sapma → dur, kullanıcıya bildir, PM revize eder.
> Kök `CLAUDE.md` + `web/CLAUDE.md` geçerli. Bu bir **sprint değil**, ekranlar-arası frontend re-skin/re-layout işi.
>
> **Görsel spec = `design-refs/*.png`** (kullanıcının özgün prototipleri — `anasayfa.png`, `dm-chat.png`, `sunucu-detay.png`).
> Dev bunları yerelde Read ile açıp görebilir (gitignore yalnız commit'i engeller, yerel okumayı değil).
> **Renk/şekil DAİMA `web/src/styles/tokens.css`** — tema sıcak kömür + Kor; prototip paleti bununla uyumlu.

---

## 1. Hedef & Gerekçe

Mevcut UI Discord'a yakın referansla yapılmıştı. İki sebeple özgün tasarım diline geçiyoruz:
1. **Hukuki:** Discord'un ayırt edici trade-dress'ini birebir andırma riskini sıfırlamak. (Genel sidebar+kanal+mesaj deseni endüstri standardı ve korunamaz; risk yalnız birebir klonlamada. Özgün prototipler bunu aşıyor.)
2. **Marka:** Farklılaşma brief'te rekabet avantajı — özgün görsel kimlik GTM değeri.

**Tasarım dili (prototiplerden):** sıcak kömür + Kor turuncu (korunur), yumuşak yuvarlak **kartlar**, zengin **sağ-bağlam panelleri**, dashboard-hissi anasayfa, markalı embed kartları, yuvarlak mesaj baloncukları. Terminoloji evrildi: "Alan", "Topluluk", "Kanka" (bkz. §4 açık sorular).

---

## 2. Kapsam — ÇİZGİ NET

- **Frontend-only. SIFIR backend değişikliği.** Veri aynı; sadece görünüm + yerleşim değişir. Yeni endpoint/DTO/şema YOK. (Gerekiyor sanılırsa → dur, PM'e dön; muhtemelen özellik ertelenmeli, §3.)
- **Yalnız MEVCUT özellikler** yeni dile geçer: **Home (dashboard kabuğu), DM, Sunucu detay, Auth ekranları.**
- **Anasayfa kararı (PM onaylı):** dashboard **kabuğu** + elimizdeki veri — karşılama, hızlı-aksiyonlar (Kanka Ekle / Alan Oluştur / Sunucuya Katıl), Kankalar paneli, son sunucular. Veri/özellik gerektiren bölümler **gizli ya da "yakında" stub** — **boş bölüm gösterme.**

---

## 2.5 Navigasyon Modeli (KİLİTLİ — 2026-06-12, kullanıcı mutabık)

**Karar:** Mevcut sol **`ServerRail` (72px) DOKUNULMAZ** — kalıcı sunucu switcher'ı olarak kalır
(home/DM hexagon + sunucu ikonları + "+"). **Her yerden 1-tık sunucu geçişi** korunur (çok-topluluk çekirdeği).
Redesign YALNIZ **bağlamsal alanları** kapsar:
- **İkinci kolon (bağlamsal):** home → dashboard; sunucu → kanal listesi; DM → DM listesi.
- **Ana içerik** (Kol-3) + **sağ bağlam paneli** (Kol-4).

Sonuçlar:
- **Altıgen imza KORUNUR** (ray dokunulmuyor) → §4 açık sorusu kapandı.
- Ray **yapısal/işlevsel sabit**; yeni dile yalnız **görsel uyum** (aktif/hover/unread durumları harmonize) — donuk bırakılmaz.
- Home'un ikinci kolonu **sunucu listesi OLMAK ZORUNDA DEĞİL** (sunucular ray'de) → dashboard + Kankalar yeterli; Faz 1'de netleşir.
- Prototiplerdeki "Kol-1 = uygulama-bölüm ikonları" yorumu **BENİMSENMEZ**; bizim Kol-1 = sunucu ray'i (mevcut yapı).

---

## 3. 🚫 ŞİMDİ YAPMA — Gelecek Özellik Haritası (mockup'ta var, kapsam DIŞI)

> Prototipler kuzey-yıldızı vizyonudur; aşağıdakiler ROADMAP'te kalır. Dev bunları **görsel olarak bile inşa etmez**
> (stub/gizle). Yanlışlıkla yapmak = scope creep = V1 kilidi ihlali → dur, PM'e dön.

| Mockup'taki öğe | Nereye ait | Şimdi |
|---|---|---|
| Discord'dan Aktar | Göç aracı — **Sprint 9** | Yapma (giriş noktası bile değil — kullanıcı kararı A) |
| Oyun Mağazası / Film & Dizi Kulübü / Müzik Odası / Tasarımcılar | İçerik hub'ları — **V2+/V1 dışı** | Yapma |
| Sesli Ara / ses-görüntü | **V2** (LiveKit) | Yapma (buton gösterme) |
| Keşfet / Önerilen Topluluklar | Sunucu keşfet — **V3** | Stub/gizle |
| Son Aktiviteler / aktivite feed | Presence/aktivite — **Sprint 6+** | Stub/gizle |
| Paylaşılan Medya paneli | Dosya paylaşımı — **Sprint 5** | Yapma |
| Ortak Kankalar / Ortak Sunucular paneli | Yeni sorgu gerektirir (backend) | Şimdilik yapma (frontend-only kuralı) |
| Etkinlikler (Hackathon vb.) | V1 dışı | Yapma |
| Profil Gör (zengin profil modalı) | Profil/ayarlar sprint'i | Stub (mevcut yönlendirme yeterli) |

---

## 4. Tasarım Dili / Token Deltası (Fable'a kanonik havale)

Bu redesign yeni component primitive'leri ve olası token değişiklikleri getirir. **Vault design-tokens dökümanı kanonik (Fable).**
Dev `tokens.css`'i kaynak alır; aşağıdakiler Fable ile netleşmeli:

- **Component primitive'leri** (yeni): `Card` (yuvarlak, hafif elevated), `ContextPanel` (sağ panel), `QuickActionTile`, mesaj baloncuğu (kendi mesajın Kor-vurgulu?), embed kartı. → `components/ui/` altında, token-temalı.
- **Layout shell:** ray + nav-kolon + içerik + sağ-bağlam paneli (3-4 kolon). Header yüksekliği 64px (zaten yapıldı).
- **AÇIK SORULAR (Fable + kullanıcı):**
  1. ~~İmza altıgen korunuyor mu?~~ **KAPANDI (§2.5):** ray dokunulmuyor → **altıgen KORUNUR** (brief imza öğesi yerinde).
  2. ~~Terminoloji: Sunucu→Alan/Topluluk?~~ **KARAR (2026-06-12, /kurul): "Sunucu" → "Ortam".** ("Kankaverse=sunucu" reddedildi — parça/bütün çakışması; platform=Kankaverse, birim=Ortam.) "Ortam Oluştur", "Ortama Katıl". i18n sweep gerekir (`tr.json` tüm "sunucu" → "ortam"); brief §12 marka-sesine işlenmeli (Fable). [[ui-terminoloji-kanka]]
  3. Palet/radius prototipte değişti mi yoksa mevcut token yeter mi? (İlk bakışta uyumlu; dev uygularken sapma çıkarsa bildirir.)

---

## 5. Ekran Spec'leri (görsel: `design-refs/`)

> Her ekran prototipiyle hizalanır; davranış/veri MEVCUT (yeni özellik yok). Tüm metin i18n (`tr.json`).

- **A) Shell + foundation** (önce): kart/panel/quick-action primitive'leri + 3-4 kolon layout iskeleti + header sistemi (64px). Diğer ekranlar bunun üstüne.
- **B) Anasayfa** (`anasayfa.png`): karşılama başlığı + hızlı-aksiyon kartları (Kanka Ekle/Alan Oluştur/Sunucuya Katıl — mevcut akışlara bağlı) + Kankalar sağ paneli (mevcut friends store) + son sunucular (mevcut `GET /guilds`). Keşfet/Aktivite/Önerilen → gizli/stub (§3).
- **C) DM** (`dm-chat.png`): DM liste kolonu + sohbet (mevcut mesaj bileşenleri, yuvarlak baloncuk stili) + sağ profil paneli (ad/avatar + mevcut aksiyonlar: mesaj/engelle/çıkar). Ortak Kankalar/Paylaşılan Medya → §3 stub.
- **D) Sunucu detay** (`sunucu-detay.png`): kanal listesi + mesajlar + sabitlenmiş duyuru stili + üye paneli (mevcut). Sağ sunucu-bilgi paneli temel haliyle (ad/üye sayısı); etkinlik → §3 stub.
- **E) Auth ekranları:** yeni görsel dile hafif geçiş (kart/buton/input stilleri); akış değişmez.

---

## 6. Faz Planı (öneri)

1. **Faz 0 — Foundation:** design-system primitive'leri (`Card`/`ContextPanel`/`QuickActionTile`/baloncuk) + layout shell + token netleştirme (Fable açık soruları kapanınca).
2. **Faz 1 — Anasayfa** (dashboard kabuğu).
3. **Faz 2 — DM** + **Faz 3 — Sunucu** (paralel olabilir; ortak primitive'leri kullanır).
4. **Faz 4 — Auth** cila.

> Her faz bağımsız test edilebilir/merge edilebilir. Backend'e dokunulmaz → R7 kapsamı YOK (saf görsel).

---

## 7. DoD

- [ ] Foundation primitive'leri kuruldu, tüm ekranlar onları kullanıyor (kopya stil yok).
- [ ] Home/DM/Sunucu/Auth yeni tasarım diline geçti, `design-refs/*.png` ile hizalı.
- [ ] **Sıfır backend değişikliği** (şema/endpoint/DTO aynı); yeni özellik İNŞA EDİLMEDİ (§3 haritası boş bırakıldı/stub).
- [ ] Tüm metin i18n; renk/şekil token'dan; gömülü stil/string yok.
- [ ] Mevcut akışlar (kanka ekle/DM/mesaj/engelle/sunucu) görsel değişim sonrası çalışıyor (regresyon yok).

---

## 8. Açık Sorular / Bağımlılık

- **Fable:** §4 token/dil deltası + altıgen kararı + "Alan/Topluluk" terminolojisi (brief §12) kanonik işlenmeli. Bu redesign'ı bloke etmez (dev mevcut token'la başlar; dil kararı gelince hizalar).
- **Prototip kalıcılığı:** `design-refs/*.png` gitignore'da (yerel). Bunlar artık tasarım spec'i → vault `knowledge/projects/kankaverse/design/`'a kanonik kopya önerilir (Fable). Dev erişimi için yerel design-refs yeterli.
- **Hukuki konfor (opsiyonel):** trade-dress kısa okuması KVKK danışmanından (PLAN açık kalemi) — tasarımı bloke etmez.

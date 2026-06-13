# Sprint V2 — Mesaj Markdown Biçimlendirme Sözleşmesi

> Kök + tier `CLAUDE.md`. **Tek doğruluk kaynağı bu dosya.** Yalnız `web/` (frontend). Sapma → DUR, PM'e dön.

Amaç: mesaj **gövdesinde** Discord-benzeri markdown render. **XSS güvenliği BİRİNCİ ÖNCELİK** (güvenilmeyen
kullanıcı içeriği). Mevcut **bahsetme** (`<@id>` pill) render'ıyla birlikte çalışmalı.

---

## 0. Bağımlılık (PM ONAYLI)

- `markdown-it` (+ `@types/markdown-it`) — `html: false` (ham HTML render ETME, kaçır), `linkify: true`, `breaks: true`.
- `dompurify` (+ `@types/dompurify`) — markdown çıktısını **sanitize** et (ikinci kat savunma).
- Başka markdown/sanitize bağımlılığı ekleme. (SPA — SSR yok, DOMPurify tarayıcıda çalışır.)

---

## 1. Desteklenen subset (Discord-benzeri)

`**kalın**` · `*italik*`/`_italik_` · `__altı çizili__` (opsiyonel) · `~~üstü çizili~~` · `` `satıriçi kod` `` ·
```` ```kod bloğu``` ```` · `> alıntı` · madde listesi (`- `/`* `) · numaralı liste · satır sonu (`breaks`) ·
**linkler** (otomatik linkify + `[metin](url)` maskeli). Spoiler `||metin||` opsiyonel (istersen).

- Başlık (`#`), tablo, resim (`![]()`) **KAPALI** (gürültü/güvenlik). markdown-it'te bu kuralları devre dışı bırak.
- Linkler: `target="_blank" rel="noopener noreferrer nofollow"`; yalnız `http/https` şeması (DOMPurify + markdown-it
  validateLink ile `javascript:`/`data:` reddedilir).

---

## 2. XSS güvenliği (PAZARLIK YOK)

- markdown-it `html: false` → kullanıcı HTML'i kaçırılır (render edilmez).
- Çıktı **DOMPurify** ile sanitize edilir: izinli etiket allowlist (`b,strong,i,em,u,s,del,code,pre,blockquote,ul,ol,li,a,br,p,span`),
  izinli attr (`href,target,rel,class`). Diğer her şey strip.
- `v-html` yalnız **sanitize edilmiş** string'e uygulanır. Ham içerik asla `v-html`'e girmez.

---

## 3. Bahsetme ile birlikte çalışma (KRİTİK)

`<@id>` token'ları markdown'dan ÖNCE korunmalı (markdown-it `<`/`>`'i kaçırır → token bozulur). Önerilen:
- **Ön-işleme:** `<@id>` token'larını markdown render'ından önce benzersiz bir **yer-tutucu** ile değiştir
  (çakışmayan işaretçi), markdown+sanitize sonrası yer-tutucuyu **stilli mention span**'ine çevir
  (`@kullanıcıadı`, `--kv-accent-subtle` zemin + `--kv-accent-500` ton; resolver'la çöz, çözülemeyen → `@bilinmeyen`).
- VEYA markdown-it inline kuralı/eklentisiyle `<@id>` → mention token → span.
- Mention render'ı **görsel** (stilli span yeterli — şu anki pill de etkileşimsiz). Resolver mevcut `mentionResolver`/üye
  kaynağından gelir.
- Sonuç: bir mesajda hem `**kalın**` hem `@kullanıcı` doğru ve güvenli render olur.

---

## 4. Nerede uygulanır / uygulanmaz

- **Uygulanır:** `MessageRow` ana mesaj **gövdesi** (guild + DM + grup — ortak bileşen).
- **Uygulanmaz (düz metin kalır):** DM listesi önizleme · pins/arama sonuç özetleri · yanıt-bandı/alıntı snippet'i
  (bunlar `formatMentionsPlain` ile düz kalır — markdown render etme, kısa özet bağlamı). Compose textarea düz yazılır
  (WYSIWYG yok; render yalnız gönderilmiş mesajda).
- `whitespace-pre-wrap break-words` davranışı korunur (kod bloğu/satır sonu bozulmasın).

---

## 5. Kabul kriterleri

- [ ] `markdown-it`+`dompurify` kurulu; ortak render util (`utils/markdown.ts` veya composable): `renderMessageHtml(content, resolver)` → sanitize edilmiş güvenli HTML (mention span'leri dahil).
- [ ] Subset (§1) render olur; başlık/tablo/resim kapalı; linkler güvenli (yeni sekme + rel + şema kontrolü).
- [ ] XSS: `<script>`, `<img onerror>`, `javascript:` link, ham HTML → **render edilmez/sanitize**. (Birkaç manuel örnek dene.)
- [ ] `<@id>` + markdown aynı mesajda doğru; mention stilli + güvenli.
- [ ] Önizlemeler (DM/pins/arama/yanıt) düz kalır — markdown sızmaz.
- [ ] `web` build TEMİZ.

## 6. Kapsam dışı
- WYSIWYG/toolbar · resim/tablo/başlık · spoiler tıkla-aç (statik gösterilebilir) · syntax highlight (kod bloğu düz mono). Sonraki dalga.

# SPRINT C25: Mesaj kutusuna yapıştırarak ve sürükle-bırakla dosya ekleme (web + masaüstü)

> Durum: **TASARIM KİLİTLİ (2026-10-27).** PM compose (Opus). Sahip isteği. **Yalnız web** (masaüstü Electron aynı
> web'i yükler; gerekirse `desktop/` tek koruma). **R7-nötr:** yükleme hattı, kapılar, tür/boyut sınırları değişmez;
> yalnız iki yeni giriş noktası.

---

## §0 Kararlar
1. **Yapıştırma:** mesaj kutusunda Ctrl+V (Cmd+V) sırasında panoda **dosya** varsa (ekran görüntüsü = `image/png`,
   kopyalanan dosya) varsayılan yapıştırma engellenir ve dosya bugünkü ek akışına girer (`composeFile = file` →
   `AttachmentComposeModal`). Panoda yalnız metin varsa davranış **değişmez**. Dosya ve metin birlikteyse dosya kazanır.
2. **Sürükle-bırak:** dosya mesaj alanının (liste + kutu) üstüne sürüklenince alanı kaplayan yarı saydam katman +
   "Dosyayı bırak, gönderelim" yazısı. Bırakınca aynı akış. Dosya olmayan sürüklemeler (metin, bağlantı) katman açmaz.
   Katman, imleç alandan çıkınca kapanır (iç içe öğelerde titremesin: sayaç ya da `relatedTarget` kontrolü).
3. **Tek dosya:** web eki bugün tek dosyalık. Birden fazla dosya yapıştırılır/bırakılırsa **ilki** alınır ve kısa bilgi
   gösterilir: "Şimdilik tek dosya gönderebilirsin".
4. **Tür/boyut:** bugünkü seçicinin kabul ettiği türler (`ATTACHMENT_ACCEPT` kaynağı) dışında bir dosya gelirse mevcut
   tür hatası metni gösterilir; sunucu yine otoritedir.
5. **Kapsam:** kanal mesaj kutusu (`MessageArea.vue`) **ve** DM kutusu (`DmConversation.vue`). Düzenleme modunda
   yapıştırma/bırakma dosya almaz (metin yapıştırma normal).
6. **Rule of Three:** dosya alımı (seçici + GIF + yapıştırma + bırakma) iki bileşende kopyalanıyor ve şimdi dördüncü
   girişi alıyor → tek composable'a çıkar (`web/src/composables/useComposerFileIntake.ts` gibi): dosyayı doğrula, tek
   dosya kuralı, `composeFile`e yaz. Bileşenler yalnız bağlar.
7. **Masaüstü (Electron):** pencereye alan dışında dosya bırakılınca Electron dosyaya **gitmemeli** (varsayılan
   davranış sayfayı terk eder). Masaüstü kabuğunda `will-navigate` koruması YOK (PM kontrol etti), bu yüzden web
   tarafında oturum açık uygulama kabuğunda `window` seviyesinde dosya `dragover`/`drop` varsayılanı engellenir.
   `desktop/`a dokunulmaz (genel `will-navigate` koruması ayrı borç).

**OUT:** çoklu ek · mobil (yapıştırma/sürükleme mobilde ayrı konu) · yeni tür.

## §1 DoD
- `vue-tsc -b` (bilinen 6 hata dışında yeni yok), lint, `vite build`.
- Sahip turu: ekran görüntüsü → Ctrl+V → ek penceresi; dosya sürükle → katman → bırak → ek penceresi; metin
  yapıştırma bozulmadı; masaüstü uygulamasında alan dışına bırakınca sayfa gitmiyor.

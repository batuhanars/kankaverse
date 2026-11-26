# SPRINT C77: Silinmiş kanalın Welcome'ı şifrelemeyi kilitlemesin

> Durum: **AÇIK (2026-11-26).** PM compose (Opus). api + web + mobile. **R7 (E2EE):** dev commit ETMEZ; diff PM'e, PM sahibe.
> Native değişiklik yok.

## §0 Sahip bulgusu ve kök neden (2026-11-26, kanıtlı)
Telefonda tüm şifreli sohbetler kilitlendi: gelen mesaj "bu cihaz eklenmeden önce gönderildi", gönderim "Kanal bulunamadı".
- Logcat (C77 teşhis etiketiyle): `[E2EE] başlatılamadı AxiosError 404 CHANNEL_NOT_FOUND GET /e2ee/channels/<id>`; her
  `kanal açılamadı` aynı silinmiş kanal kimliğiyle.
- DB: telefonun cihazına 8 teslim edilmemiş Welcome, hepsi C75 testinde 1 dk içinde reddedilen/silinen istek kanallarına ait;
  arkalarında silinmemiş gerçek bir sohbetin Welcome'ı (epoch 60) bekliyor.
- Mekanizma: istek kanalı kurulurken alıcının cihazları gruba eklenir ve Welcome bırakılır. Kanal soft-delete olunca
  (istek reddi, sıfırlama) Welcome sunucuda kalır. İstemci bekleyen Welcome'ları sırayla işlerken silinmiş kanalın durumunu
  ister, `channels.access` 404 döner ve **bu tek hata `onWelcome`'u ve sonraki kanal açılışlarını durdurur**. Bir sohbetin
  sorunu tüm sohbetleri kilitler.
- Anlık veri düzeltmesi sahibe verildi (silinmiş kanallara ait teslim edilmemiş Welcome'lar silindi, tüm kullanıcılar).

## §1 api
- **Kaynakta temizlik:** bir kanal soft-delete edildiğinde (`deletedAt` set eden tüm yollar: `rejectMessageRequest`, grup DM
  silme, ortam kanalı silme, varsa diğerleri; dev grep ile listeler) o kanalın **teslim edilmemiş** `E2eeWelcome` kayıtları
  aynı işlemde silinir. Ortak bir yardımcıyla; her yere kopya sorgu yazılmaz.
- **Savunma:** bekleyen Welcome listesini dönen uç (istemcinin `onWelcome` için çağırdığı) silinmiş kanallarınkileri döndürmez.
- Spec'ler: istek reddinde Welcome silinir; liste silinmiş kanalı döndürmez; silinmemiş kanalınki etkilenmez.

## §2 istemci (ortak motor `shared/e2ee-client` + web + mobile)
- **Bir Welcome'ın hatası diğerlerini durdurmaz.** `onWelcome` her Welcome'ı ayrı dener:
  - Kanal yok / erişim yok (404 `CHANNEL_NOT_FOUND`, 403): o Welcome **kalıcı olarak atlanır** (sunucuda teslim edildi
    işaretlenir ya da yerelde bir daha denenmez; mevcut "teslim edildi" ucu hangisiyse), sıradakine geçilir.
  - Ağ/5xx: o Welcome atlanır, bir sonraki tetiklemede yeniden denenir; diğerleri işlenmeye devam eder.
- **Kanal açılışı da aynı ilke:** bir kanalın `open` hatası motoru kilitlemez; yalnız o kanal "açılamadı" kalır.
- Sıralama kuralı (Welcome mesajdan önce) korunur: aynı kanal içinde sıra bozulmaz.
- **Teşhis etiketi kalıcı:** mobil `e2eeErrorTag` (hata adı + HTTP durumu + makine kodu + istek yolu; içerik yok) mevcut
  E2EE hata loglarında kalır (C77 teşhisinde yazıldı). Web'de E2EE hata logları da aynı içeriksiz etiketi kullanır.
- Testler: motor birim testi (vitest, `shared/e2ee-client` mevcut test düzeni): biri 404 veren üç Welcome'dan diğer ikisi
  işlenir; 404 olan bir daha denenmez; 5xx olan sonraki çağrıda yeniden denenir.

## §3 Kapsam dışı
Silinmiş kanalın yerel grup durumunun temizlenmesi (yer kaplar, zararsız). İstek kanalında Welcome'ı kabule dek erteleme.

## §4 Doğrulama
- api: `tsc -p tsconfig.build.json`, ilgili jest.
- shared: e2ee-client testleri. web: `vue-tsc -b` (bilinen 6), eslint (dokunulan), `vite build`, vitest. mobile: `typecheck`, eslint,
  varsa `test:e2ee`.
- **Sahip cihaz turu:** (1) aarslana istek atar, Batuhan reddeder; telefon kapalıyken. (2) Telefonu aç: bthnarsln sohbeti
  normal, mesaj gider/gelir, logcat'te kilitleyen hata yok. (3) Aynısını sıfırlama betiğiyle silinen kanalla tekrar.

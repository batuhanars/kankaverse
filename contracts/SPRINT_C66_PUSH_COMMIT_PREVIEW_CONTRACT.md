# SPRINT C66: Üye değişikliğinden sonra grup push önizlemesi (commit push'un içinde)

> Durum: **KİLİTLİ (2026-11-13, kurul ⚠ ŞARTLI ONAY + sahip onayı).** PM compose (Opus). api + e2ee-client + mobile.
> 🔴 **R7 (E2EE):** bildirim yolunda commit işleme. Sahip satır satır incelemeden main'e girmez.

## §0 Sorun
Üye ekleme/çıkarma commit'inden sonra gelen grup DM push'u telefonda "Yeni mesaj" çıkıyor; uygulama açılınca
düzeliyor. Bildirim yolu ağsız (E3 §9, MIUI ~2 sn); yerel grup eski epoch'ta, yeni epoch mesajı çözülemiyor.
Ölçüm (canlı, 91 commit): ham boyut ort 926 B, p90 1183 B, max 3355 B.

## §1 Kurul şartları (değişmez)
1. **Ayrı kod yolu, kalıcı yazma YOK:** bildirim önizlemesinde commit'ler yalnız bellekteki TAZE bir grup kopyasına
   uygulanır; grup durumu, mesaj kaydı, cihaz satırları, uyarılar DEPOYA YAZILMAZ. Mevcut `Hydrator.decrypt`
   (her çözmede `saveGroup`) bu yolda KULLANILMAZ. Kopya, depodaki baytlardan yeniden çözülerek kurulur (depo nesne
   önbelleği varsa paylaşılan nesne kullanılmaz). Test: önizleme öncesi/sonrası depodaki grup ve tüm kayıtlar bayt bayt aynı.
2. **Sınır:** push'a yalnız son **30 dakikada** oluşmuş, en çok **2** commit girer (en yeniden geriye, sığdığı kadar).
3. **Sıralı epoch:** commit'ler yerel epoch'tan başlayarak kesintisiz sırayla uygulanır; ilk commit yerel epoch'a
   eşit değilse ya da arada boşluk varsa HİÇBİRİ uygulanmaz (bugünkü genel metin).
4. **Süre:** Redmi'de soğuk açılışta önizleme toplamı ≤ 1 sn hedef; mevcut `push-step` metrikleriyle ölçülür
   (yeni adım adları: `commit-apply`, toplam). Aşılırsa sahibe raporlanır (kurul tetiği).
5. **Dışarıda kalma logu:** sunucu, commit'i boyut yüzünden push'a koyamadığında sayaç/log (içerik yok, yalnız boyut).
6. Hızlı cevap (ağsız şifreleme) bu yolu KULLANMAZ; kalıcı gruptan ve mevcut kapıyla devam eder. Tanınmayan cihaz
   alarmı ağsız yolda verilmez; uygulama açılınca normal çevrimiçi yol tam doğrulamayla commit'leri işler.

## §2 Sunucu (api/)
- `V2E2eePayload`'a isteğe bağlı `commits?: { epoch: number; commit: string /* base64 */ }[]` (epoch ARTAN sırada;
  `epoch` = commit'in UYGULANDIĞI epoch, `E2eeHandshake.epoch` ile aynı anlam).
- Grup DM şifreli mesaj push'u kurulurken: o kanalın `createdAt >= now - 30 dk` olan en yeni 2 `E2eeHandshake`
  satırı alınır; base64'lenir; push verisinin JSON boyutu (FCM data, tüm alanlar) **3800 bayt** altında kalacak şekilde
  en yeniden geriye eklenir; sığmayan atlanır (§1.5 logu). 1-1 DM'de de aynı kural geçerli (commit varsa).
- Push alıcıları değişmez (çıkarılan cihaza push zaten gitmez).
- Testler: 30 dk dışı commit girmez; en çok 2; boyut sınırı (sığmayan atlanır, log); artan epoch sırası; commit yoksa
  alan yok; düz içerik ASLA.

## §3 e2ee-client (shared/e2ee-client)
- Motora yeni ağsız uç: `previewWithCommits(msg, commits)` → `NotificationPreview`. Kuyruktan geçer (`run`).
  Akış: önce mevcut `decryptOffline(msg)`; sonuç `unavailable` DEĞİLSE onu döner (bugünkü yol, aynen). `unavailable`
  ve commit varsa: depodan grup baytlarını oku, YENİ grup nesnesi kur, §1.3 kuralıyla commit'leri sırayla uygula
  (e2ee-core'da commit uygulayan mevcut fonksiyon; `guardUntrusted`/`observeLeaves`/`saveGroup` YOK), mesajı çöz,
  `{ kind: 'text', body }` dön; her hata `unavailable`. Hiçbir depo yazımı yok.
- İptal cihaz kuralı (`hidden`) önbellek görünümüyle aynen uygulanır.
- Testler (flow suite): üye ekle → yeni epoch mesajı + push commit'iyle ağsız önizleme metni doğru; depo bayt bayt
  aynı (grup + mesaj kaydı yok); sonra çevrimiçi `hydrate` aynı mesajı normal yoldan çözer (anahtar tüketilmemiş);
  boşluklu commit listesi → `unavailable`; yanlış epoch → `unavailable`; commit olmadan bugünkü davranış aynen;
  ağ portu çağrılırsa test hatası.

## §4 Mobil (mobile/)
- `e2eePayload.ts`: `commits` alanını ayrıştır (doğrulama: dizi, en çok 2, epoch sayı, commit string).
- `offlineDecrypt.ts`: `decryptOfflineForPush` motorda `previewWithCommits`'i çağırır; metrik `[E2EE] push-decrypt-offline`
  aynen + `commit-apply` adım süresi. İçerik/yük loglanmaz.
- Bildirim çizimi ve hızlı cevap akışı değişmez.

## §5 Doğrulama
api: jest, tsc build. e2ee-client: vitest (tüm), tsc. mobile: tsc (4 bilinen), eslint dokunulan, `npm run test:e2ee`.
**Cihaz turu (Redmi, uygulama kapalı):** Kaan gruba Ayla'yı ekler → hemen Kaan mesaj atar → Redmi bildiriminde
mesaj METNİ görünür ("Yeni mesaj" değil). Çıkarınca da aynı. adb logcat'te `push-decrypt-offline` + `commit-apply`
süreleri; toplam ≤ 1 sn. Uygulama açılınca sohbet normal, "tanınmayan cihaz" uyarısı yok.

## §6 Yeniden değerlendirme tetikleri (kurul)
Dışarıda kalma oranı > %20; Redmi'de süre > 1 sn; grup DM üye sınırı büyütülürse.

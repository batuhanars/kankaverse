# SPRINT D108: Oturum yenileme yarışı ve kaybolan cevap

> Durum: **KİLİTLİ (2026-11-13, sahip onayı, 3. madde dahil).** PM compose (Opus). api + web. Mobil ayrı adım (§6).
> 🔴 **R7 bölgesi, tamamı** (auth/oturum). Sahip satır satır incelemeden main'e girmez.

## §0 Sorun (E2 cihaz turu, 2026-11-13)
Ayla'nın Opera oturumu kullanıcı çıkış yapmadan düştü; oturum zinciri bitince E2EE cihazı iptal edildi, grup DM'de "Bu cihaz bu sohbetten çıkarıldı". Sayfa giriş ekranına da gitmedi. Teşhis (kod kanıtlı): (a) iki sekme aynı refresh çerezini aynı anda kullanınca kaybedene dönen "az önce yenilendi" 401'i istemci kesin red sayıyor; (b) refresh cevabı yolda kaybolursa (deploy/ağ) tarayıcı eski çerezde kalıyor, 10 sn grace dışında reuse sayılıp aile iptal ediliyor; (c) eski oturumu kapatma ile yenisini açma ayrı işlem; (d) oturum ölünce `authStore.user` dolu kaldığı için login yönlendirmesi geri dönüyor.

## §1 Sunucu (api/src/modules/auth/)
1. **Yarış kodu:** grace içinde (geçerli imza, oturum `revokedAt` son 10 sn içinde, aile iptal değil) gelen refresh artık 401 `INVALID_REFRESH` DÖNMEZ; §1.2 uygulanır. Grace dışı reuse → bugünkü gibi aile iptali + `REFRESH_REUSE_DETECTED`.
2. **Grace'te yeni çocuk oturum:** grace içindeki ikinci kullanım aynı `tokenFamily`'ye bağlı yeni bir oturum açar ve yeni access + refresh çifti döner (çerez yeni refresh'e yazılır). Grace penceresi 10 sn kalır. Güvenlik bedeli (sahip kabul etti): çalınmış refresh token pencere içinde ek oturum açabilir; pencere dışı tespit zayıflamaz. Log: grace kullanımı `warn` seviyesinde (kullanıcı kimliği + aile, token değil).
3. **Atomiklik:** eski oturumun kapatılması (claim) ile yeni oturumun oluşturulması TEK `$transaction`. Süreç arada ölürse eski oturum açık kalır.
4. Aile iptali yolları (çıkış, oturum kapatma, parola, hesap silme, grace dışı reuse) ve E2EE cihaz iptali (E1 §2.6) DEĞİŞMEZ.
5. Testler: iki eşzamanlı refresh → ikisi de 200, aile canlı, iki oturum aynı ailede; grace içi ikinci kullanım 200; grace dışı reuse → aile + E2EE cihazı iptal (bugünkü test yeşil kalır); claim sonrası create hatası → eski oturum açık (tx geri alındı); mevcut auth spec'leri yeşil.

## §2 Web (web/src/api/, stores/auth.ts, AppShell, router)
1. **Kesin red listesi:** `isDefinitiveRefreshRejection` yalnız gerçekten bitmiş oturum kodlarında true (`REFRESH_REUSE_DETECTED`, `REFRESH_CHANNEL_MISMATCH`, oturum/aile yok, süresi dolmuş). Ağ hatası ve 5xx bugünkü gibi kesin değil (D97). Bilinmeyen 401'de bir kez kısa bekleyip (300-500 ms) yeniden dene, yine 401 ise kesin.
2. **Sekmeler arası tek yenileme:** refresh `navigator.locks.request('kv-refresh')` ile seri; kilidi alan sekme, başka sekmenin az önce aldığı token'ı (BroadcastChannel `kv-auth` ile yayınlanan, bellekte tutulan) kullanabiliyorsa refresh yapmaz. Yeni access token tüm sekmelere BroadcastChannel ile gider (sessionStorage'a her sekme kendisi yazar; localStorage'a token YAZILMAZ). Locks/BroadcastChannel yoksa bugünkü sekme içi davranış (geri düşme).
3. **Gerçek oturum sonu:** `kv:auth:expired` kökte bir kez dinlenir (AppShell'e bağlı değil); önce auth store temizlenir (`user = null`, token), sonra login'e yönlendirilir; login'de "Oturumun sona erdi, tekrar giriş yap" bilgisi (i18n). E2EE yerel deposu bugünkü çıkış kuralıyla aynı muameleyi görür (dev mevcut çıkış akışını teyit eder, yeni kural yazmaz).
4. `useSocket` aynı kesin red kuralını kullanır (kopya mantık değil, aynı yardımcı).
5. Testler (vitest): kod → kesin/değil tablosu; iki sekme simülasyonu (kilit + yayın) tek refresh; expired → store temiz + yönlendirme.

## §3 Doğrulama
api: spec'ler, `prisma generate` gerekmez (şema değişmiyorsa), `tsc -p tsconfig.build.json`. web: `vue-tsc -b` (6 bilinen), eslint dokunulan dosyalar, `vite build`, vitest.
**Cihaz turu (sahip):** (1) aynı tarayıcıda aynı hesapla 3 sekme aç, 20 dk açık bırak (access token süresi dolsun), sonra hepsinde işlem yap → hiçbiri çıkışa düşmez, grup DM'de gönderim çalışır. (2) Bir sekmede çıkış yap → diğer sekmeler giriş ekranına gider. (3) Deploy sırasında açık sekme → deploy sonrası oturum yaşar.

## §4 Kapsam dışı
Mobil (§6), refresh token'ın saklama yeri değişikliği, oturum süresi değişikliği.

## §6 Mobil (sonraki adım)
Headless bildirim görevi ile uygulamanın ayrı JS bağlamında aynı anda refresh yapıp yapmadığı önce doğrulanır (log); doğrulanırsa SecureStore üstünde tek yol. §1 sunucu düzeltmesi mobilin yarışını da büyük ölçüde zararsızlaştırır (grace içinde ikisi de 200).

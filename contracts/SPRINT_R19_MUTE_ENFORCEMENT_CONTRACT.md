# Sprint R19 — Susturma Gerçekten Kessin + D54

> **Tier:** yalnız `api/`. `web/` ve `mobile/` diffi sıfır.
> **Kaynak:** sahip cihaz turu 2026-08-08 — "kanalda susturma yaptım ama hâlâ kullanıcı ses açabiliyor,
> kamera açık kalmaya devam ediyor."
> **🔴 R7:** moderasyon aracının çalışmaması T&S kusurudur.

## §0 Kusur
`muteParticipant` LiveKit'e yalnız **izin** yazıyor (`canPublish:false`). Zaten **yayında olan**
track'lere dokunmuyor. Kesilmeleri LiveKit'in yan etkisine bırakılmış; sahibin turunda kesilmedi:
susturulan kullanıcı konuşmaya ve kamera yayınına devam etti.

⚠️ Aynı gün daha erken bir turda kesilmişti — yani davranış **güvenilmez**, "bazen çalışan" bir
moderasyon aracı çalışmayan bir moderasyon aracıdır.

## §1 Kapsam
1. **Sustur** → izin + **yayındaki track'leri zorla sustur**
2. **Yayını durdur** → izin + **video/ekran track'lerini zorla sustur**
3. **D54** — kanal ayarı değişince bağlı katılımcıların izinleri tazelensin
4. Testler

## §2 Zorla susturma
`RoomServiceClient.mutePublishedTrack(room, identity, trackSid, muted)` kurulu SDK'da **var**, hiç
kullanılmıyor. Desen:
- `getParticipant` ile hedefin yayınlarını al → ilgili track'ler için `mutePublishedTrack(..., true)`
- **Best-effort**: LiveKit erişilemezse sessiz geç (mevcut desen; kalıcı kayıt `mintToken`da zorlanır)
- **Sustur**: TÜM track'ler (ses + video + ekran)
- **Yayını durdur**: yalnız video/ekran; **ses KALIR** (sustur'dan farkı budur)

## §3 🔴 Susturmayı kaldırırken zorla AÇMA
`unmuteParticipant` yalnız **izinleri** geri verir. Track'leri zorla açmaz.
Gerekçe: kullanıcı susturulmadan önce mikrofonunu **kendi isteğiyle** kapatmış olabilir; sunucunun
izni geri vermesi "mikrofonunu aç" demek değildir. Yeniden yayın kararı istemcide (R16/R16m'de yazıldı,
`isMuted` tercihi korunuyor). **Bu ayrımı bozma.**

## §4 D54 — kanal ayarı değişince izinler tazelensin
`ageGated`/`mediaEnabled` değişince o an bağlı olanların LiveKit izinleri güncellenmiyor; değişiklik
yeniden bağlanınca geçerli oluyor. Kanal güncelleme yolunda bağlı katılımcılar için izinler yeniden
hesaplanıp yazılır (`resolveCanPublishSources` — R17'de paylaşıldı).
- Yalnız **GUILD_VOICE** kanalında ve yalnız ilgili alanlar değiştiyse
- Best-effort, hata toleranslı; N katılımcı = N çağrı, hata biri diğerini düşürmesin
- 🔴 Ayar **sıkılaştırıldığında** (medya kapatıldı) gecikme T&S açığıdır — asıl kazanç bu yön

## §5 DoD
- [ ] `npm run build` + `npm test` temiz; §2/§3/§4 için test var
- [ ] `web/` + `mobile/` diffi sıfır
- [ ] Sustur → hedefin sesi VE kamerası **anında** kesiliyor
- [ ] Yayını durdur → video kesiliyor, **ses sürüyor**
- [ ] Susturmayı kaldır → kullanıcı kendi isteğiyle kapatmışsa mikrofon **açılmıyor**
- [ ] Medya kapatılınca o an bağlı olanların kamerası düşüyor

## §6 Dev'e notlar
1. §3'ü atlama — "simetrik olsun" diye zorla açmak kullanıcı iradesini ezer.
2. LiveKit çağrıları best-effort; kalıcı gerçek `VoiceMute` kaydı ve `mintToken`.
3. Sözleşme dışına çıkma ihtiyacı → DUR ve bildir. Cihaz testi yapma, commit atma.

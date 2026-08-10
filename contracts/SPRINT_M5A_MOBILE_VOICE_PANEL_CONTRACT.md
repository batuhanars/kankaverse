# Sprint M5a — Mobil Ses Ekranı Alt Paneli + Sahne Temizliği + Çaldır

> **Tier:** `mobile/` (ana iş) + `api/` (tek yeni WS olayı, §4). `web/` sıfır · native diff sıfır
> → **yeni dev build YOK.**
> **Kaynak:** sahip gözlemi 2026-08-10, Discord mobil karşılaştırması (üç ekran görüntüsü: 1-1 DM,
> grup DM, ortam ses kanalı).
> **🔴 R7 yüzeyi:** §4 (Çaldır) yeni bir **bildirim tetikleyicisi** açıyor. Yeni ifşa yok ama yeni
> taciz vektörü var; merge onayı sahipte.

## §0 Bugünkü durum

1. **Grup DM'de seste olmayanlar sahnede.** `call.tsx:306-318` (M4z §E) katılmamış üyeleri soluk
   (`dimmed`) kart olarak çiziyor. Kart "odada" demek; soluk kart iki durumu (seste / seste değil)
   tek görsel dile sıkıştırıyor ve dar ekranda gerçek konuşanı aşağı itiyor.
2. **Ses ekranının kendi ayar yüzeyi yok.** Üst barda yalnız küçült · başlık · hoparlör ikonu var.
   Başlığa dokunmak DM'de sohbeti açıyor. Ses bağlamına ait hiçbir tercih tek bir yerde toplanmıyor.
3. **Sağırlaştırma mobilde yok.** Web'de var (`web/src/stores/voice.ts` `toggleDeafen`/`applyDeafen`);
   mobil store kendi başında bunu yazıyor: *"KOPYALANMADI: deafen/cihaz-seçim state'i hâlâ yok"*
   (`mobile/src/stores/voice.ts:41`).
4. **Kişi başı çaldırma yok.** Elimizdeki tek grup sinyali `voice:group_call_start` ve o **tüm**
   üyeleri çaldırıyor. Aramaya sonradan katılan biri, gelmeyen tek kişiyi çaldıramıyor.

## §1 Sahne kuralı (kalıcı karar — bir daha çevirilmeyecek)

> **Sahne yalnız ODADAKİLERİ çizer. Kimin odada olmadığı bilgisi PANELDE durur.**

`pendingMembers` bloğu (`call.tsx` iki dalda da: ızgara + tek sütun) **kaldırılır**. Kaldırılan
bilgi yok olmaz, §2'deki panele taşınır. Bu iki madde **aynı iştir**, biri diğeri olmadan
gönderilmez: kartları kaldırıp paneli yazmamak "kimi bekliyorum" bilgisini tamamen siler.

Kaldırma sonrası `alone && pendingMembers.length === 0` koşulları sadeleşir: "Tek başınasın"
bildirimi yine yalnız gerçekten yalnızken çıkar (M4z §E'nin çözdüğü çelişki geri gelmemeli).

## §2 Alt panel (yeni bileşen: `src/components/call/VoiceContextSheet.tsx`)

**Yeni sheet altyapısı YAZILMAZ** — `OutputPickerSheet` / `ParticipantModerationSheet` deseni aynen
kullanılır. Ayrı bir rota (tam ekran) **açılmaz**; ses ekranının üstünde alt panel olarak açılır.

**Giriş noktası:** üst barın sağındaki hoparlör ikonu yerine **üç nokta** (`ellipsis-horizontal`).
Hoparlör/çıkış seçimi panelin bir satırı olur (aşağıda), üst bar sadeleşir. Başlığa dokunma
davranışı **değişmez** (DM/grup DM'de sohbeti açar).

### Panel içeriği — üç bağlam

| Satır | 1-1 DM | Grup DM | Ortam ses kanalı |
|---|---|---|---|
| Başlık (ad) | karşı tarafın adı | grup adı | kanal adı |
| Alt başlık | odadakilerin adları | odadakilerin adları | ortam adı |
| **Kanal Ayarları** (>) | — | — | ✅ yalnız `MANAGE_CHANNELS` yetkisi varsa → mevcut `channel-details` |
| **Ses çıkışı** (>) | ✅ | ✅ | ✅ mevcut `OutputPickerSheet` |
| **Sağırlaştır** (aç/kapa) | ✅ | ✅ | ✅ §3 |
| **Üyeler** başlığı | "N kişi seste" | "N kişi seste" | "N kişi seste" |
| Odadakiler listesi | ✅ | ✅ | ✅ |
| Seste olmayanlar + **Çaldır** | ✅ (karşı taraf yoksa) | ✅ (kanal üyeleri) | ❌ (§6) |
| **Bir arkadaşını davet et** | — | — | ✅ yalnız `CREATE_INVITE` yetkisi varsa → mevcut `guild-invite` |

Katılımcı satırına dokunma **mevcut moderasyon sheet'ini açmaz** — moderasyon girişi bugünkü
yerinde (sahnedeki kutucuğa dokunma, M4h) kalır. İki yüzeyden aynı işi açmak bu sprintin işi değil.

### Kapsam dışı bırakılan Discord satırları (bilinçli)

- **"Sadece Videoları Göster"** — 20 kişilik odalar için var; bizim çağrılar 2-5 kişi. Olmayan derde
  çözüm konmaz (kök CLAUDE.md "boş yüzey açma" + Rule of Three).
- **"Ses Ayarları" (kişisel giriş/çıkış/gürültü ekranı)** — bizde böyle bir ekran yok. Uydurulmaz;
  satır dürüstçe "Ses çıkışı" olur ve var olanı açar.
- **"Hata Ayıklama Arayüzü"** — geliştirici satırı, ürüne girmez.

## §3 Sağırlaştır (mobilde ilk kez)

Web'deki hesabın **aynısı** taşınır, yeniden icat edilmez (`web/src/stores/voice.ts` `applyDeafen`):

- Sağırlaştır → tüm uzak ses track'leri kapatılır **ve** mikrofon susturulur.
- Kaldır → mikrofon, **sağırlaştırmadan önceki** durumuna döner (zaten susturulmuşsa susturulmuş
  kalır — web'deki `muteBeforeDeafen` bunu tutuyor, mobilde de tutulur).
- Ayrılışta (`leave`) sıfırlanır.
- `preferDeafened` (web'in `localStorage` tercihi) **kapsam dışı** — mobilde kalıcı tercih yok.

Alt kontrol çubuğuna (`CallControls`) düğme **eklenmez**; yüzey yalnız panel. Çubuk doluluğu
cihazda ayrı bir tur işi.

## §4 Çaldır — `api/` tarafı (yeni WS olayı)

### 1-1 DM: yeni uç YOK
Mevcut `voice:call_invite` yeniden gönderilir (`realtime/socket.ts` `callInvite`). Karşı taraf zaten
bu olayla çalıyor; ikinci bir yol açılmaz.

### Grup DM: `voice:group_call_ring`
`messages.gateway.ts`e eklenir. `handleGroupCallStart`in kardeşi; **kopya kapı yazılmaz**, aynı
üçlüden geçer (`NOT_GROUP` · `requireChannelAccess` · üyelik) **artı** iki ek kural:

```
payload: { channelId: string, targetUserId: string }
ack:     { ok: true } | { ok: false, error: 'NOT_GROUP' | 'FORBIDDEN' | 'RATE_LIMITED' }
yayılan: 'voice.group_call_started'  ← YENİ OLAY ADI DEĞİL (§4.1)
         yalnız targetUserId'ye, payload { channelId, by: { id, username } }
```

**§4.1 Neden aynı olay adı:** hedefteki gelen-arama akışı (`notifications/incomingCall.ts`,
`voice.group_call_started` dinleyicisi, `voice.group_call_canceled` ile susması) **zaten çalışıyor**.
Yeni bir olay adı, hedef tarafta ikinci bir akış yazmayı ve iptal ayağını yeniden kurmayı gerektirirdi
(M4z §F'nin kapattığı "ortada olmayan çağrı çalıyor" kusurunun aynısı geri gelirdi).

**🔴 §4.2 Blok kontrolü — `requireNoDmBlock` bu uçta YETMEZ.** O metot
(`shared/membership/membership.service.ts:199`) "karşı taraf"ı `findFirst` ile buluyor; 3+ kişilik bir
grupta **rastgele bir üyeyi** seçer. Tek kişiyi çaldırırken kontrol edilmesi gereken çift bellidir:
**çağıran ↔ hedef**. Bu uçta blok sorgusu doğrudan o çift için yapılır (iki yön de). Blok varsa
`FORBIDDEN` döner, sebep söylenmez (G3: engellenme bilgisi sızdırılmaz).
> Not (PM, kapsam dışı ama kayda geçsin): aynı `findFirst` zayıflığı `group_call_start`/`cancel` ve
> grup mesajı gönderiminde de duruyor. Ayrı bir borç kalemi; bu sprintte **dokunulmaz**.

**🔴 §4.3 Hız sınırı.** Aynı çağıran → aynı hedef için **60 saniyede 1**. Aşımda `RATE_LIMITED`,
istemci Türkçe mesaj gösterir. Gerekçe T&S: bu uç bir düğmeyle karşı tarafın telefonunu çaldırıyor,
sınırsız bırakılırsa taciz aracıdır. Bellekte tutmak yeterli (tek instance); yeni altyapı kurulmaz.

**§4.4 Hedef zaten odadaysa** ack `{ ok: true }` döner ama olay **yayılmaz** (boşa zil yok). İstemci
zaten odadakilere Çaldır düğmesi çizmez; bu sunucu tarafı savunma.

**§4.5 Kapsam dışı:** ortam ses kanalında çaldırma (§6), çaldırma geçmişi/log, "çaldırıldı" geri
bildirimi karşı tarafa.

## §4.6 ADDENDUM (PM, 2026-08-10 — sahip onaylı, cihaz turundan SONRA eklendi)

Cihaz turu geçti, ama tur sırasında iki eksik netleşti ve ikisi **tek değişiklikle** kapanıyor:

1. **Başarı sessiz.** Çaldır'a basınca hata varsa mesaj çıkıyor, başarı olunca hiçbir şey olmuyor —
   kullanıcı çaldırdığından emin olamıyor. (Sahip gözlemi: Discord masaüstü bu geri bildirimi
   çaldırılan avatara yanıp-sönme animasyonu koyarak veriyor.)
2. **Sunucudaki 60 sn'lik sınır (§4.3) istemcide görünmüyor.** Kullanıcı tekrar basıyor ve
   ancak hata mesajıyla öğreniyor. 1-1 DM dalında ise sunucu sınırı hiç yok (`voice:call_invite`
   hız sınırlı değil ve **öyle kalacak** — cevapsız aramayı kısa sürede tekrar denemek meşru bir
   akış, oraya sınır koymak onu bozar).

**Yapılacak (yalnız `VoiceContextSheet.tsx` + i18n):** başarılı çaldırmadan sonra o satır 60 saniye
boyunca "Çalıyor…" durumunda kalır; düğme o süre boyunca kapalıdır, süre dolunca eski hâline döner.

- Süre **satır başına** (hedef kullanıcı başına), panel kapanıp açılınca da sürmesi gerekmez —
  panel kapanınca durumun sıfırlanması kabul edilebilir (basit tutulacak, yeni store alanı AÇILMAZ).
- Bu istemci tarafı bir **görünürlük** katmanıdır, güvenlik kapısı değil: gerçek kapı sunucudaki
  §4.3. Kötü niyetli istemci zaten sınıra takılır.
- 1-1 DM dalında da aynı davranış (sunucu sınırı olmadığı için asıl faydayı orada görüyoruz:
  düğme kapalı olduğu sürece sıradan kullanıcı üst üste çaldıramaz).
- Zaten odada olan kişiye satır çizilmediği için, hedef aramaya katılırsa satır kendiliğinden
  listeden düşer — ayrı bir temizlik gerekmez.

## §5 i18n

Yeni metinler `web/src/i18n/tr.json` içinde `mobile.call.*` altına eklenir (kaynak orası, mobil
import eder — kopyalanmaz). Gereken kalemler: panel başlıkları, "N kişi seste", "Çaldır",
"Sağırlaştır" / "Sağırlaştırmayı kaldır", hız sınırı mesajı, "Ses çıkışı".

## §6 Kapsam dışı (bütün sprint için)

- Ortam ses kanalında çaldırma/davet zili — ortam üyesi ≠ arkadaş; ortam kanalında herkesi
  çaldırabilmek doğrudan spam yüzeyi. Ayrı karar konusu.
- Alt kontrol çubuğunun yeniden düzenlenmesi.
- Kişisel ses ayarları ekranı (giriş cihazı, gürültü bastırma).
- Panelden moderasyon.

## §7 DoD

### Kod tarafı
- [ ] `mobile`: `npm run typecheck` · `npm run lint` temiz
- [ ] `api`: `npm run build` · ilgili testler temiz; **Prisma şema değişimi yok** (migration yok)
- [ ] `web/` diffi sıfır (yalnız `i18n/tr.json` metin eklemesi hariç) · native diff yok
- [ ] `pendingMembers` bloğu iki daldan da kaldırıldı; "Tek başınasın" koşulu sadeleşti (§1)
- [ ] Panel tek bileşen, mevcut sheet deseni; yeni rota açılmadı (§2)
- [ ] `voice:group_call_ring` blok kontrolünü **çağıran ↔ hedef çifti** için yapıyor (§4.2)
- [ ] Hız sınırı çalışıyor ve aşımda Türkçe mesaj görünüyor (§4.3)

### Cihazda (SAHİPTE)
- [ ] Grup DM'de aramaya gir → **seste olmayanların kartı sahnede YOK**
- [ ] Üç nokta → panel alt panel olarak açılıyor (tam ekran değil), üç bağlamda da doğru başlık
- [ ] Panelde seste olmayanlar listeleniyor, "Çaldır" karşı tarafın telefonunu **çaldırıyor**
- [ ] Aynı kişiye üst üste bas → ikinci basışta Türkçe "biraz bekle" mesajı
- [ ] Engellediğin biri listede → Çaldır **çalışmıyor**, engellenme bilgisi sızmıyor
- [ ] Sağırlaştır → herkesin sesi kesiliyor **ve** mikrofonun susuyor; kaldırınca eski hâline dönüyor
      (zaten susturulmuşsan susturulmuş kalıyor)
- [ ] Ortam ses kanalında panel "Kanal Ayarları" ve "Davet et"i **yalnız yetkiliye** gösteriyor
- [ ] 1-1 DM'de Çaldır karşı tarafı yeniden çaldırıyor (mevcut gelen-arama ekranı çıkıyor)

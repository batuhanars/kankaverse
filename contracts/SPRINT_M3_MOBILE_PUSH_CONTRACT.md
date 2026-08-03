# SPRINT M3 — Mobil Push Bildirimi (uygulama kapalıyken haber almak)

> **Tek doğruluk kaynağı.** Endpoint imzası, DTO şekli, davranış buradan **sapamaz**.
> Sapma ihtiyacı → **DUR**, sahibe bildir, PM revize etsin. `TASK.md`'ye item **ekleme**.
>
> PM compose: 2026-08-03. Sahip kararı: "A seçeneği — push'u bitirelim, ses en sona."
> Delegasyon: **kod dev oturumlarına gider** ([[pm-dev-cift-yonlu-denetim]]); PM sözleşme + inceleme.

---

## §0 Bağlam — neden bu sprint var

Mobilde bildirim **rozetleri** (M2a), **tercihleri** (M2b) ve **kapsamı** (R14/R15) var. Eksik olan
tek şey en temeli: **uygulama kapalıyken hiçbir şey gelmiyor.** Kodda doğrulandı — `expo-notifications`
kurulu bile değil, `PushToken` diye bir kavram yok.

M2 üçe bölünürken "M2c = push (dev build + PushToken + gönderim)" yazılmıştı; M2c kanal detay
ekranına dönüştü ve push sırasını kaybetti. Bu sprint o borcu kapatır.

**Yan fayda:** push, **dev build** (APK) gerektiriyor. Dev build PLAN'da bekleyen iki maddeyi de
açar: (a) gezinme çubuğu ilk-açılış beyaz şeridi, (b) arka plan/reconnect davranışı doze altında.
İkisi de "Expo Go gizliyor" diye ertelenmişti.

---

## §1 Kapsam

### IN
1. `api/`: `PushToken` modeli + kaydet/sil uçları + **Expo Push API** ile gönderim (§2)
2. `api/`: gönderim **mevcut tercih zincirine tabi** — yeni bildirim kararı YAZILMAZ (§2.4)
3. `mobile/`: `expo-notifications`, izin isteme, token kaydı, bildirime dokunma → doğru ekran (§3)
4. Dev build (APK) alınması ve cihazda doğrulama (§5 — sahip adımı)

### OUT (bilinçli)
| Çıkarılan | Gerekçe |
|---|---|
| iOS / APNs | Apple hesabı ertelendi (PLAN); Android-first |
| Web push (tarayıcı) | Masaüstü zaten `useNativeNotifications` ile bildiriyor; ayrı iş |
| Zengin bildirim (görsel, hızlı yanıt, gruplama) | Önce temel akış çalışsın; cila ayrı tur |
| Bildirim sesi/titreşim özelleştirme | Sistem varsayılanı yeterli |
| Sessiz saatler / DND takvimi | Ürün kararı yok, tercih yüzeyi zaten dolu |

---

## §2 `api/`

### 2.1 Şema (additive, tek migration)

```prisma
model PushToken {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  token      String   @unique          // Expo push token (ExponentPushToken[...])
  platform   String                     // 'android' | 'ios' — bugün yalnız android yazılır
  deviceName String?                    // kullanıcıya gösterilmez; teşhis için
  createdAt  DateTime @default(now())
  lastUsedAt DateTime @default(now())

  @@index([userId])
}
```

🔴 **Token kullanıcıya bağlıdır, cihaza değil.** Aynı cihazda başka hesap açılırsa token yeni
kullanıcıya taşınır (upsert `token` üzerinden, `userId` güncellenir) — aksi hâlde **önceki
kullanıcının bildirimi yeni kullanıcının cihazına düşer.** Bu bir T&S sızıntısıdır, testte özellikle
denenir (§5).

### 2.2 Uçlar

| Uç | Gövde | Davranış |
|---|---|---|
| `POST /notifications/push-tokens` | `{ token, platform, deviceName? }` | Upsert (token unique); `userId` çağırandan. 200 + `null` |
| `DELETE /notifications/push-tokens/:token` | — | Yalnız **kendi** token'ını siler; başkasınınki için 404 (varlık sızdırma yok) |

Envelope kuralı standart. Token biçimi doğrulanır (`ExponentPushToken[...]`), geçersiz → `400`.

### 2.3 Gönderim

Yeni servis `PushService` (SharedModule): `sendToUsers(userIds, payload)`.

- Expo Push API: `POST https://exp.host/--/api/v2/push/send`, **≤100 mesaj/istek** (chunk'la)
- Yanıtta `DeviceNotRegistered` → o token **silinir** (ölü token birikmesin)
- Ağ hatası/5xx → **sessiz yut + logla**; bildirim gönderimi ana akışı ASLA bloke etmez
- Yeni bağımlılık: **yok** (fetch yeterli; `expo-server-sdk` gerekmez, gerekirse PM onayı)
- Env: `EXPO_PUSH_ENABLED` (default `false`) — kapalıyken servis no-op. `.env.example`'a eklenir

### 2.4 🔴 Nereden tetiklenir — yeni karar YAZILMAZ

Push, **kalıcı bildirim üretilen yerin yanına** takılır: `NotificationsService.create` /
`createMany` başarıyla kayıt ürettiyse aynı alıcı kümesine push gider.

Sebep: sustur/seviye/`suppressEveryone`/`suppressEvents`/`suppressRoleMentions` süzgeçlerinin hepsi
zaten o noktaya kadar uygulanmış oluyor. Push'a ayrı bir "kime gitsin" mantığı yazmak, bugün
çalışan tüm tercih tablosunun **ikinci bir kopyasını** üretir ve ilk sapmada ikisi ayrışır.

- DM mesajı için kalıcı bildirim üretilmiyorsa (bugünkü durum koddan **teyit edilecek**), DM push'u
  bu sprintte **gönderilmez** ve TASK'a not düşülür. Dev burada varsayım yapmaz, koddan okur.
- Gövde metni: kalıcı bildirimin `preview`'ı ve tipi kullanılır (yeni metin üretilmez, i18n
  sunucuda yok — istemcinin gösterdiği metinle **aynı anlamı** taşımalı)
- Payload'da `data: { type, guildId, channelId, messageId }` gider (istemci yönlendirme için)

### 2.5 Testler
- Token upsert: aynı token ikinci kullanıcıya kaydolunca `userId` **taşınır**, mükerrer satır olmaz
- `DeviceNotRegistered` yanıtı → token silinir
- `EXPO_PUSH_ENABLED=false` → hiç istek atılmaz
- Bildirim üretilmeyen alıcıya (susturulmuş) push **gitmez** (R14/R15 süzgeçleri regresyon kilidi)
- Gönderim hatası ana akışı bozmaz (bildirim yine kaydedilir)

### 2.6 🔴 DM push — R1 kapsam eklemesi (sahip kararı 2026-08-03)

İlk hâlde §2.4 "kalıcı bildirim üretilen yere takıl" diyordu; dev bunu uygularken **DM için kalıcı
bildirim hiç üretilmediğini** koddan gösterdi (`notifyDmActivity` yalnız WS eventi yayıyor). Sonuç:
push'un **en çok beklendiği yüzey** kapsam dışı kaldı. Sahip: *"push bildirim DM'i kapsamalı,
tartışmasız bir eksik."*

**Karar: DM push GÖNDERİLİR, ama kalıcı bildirim kaydı AÇILMAZ.**

Gerekçe: DM'in kendi okunmamış yüzeyi var (DM listesi + rozetler). Çana da düşerse aynı olay iki
yerde birikir ve kullanıcı ikisini ayrı ayrı temizlemek zorunda kalır. Çan bugünkü anlamını korur:
bahsetme, kanka, davet, etkinlik.

Uygulama kuralları (bağlayıcı):
- Tetik noktası DM mesajı gönderimi (`notifyDmActivity` yolu) — yeni uç yok
- Alıcılar: o DM/grup kanalının **diğer üyeleri** (yazar hariç). Kümeyi o yolun zaten hesapladığı
  yerden al, yeniden üretme
- Tercih süzgeci: **mevcut yardımcı** kullanılır (`shouldNotifyChannel` DM kanalında `guildId=null`
  ile doğru çalışıyor mu → **koddan doğrula**, çalışmıyorsa DUR ve bildir). İkinci bir süzgeç
  kopyası YAZILMAZ — R14/R15'te bunun bedeli görüldü
- Susturulmuş DM'e push **gitmez**; "Sohbeti temizle" yapmış kullanıcıya yeni mesajda gider
  (bugünkü liste davranışıyla tutarlı)
- Gövde: gönderenin adı + mesaj önizlemesi (≤100 karakter, mevcut `preview` kırpma kuralı).
  🔴 Ek yok/görsel yok: içerik önizlemesi **kilit ekranında** görünür, fazlasını taşıma
- 🔴 **R2 (cihaz turu bulgusu):** gövde **bahsetme token'ları çözülmüş** olmalı. İlk hâlde ham
  `content` gönderiliyordu ve kilit ekranında `<@cmq93ul...>` yazıyordu. Çözüm `notifyMentions`'ın
  kullandığı mantığın AYNISI olmak zorunda → ortak yardımcı (`resolveMentionPreview`), kopya değil;
  ayrışırsa aynı mesaj için iki farklı metin görünür
- 🔴 **R2 — çift bildirim:** DM mesajında **doğrudan bahsedilen** kullanıcı `sendDmPush` alıcı
  kümesinden **çıkarılır**; o kişi bahsetme yolundan zaten push aldı. Aksi hâlde telefona iki
  bildirim düşüyor (cihaz turunda görüldü). Kalıcı bildirim (çan) davranışı DEĞİŞMEZ
- `data: { type: 'DM_MESSAGE', channelId }` → istemci o sohbete gider

### 2.7 Borç kaydı — push metni iki yerde

Dev'in bulgusu: sözleşmenin "gövde = `preview`" kuralı beş bildirim tipinin üçünde çalışmıyor
(`FRIEND_*`'ta `preview` null, `GUILD_INVITE`'ta ham davet kodu). Geçici çözüm: web `tr.json`'daki
`notification.*` ifadeleri sunucuya düz metin olarak kopyalandı. **Bu bir borçtur:** aynı metin iki
yerde, ilk değişiklikte ayrışır. PLAN teknik borç tablosuna işlenir; kalıcı çözüm push metinlerini
tek kaynağa taşımak (sunucu i18n'i ya da istemcide gövde üretimi).

---

## §3 `mobile/`

- `expo-notifications` + `expo-device` kurulur (`npx expo install`)
- **İzin akışı:** oturum açıldıktan sonra istenir, açılışta değil. Reddedilirse uygulama normal
  çalışır; "boş yüzey" kuralı gereği ısrarlı ikinci sorma **yok**
- Token alınır → `POST /notifications/push-tokens`. **Çıkışta** (`logout`) `DELETE` çağrılır —
  yoksa cihazı bırakan kullanıcının bildirimleri gelmeye devam eder
- Bildirime dokunma → `data.type`'a göre yönlendirme: `MENTION` → kanal/DM · `EVENT_CREATED` →
  ortam etkinlikleri · `FRIEND_*` → ilgili ekran. Hedef çözülemiyorsa uygulamayı açmakla yetin
  (kırık navigasyon vaat etme — M2c kuralı)
- Uygulama **ön plandayken** push banner'ı gösterilmez (kullanıcı zaten içeride; rozetler var)
- `typecheck` + `lint` temiz

---

## §4 T&S / R7

**R7-hafif → PM incelemesi zorunlu.** Yeni erişim kararı yok; push mevcut bildirim kümesini
**taşıyor**. İnceleme noktaları:
1. Token devri: aynı cihazda hesap değişince eski kullanıcının bildirimi yeni kullanıcıya **düşmüyor**
2. Çıkışta token siliniyor
3. Push gövdesi, kullanıcının **görmeye zaten yetkili olduğu** önizlemeden fazlasını taşımıyor
   (özel kanal adı/mesaj içeriği kalıcı bildirimdekiyle aynı, fazlası değil)
4. Süzgeç kopyası yok (§2.4)

---

## §5 Sahip adımları (dev yapamaz)

1. **Dev build (APK):** EAS build (Expo hesabı) ya da yerel `expo run:android`. Push, Expo Go'da
   Android'de çalışmaz
2. **FCM kimlik bilgisi:** Expo Push kullanacaksa bile Android için Firebase projesi + FCM anahtarı
   Expo hesabına tanımlanmalı
3. Cihazda: bildirim izni ver, uygulamayı **kapat**, başka hesaptan bahset → bildirim gelmeli

> 🔴 Bu üç adım olmadan mobil DoD kapanmaz. `api/` tarafı bağımsız ilerleyebilir ve testleriyle
> kapanır — sıra: **api önce**, mobil dev build hazır olunca.

---

## §6 DoD

**Kod:**
- [ ] `api`: `nest build` + tüm testler yeşil + `prisma migrate status` temiz (migration UYGULANMIŞ)
- [ ] `mobile`: `typecheck` + `lint` temiz
- [ ] `web` diffi **yok** (i18n gerekirse yalnız `tr.json`)
- [ ] Yeni runtime bağımlılığı: `api` **yok** · `mobile` yalnız `expo-notifications` (+`expo-device`)

**Cihazda (sahip):**
- [ ] Uygulama kapalıyken bahsedilince bildirim geliyor, dokununca doğru kanala gidiyor
- [ ] **DM mesajı gelince bildirim geliyor**, dokununca o sohbete gidiyor; susturulmuş DM'de gelmiyor
- [ ] Susturulmuş ortam/kanaldan bildirim **gelmiyor**
- [ ] Etkinlik bildirimi geliyor, dokununca etkinlikler ekranına gidiyor
- [ ] Çıkış yapınca bildirim **kesiliyor**; aynı cihazda başka hesap açınca öncekinin bildirimi gelmiyor
- [ ] Uygulama açıkken banner çıkmıyor, rozetler eskisi gibi çalışıyor
- [ ] Dev build'de gezinme çubuğu beyaz şeridi ve reconnect davranışı gözden geçirildi (PLAN devri)

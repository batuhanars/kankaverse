# Sprint M5e — Bildirim Yığılması ve Aynı Sohbette Bildirim

> **Kaynak:** canlı kullanıcı geri bildirimi 2026-08-11 (mağaza sürümü, ekran görüntülü).
> **Tier:** bu sözleşme yalnız `mobile/`. Sunucu tarafı gerekirse **AYRI** ele alınacak (§4).
> **Kapsam:** revizyon. Yeni özellik, yeni ekran, yeni bağımlılık YOK.

## §0 Belirtiler

1. Kullanıcı **o DM'in ekranındayken bile** bildirim geliyor.
2. Bildirimler **üst üste yığılıyor**: yedi mesaj = yedi ayrı bildirim satırı. Beklenen davranış
   (kullanıcının verdiği referans WhatsApp): aynı sohbetin bildirimi öncekinin üstüne yazılır,
   gölgede tek satır kalır.

## §1 Aynı sohbetteyken hiç gösterme

`src/notifications/push.ts` — `setNotificationHandler`.

M5c §2 bu durumda `shouldShowBanner`ı `false` yapıyor ama `shouldShowList` **her zaman `true`**
kalıyor. Bu yüzden bildirim banner olarak düşmüyor ama gölgeye yine de giriyor ve yığılmaya
katkı veriyor. M5c yalnız banner'ı düşünmüştü, bu onun eksik kalan yarısı.

Yapılacak: kullanıcı o DM'in ekranındayken (`isActiveDm`) **hiçbir şey gösterilmesin** — banner da
liste de kapalı, ses zaten kapalı.

⚠️ Gelen arama dalına DOKUNMA. `isIncomingCall` mantığı ve bastırma kuralları aynen kalsın.

## §2 Sohbete girince bekleyen bildirimleri temizle

Kullanıcı bir DM'i açtığında o kanala ait **gölgede bekleyen** bildirimler düşsün. Bugün okunmuş
mesajların bildirimi gölgede kalmaya devam ediyor.

- `expo-notifications`ın sunulmuş bildirimleri okuma ve düşürme uçları kullanılacak; bildirimin
  `data.channelId` alanı eşleşenler düşürülür. **Hepsini birden silme** — başka sohbetlerin ve
  arama bildirimlerinin kaybolması kabul edilemez.
- Tetikleyici için bugün eklenen odak kancası kullanılabilir (`dm/[id].tsx`, M5d §1). Yeni bir
  yaşam döngüsü mekanizması kurma.

## §3 Yığılmayı durdur (aynı sohbet öncekinin üstüne yazsın)

Bugün ne istemcide ne sunucuda "bu bildirim şu sohbetin bildirimidir, öncekinin yerine geçsin"
diyen sabit bir kimlik yok.

🔴 **ÖNCE ARAŞTIR, SONRA YAZ.** `mobile/AGENTS.md` kuralı: Expo SDK 54'ün **sürümlü dokümanını**
(https://docs.expo.dev/versions/v54.0.0/) oku. Hatırdan API uydurma.

Cevaplaman gereken soru: Android'de aynı sohbetin bildirimini tekilleştirmenin SDK 54'te desteklenen
yolu nedir?
- Sunucudan gönderilen bir birleştirme/etiket alanı mı var (o zaman `api/` işi → §4)?
- Yoksa istemcinin bildirimi sabit bir kimlikle kendisi kurması mı gerekiyor?

**Bulgunu raporla, uygulamadan önce PM onayı bekle** eğer çözüm `api/` değişikliği ya da
veri-yalnız push gerektiriyorsa. Sebep: veri-yalnız push, D62'de tartışılan ödünleşmeye giriyor —
uygulama tamamen kapalıyken agresif pil optimizasyonlu cihazlarda (Xiaomi/Huawei) çalışacağının
garantisi yok ve bugün ÇALIŞAN bildirim yolunu riske atar.

**Tamamen istemci tarafında, JS canlıyken çalışan kısmi bir iyileştirme mümkünse** (ör. yeni bildirim
gelince aynı kanalın eski bildirimlerini düşürmek) onu §1 ve §2 ile birlikte uygula — bu, uygulama
açık/arka plandayken yığılmayı zaten bitirir. Uygulama tamamen kapalıyken kalan boşluğu raporla,
gizleme.

## §4 Sunucu tarafı — BU SPRINTTE YOK

`api/` şu anda başka bir oturumun (R20) elinde. Çözüm sunucu tarafı bir alan gerektiriyorsa
**yazma**, raporla; PM ayrı ele alır.

## §5 Doğrulama

`npm run typecheck` · `npm run lint` temiz. Cihaz doğrulaması sahipte; "çalışıyor" beyanı üretme.

## §6 Sapma kuralı

Yalnız `mobile/`. Sapma ihtiyacında DUR ve PM'e bildir.

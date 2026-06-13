# Ortam (Sunucu) Ayarları — Kademeli ROADMAP

> **Amaç:** Proje sahibinin "Discord-yakın kapsamlı ortam yönetimi" vizyonunu **kayıt altına almak** — ama V1
> iskeletini şişirmeden. Bu dosya bir **referans/yol haritasıdır**, sözleşme değil; her özellik sırası gelince kendi
> sprint contract'ıyla kilitlenir. Kaynak: PLAN.md V1 kapsam kilidi + brief §9 (bilinçli ertelemeler) + §11.2
> (kapsam kayması = walking skeleton'ın en büyük riski).
>
> **İlke:** V1 farklılaştırıcısı = **T&S**, Discord feature-paritesi değil. Genişlik kademeli gelir; olmayan özellik
> için boş UI iskelesi konmaz (UI'ı placeholder'la şişirme). Bir özellik üst-versiyona düştüyse sebebi: ya **bağımlılık**
> (örn. upload altyapısı), ya **T&S/hukuk**, ya da **iskelet riski**.

---

## V1 — Sprint 7A (AKTİF — `contracts/SPRINT_7A_CONTRACT.md`)

| Ayar | Kapsam | Yetki |
|---|---|---|
| **Ad düzenleme** | ortam adını değiştir | OWNER |
| **Yaş yönelimi** | `adultsOnly` toggle — yetişkinlere yönelik / her yaşa açık. Minör join+erişim kapısı (iki katman, R7) | OWNER |
| **Davet yönetimi** | davet oluştur (maxUses/süre) · kod/link kopyala · listele · iptal | OWNER/ADMIN |
| **"Herkese açık" hissi** | süresiz+sınırsız davet linki = kalıcı paylaşılabilir link (ayrı "public" alanı YOK) | OWNER/ADMIN |

> **Not:** Gerçek kapısız "davetsiz giriş" V1'de YOK (az önce kaldırdığımız ham-ID join'i geri getirirdi). "Public"
> = kalıcı davet linki. Gerçek **keşfedilebilir/listeye-çıkan** ortam → V3 keşfet.

## V1 — Sprint 7B (sonraki)

| Ayar | Kapsam | Not |
|---|---|---|
| **Yeni üye karantinası** | yeni üyeye süreli kısıt (`canDm`/`canSendFriendRequest` karantina hook'larını bağlar) | R7 |
| **Türkçe automod** | platform kelime-listesi, **block-on-send kayıtsız** (yasak kelime → mesaj reddedilir, kayıt/report YOK) | hukuk-nötr (sahip kararı 2026-06-13). Per-ortam özel kelime listesi → sonraya |

---

## V2 (file-sharing + temel izin sonrası)

| Özellik | Bağımlılık / Neden ertelendi |
|---|---|
| **Sunucu ikonu / banner yükleme** | **Upload altyapısı (Sprint 5: S3/presigned)** gerekir — onsuz yapılamaz |
| **Özel emoji ekleme** | Upload altyapısı + emoji picker + mesajda render. Discord-hissi nice-to-have, çekirdek değil |
| **Üye davet yetkisi** (`whoCanInvite: OWNER_ADMIN \| ALL_MEMBERS` toggle) | Basit hali V2'de mümkün; **kontrollü büyüme** duruşu gereği V1'de OWNER/ADMIN'de tutuldu |
| **Moderatör onaylı üye daveti** | Sahibin fikri (2026-06-13): üye davet eder → mod onayından geçer. **Onay kuyruğu** = moderasyon katmanı (roller + 4B). İzin matrisi + onay akışı gerektirir |
| **Kanal kategorileri / gruplama** | Kanal yönetimi UI'ı + sıralama; çekirdek mesajlaşmadan sonra |
| **İnce moderasyon ayarları** | 4B (Report/kuyruk/Action — hukuk beklemede) sonrası |

## V3 (genişleme katmanı — brief: izin matrisi + keşfet → V3)

| Özellik | Neden V3 |
|---|---|
| **Rol / izin matrisi** (granular) | "Kim davet edebilir / kim mesaj silebilir / kim kanal açar" buraya bağlanır. Brief: gelişmiş izin matrisi → V3 |
| **Ortam keşfet / listeye çıkma** | Gerçek "public discoverable" ortam. Brief: sunucu keşfet → V3 |
| **Sunucu şablonları** | Tematik ortam kurulumu |
| **Bot API** | Brief: Bot API → V3 |

---

## "Kim davet edebilir?" — kademeli görünüm (sahibin sorusu)
- **V1 (7A):** OWNER/ADMIN. (Kontrollü büyüme + çocuk güvenliği; serbest davet = risk vektörü.)
- **V2:** basit toggle "tüm üyeler davet edebilir" + opsiyonel **moderatör onaylı** üye-daveti akışı (onay kuyruğu).
- **V3:** tam rol/izin matrisinde "Davet Oluştur" izni granular role bağlanır (Discord modeli).

---

> **Sapma kuralı:** Bu roadmap bir özelliği "şimdi yap" demez. Sıradaki sprint yalnız **PLAN.md sprint haritası** +
> ilgili **contract** ile belirlenir. Buraya yeni fikir eklemek serbest (vizyon kaydı); kapsama almak = PM+sahip kararı.

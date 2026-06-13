# Kankaverse — Moderasyon Sistemi (4B): Hukuki Görüş Brief'i

> **Amaç:** Hukuk danışmanına platformun moderasyon/şikâyet sistemini ve ilgili veri-işleme kararlarını anlatıp
> görüş almak. **Bu doküman hukuki tavsiye DEĞİLDİR** — teknik bağlam + cevap bekleyen sorular. Mevzuat atıfları
> (KVKK, 5651, TCK) avukatın teyidine tabidir; eksik/yanlış olabilir, yönlendirme amaçlıdır.

---

## 1. Platform nedir? (bağlam)

- Türkiye pazarına yönelik, topluluk tabanlı **gerçek zamanlı mesajlaşma platformu** (Discord benzeri): kullanıcılar
  "ortam"lar (sunucular) kurar, kanallarda ve birebir/grup özel mesajda (DM) yazışır.
- **Reşit olmayan (18 yaş altı) kullanıcılar platformda mevcut.** Çocuk güvenliği ürünün mimari önceliği.
- **Uçtan-uca şifreleme YOK** (bilinçli karar): moderasyon ve güvenlik için içerik sunucu tarafında erişilebilir.
  Bu, gizlilik politikasında şeffafça belirtilecek. Yani platform işletmecisi, gerektiğinde içeriği görebilir.
- Hedef: KVKK uyumu + verilerin Türkiye'de barındırılması.

## 2. Ne inşa ediyoruz? (moderasyon sistemi — sade anlatım)

Kullanıcıların kötüye kullanımı **bildirebildiği** ve ekibin **müdahale edebildiği** bir sistem:

1. **Şikâyet (Report):** Bir kullanıcı; bir mesajı, başka bir kullanıcıyı veya bir kanalı şikâyet eder (taciz, spam,
   şiddet, çocuk güvenliği, nefret vb. sebeplerle).
2. **Kanıt anı (snapshot):** Şikâyet anında, şikâyet edilen içerik ve çevresindeki bağlam **sunucuda kaydedilir** —
   ki moderatör olayı sonradan görebilsin (kullanıcı mesajı silse bile kanıt kalsın).
3. **Öncelikli inceleme kuyruğu:** Şikâyetler önem sırasına göre dizilir; **çocuk güvenliği / istismar içeriği en
   yüksek öncelik** (hedef: dakikalar içinde insan moderatör).
4. **Moderasyon aksiyonu:** uyarı / susturma / kanaldan-ortamdan atma / kalıcı yasaklama / içeriği kaldırma.
5. **Denetim kaydı:** Hangi moderatör hangi eylemi ne zaman yaptı — değiştirilemez kayıt (hesap verebilirlik için).

## 3. Hukuki görüş bekleyen sorular

> Bunlar sistemi tasarlarken cevabını avukattan almamız gereken kritik kararlar. Her birinde bir **denge/gerilim** var.

### S1 — Kanıt ne kadar saklanır, ne kadar veri yakalanır?
Şikâyet edilen içeriği **kanıt** olarak tutmamız lazım (moderasyon kararı + olası hukuki süreç için). Ama KVKK'nın
**veri minimizasyonu** ilkesi gereksiz/aşırı saklamayı sınırlıyor. Gerilim: kanıt ihtiyacı ↔ veri minimizasyonu.
- Hangi veriyi yakalayabiliriz? (yalnız şikâyet edilen mesaj mı, çevresindeki mesajlar + kullanıcı bilgisi de mi?)
- Ne kadar süre saklayabiliriz? Şikâyet çözülünce **silmeli** miyiz, yoksa belirli bir süre (kaç gün/ay?) tutmalı mıyız?
- Hukuki dayanağımız ne olur? (açık rıza / meşru menfaat / yasal yükümlülük)

### S2 — Reşit olmayan (çocuk) verisi için ek koruma gerekir mi?
Minörlerle ilgili şikâyetler/kayıtlar **çocuk verisi** içerir. 
- KVKK'da çocuk verisi ve/veya **özel nitelikli kişisel veri** kapsamı bu kayıtlara nasıl yansır?
- İşleme, saklama ve erişim için ek güvenlik/sınırlama önlemleri (kimler görebilir, ne kadar tutulur) gerekir mi?

### S3 — 🚨 ÇOCUK İSTİSMARI İÇERİĞİ (CSAM) — en kritik, ayrı süreç
Bu içerik moderasyon kuyruğunda **serbestçe görüntülenemez/saklanamaz** (hem hukuki hem etik). Bunu uzman + hukuk
olmadan tasarlamadık — bilinçli boş bıraktık.
- TR hukukunda böyle bir içerik tespit edilince **yükümlülüklerimiz** neler? **Kime, nasıl bildirim** yaparız
  (kolluk / BTK / ilgili merci)? Bildirim zorunlu mu, süresi var mı?
- İçeriği **kanıt** olarak nasıl ele alırız? Saklamak başlı başına suç riski taşır mı; silmek **kanıt karartma** sayılır mı?
  Bu ikisi arasında yasal güvenli yol nedir?
- İçeriğe **kim erişebilir** (moderatörün ham içeriği görmesi sorun mu)? 
- **Hash-eşleme** araçları (içeriği görüntülemeden, bilinen istismar içeriği parmak-izleriyle eşleştirme — uluslararası
  veritabanları) TR'de kullanımı uygun mu / önerilir mi?
- Otomatik tespit + insan inceleme dengesi ne olmalı?

### S4 — 5651 yükümlülükleri ve yetkililere veri paylaşımı
- 5651 sayılı kanun kapsamında **yer sağlayıcı / içerik sağlayıcı** olarak yükümlülüklerimiz neler?
- **Trafik/erişim loglarını** ne kadar süre saklamak zorundayız? Hangi formatta?
- **Kolluk/mahkeme talebi** geldiğinde veri paylaşım prosedürü nasıl olmalı? (kim onaylar, ne paylaşılır)
- İçerik kaldırma (takedown) talebi yükümlülükleri?

### S5 — Silme hakkı (KVKK) ile kanıt saklama (legal-hold) çatışması
- Kullanıcı KVKK kapsamında **hesabını/verisini silmek** isterse, ama hakkında **moderasyon kaydı / şikâyet kanıtı**
  varsa ne olur? Şikâyet edilen kişi hesabını silerse, kanıtı (snapshot/denetim kaydı) **korumalı (legal-hold)** mıyız?
- Silme hakkı ile kanıt/yasal saklama yükümlülüğünü nasıl dengeleriz? (Sistemde hesap silmeyi 30 gün geciktiren bir
  mekanizma + "legal-hold" kancası zaten kurulu; nasıl kullanmalıyız?)

### S6 — Denetim kaydı (moderasyon log'u) saklama + değişmezlik
- Moderasyon eylem kayıtlarını **ne kadar** tutmalıyız?
- Kayıtların **değiştirilemez (tamper-proof)** olması yasal olarak gerekli/önerilir mi?

### S7 — Kalıcı yasaklama (ban) ve "kutsal değerlere hakaret" politikası
Platformda ağır ihlaller (örn. kutsal değerlere/inançlara ağır hakaret, nefret söylemi) için kullanıcıyı **kalıcı
yasaklama** düşünüyoruz (otomatik filtre + **insan onayı** ile; otomatik geri-dönülmez ban yapmıyoruz).
- Kullanıcıyı kalıcı yasaklamanın yasal zemini ne olmalı (Kullanım Şartları / sözleşme dayanağı)?
- **İtiraz hakkı** / şeffaflık yükümlülüğü var mı? Ban kararının kaydını saklamak KVKK açısından nasıl ele alınır?
- "Kutsal değerlere hakaret"i yasaklı davranış olarak tanımlamanın hukuki sınırları (ifade özgürlüğü dengesi) nedir?

## 4. Lansman öncesi gereken hukuki çıktılar (avukattan beklentimiz)

Görüşün yanında, platformu canlıya almadan önce muhtemelen şu belgelere/işlemlere ihtiyacımız olacak — avukatın
teyidi/hazırlığı için:
- **KVKK Aydınlatma Metni** + (gerekiyorsa) **Açık Rıza** metinleri
- **Gizlilik Politikası** (E2EE olmadığını, içeriğin moderasyon için erişilebilir olduğunu şeffafça anlatan)
- **Kullanım Şartları (ToS)** — yasaklı davranışlar + ban/itiraz prosedürü
- **VERBİS** (Veri Sorumluları Sicili) kaydı gerekli mi?
- **Veri saklama / imha politikası** (S1-S6 cevaplarına göre)
- CSAM için **bildirim prosedürü** (S3)

## 5. Avukata sorulacak özet (tek cümlelik liste)

1. Şikâyet kanıtını ne kadar/nasıl saklarız (KVKK veri minimizasyonu)?
2. Çocuk verisi ek koruma gerektirir mi?
3. CSAM: bildirim yükümlülüğü + saklama/erişim/hash-eşleme — güvenli yol?
4. 5651: log saklama süresi + kolluk paylaşım prosedürü?
5. Silme hakkı vs kanıt saklama (legal-hold) dengesi?
6. Denetim kaydı saklama + değişmezlik gereği?
7. Ban: yasal zemin + itiraz hakkı + "kutsal değer" politikasının sınırı?
8. Lansman için hangi belgeler (aydınlatma/rıza/gizlilik/ToS/VERBİS) zorunlu?

---

> Avukat bu soruları cevaplayınca: cevaplar `contracts/SPRINT_4B_CONTRACT_DRAFT.md` §3'e işlenir, taslak kilitlenir
> (kapsam netleşir), sonra R7 (satır-satır güvenlik incelemesi) ile 4B geliştirilir. CSAM muhtemelen kendi ayrı
> mini-akışına bölünür (uzman süreciyle).

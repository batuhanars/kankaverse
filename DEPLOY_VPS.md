# Kankaverse — VPS Deploy Runbook (tam self-host, Docker + Caddy)

> Hedef: Turhost VPS (Ubuntu 24.04, panelsiz) üzerinde **Postgres + Redis + API + web + Caddy** tek
> `docker-compose.prod.yml` ile. Ağır yük dışarıda (ses/video = LiveKit Cloud, dosya = R2 — yükleme açılınca).
> Domain: `kankaverse.com` → web · `api.kankaverse.com` → API (aynı kök → cookie `sameSite=lax`).
> Mevcut Railway(api)+Vercel(web) bunun yerini alır → §12'de devre dışı bırakılır.
>
> **Komutlar VPS'te (SSH) çalışır.** `$` = senin makinende, `#` = VPS'te (sudo'lu kullanıcı).

---

## 0. Ön koşullar (elinde olmalı)
- VPS IP adresi + ilk SSH erişimi (Turhost root parolası veya panel SSH).
- Domain DNS yönetimi (Turhost — kankaverse.com).
- **LiveKit Cloud** API key/secret/url (mevcut).
- **Resend** API key + doğrulanmış gönderen alan (`noreply@kankaverse.com`).
- Repo erişimi (private → GitHub deploy key veya PAT).

---

## 1. İlk bağlantı + sunucu sertleştirme (güvenlik — atlanmaz)

```bash
$ ssh root@VPS_IP                       # ilk giriş (Turhost verdiği parola)

# Güncelle
# apt update && apt upgrade -y

# Sudo'lu kullanıcı oluştur (root ile çalışma)
# adduser batuhan
# usermod -aG sudo batuhan

# SSH anahtarını kopyala (KENDİ makinenden, AYRI terminal):
$ ssh-copy-id batuhan@VPS_IP            # anahtarın yoksa: ssh-keygen -t ed25519

# Yeni kullanıcıyla gir, root/parola login'i KAPAT:
$ ssh batuhan@VPS_IP
# sudo nano /etc/ssh/sshd_config   →   PermitRootLogin no   +   PasswordAuthentication no
# sudo systemctl restart ssh

# Firewall: yalnız SSH + HTTP + HTTPS
# sudo ufw allow OpenSSH
# sudo ufw allow 80/tcp
# sudo ufw allow 443/tcp
# sudo ufw --force enable

# Otomatik güvenlik güncellemeleri (opsiyonel ama önerilir)
# sudo apt install -y unattended-upgrades && sudo dpkg-reconfigure -plow unattended-upgrades
```

> **Not:** `ssh` servisinin adı bazı imajlarda `ssh`, bazılarında `sshd`. Restart komutu hata verirse `sudo systemctl restart sshd`.

---

## 2. Docker + Compose plugin kur

```bash
# Resmi Docker deposundan (Ubuntu 24.04)
# sudo apt install -y ca-certificates curl
# sudo install -m 0755 -d /etc/apt/keyrings
# sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
# sudo chmod a+r /etc/apt/keyrings/docker.asc
# echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list
# sudo apt update
# sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Kullanıcıyı docker grubuna ekle (sudo'suz docker)
# sudo usermod -aG docker $USER
# → çık-gir (yeni grup aktif olsun): exit, sonra tekrar ssh

# Doğrula
# docker --version && docker compose version
```

---

## 3. Repo'yu çek

```bash
# GitHub'a deploy key ile (önerilir) veya HTTPS + PAT:
# git clone https://github.com/batuhanars/kankaverse.git
# cd kankaverse
```

> Private repo: HTTPS klonda kullanıcı adı + **Personal Access Token** (parola değil) sorar; ya da
> `ssh-keygen` ile VPS'te anahtar üretip GitHub repo → Settings → Deploy keys'e ekle, sonra SSH URL ile klonla.

---

## 4. Prod env dosyasını doldur

```bash
# cp .env.production.example .env.production
# nano .env.production
```

Doldurulacaklar (üreteç komutları):
```bash
# Güçlü parola / secret üret:
# openssl rand -base64 48      → JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, POSTGRES_PASSWORD
# openssl rand -base64 32      → TOTP_ENC_KEY (TAM 32 byte olmalı — bu komut doğru verir)
```
- `POSTGRES_PASSWORD` aynı değeri **`DATABASE_URL` içine de** yaz (`...:PAROLA@postgres:5432/...`).
- `FRONTEND_URL=https://kankaverse.com` (slash'sız), `VITE_API_URL=https://api.kankaverse.com`.
- `RESEND_API_KEY`, `EMAIL_FROM`, `LIVEKIT_*` doldur.
- **İlk deploy'da `REGISTRATION_MODE=open` bırak** (bootstrap için — §8'de açıklanıyor).
- `UPLOADS_ENABLED=false`, `CAMERA_ENABLED=false`, `SCREEN_ENABLED=false` (önkoşullar gelene dek).

`Caddyfile`'daki e-postayı kendi adresinle güncelle (Let's Encrypt bildirimi):
```bash
# nano Caddyfile    → email satırı
```

---

## 5. DNS — A kayıtları (TLS'ten ÖNCE; Caddy ACME bunu bekler)

Turhost DNS yönetiminde, hepsi **VPS IP**'ye:
| Tip | Ad | Değer |
|---|---|---|
| A | `@` (kankaverse.com) | VPS_IP |
| A | `www` | VPS_IP |
| A | `api` | VPS_IP |

```bash
# Yayılmayı doğrula (birkaç dk sürebilir):
# dig +short kankaverse.com    → VPS_IP dönmeli
# dig +short api.kankaverse.com → VPS_IP dönmeli
```

### 5.1 DNS artık Cloudflare'de (2026-07-28)

Zone `kankaverse.com` Turhost nameserver'larından **Cloudflare'e taşındı** (`carla`/`jeff.ns.cloudflare.com`).
Sebep: R2 public bucket'a özel alan adı (`cdn.kankaverse.com`) bağlanabilmesi için zone'un Cloudflare'de
olması şart. Alt alanı tek başına delege etmek Enterprise, partial CNAME kurulumu Business planı istiyor.

**KURAL — kök, `www`, `api`, `mail`, `ftp` kayıtları `DNS only` (GRİ bulut) kalır.** Turuncuya (proxied)
çevirmek iki şeyi bozar: (1) Caddy'nin ACME sertifika yenilemesi, (2) TR trafiğinin doğrudan Turhost IP'sine
gitmesi (ana siteyi Cloudflare edge'ine sokmak, `r2.dev`'de yaşadığımız DPI riskini ana siteye taşır).
Cloudflare kurulumda "korumasız" diye uyarır, bu bilinçli tercih. Yalnız `cdn` proxy'li (R2 zorunlu kılar).

Ayrıca DNSSEC kapalı olmalı (NS değişimi sırasında açık olsa alan adı komple çözülemez hale gelirdi).

---

## 6. Build + ayağa kaldır

```bash
# docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
# docker compose -f docker-compose.prod.yml ps      → hepsi 'running'/'healthy'
# docker compose -f docker-compose.prod.yml logs -f api    → migration + "Nest application started"
```

> api container başlangıçta `prisma migrate deploy` çalıştırır (otomatik migration). İlk açılışta tüm şema kurulur.

---

## 7. TLS doğrula

```bash
# docker compose -f docker-compose.prod.yml logs caddy | grep -i certificate
# → "certificate obtained successfully" (kankaverse.com + api.kankaverse.com)
```
Tarayıcıdan `https://kankaverse.com` (web) ve `https://api.kankaverse.com/auth/registration-mode` (`{"mode":"open"}` envelope) açılmalı.

> ACME başarısızsa: DNS henüz yayılmamış olabilir (§5) ya da 80/443 kapalı (§1 ufw). Düzelt → `docker compose -f docker-compose.prod.yml restart caddy`.

---

## 8. Bootstrap — sahip hesabı + platform-admin (tek seferlik)

`REGISTRATION_MODE=open` iken:
1. `https://kankaverse.com` → **kaydol** (sahip hesabın).
2. Hesabı platform-admin yap (DB'den — UI yok, tasarım kararı D16):
```bash
# docker compose -f docker-compose.prod.yml exec postgres \
#   psql -U kankaverse -d kankaverse \
#   -c "UPDATE \"User\" SET \"isModerator\" = true WHERE email = 'SENIN_EPOSTAN';"
```
3. Giriş yap (token isModerator'ı canlı okur — tekrar login gerekmez) → **Ayarlar → Admin → davet oluştur** → kodları al.

---

## 9. Açık-kaydı kapat (kapalı-test moduna geç)

```bash
# nano .env.production     → REGISTRATION_MODE=invite
# docker compose --env-file .env.production -f docker-compose.prod.yml up -d api    → api yeniden başlar
# curl -s https://api.kankaverse.com/auth/registration-mode    → {"...":"invite"} (envelope içinde)
```
Artık yalnız davet koduyla kayıt olunur. DB zaten temiz (fresh) → ayrı purge gerekmez.

---

## 10. Duman testi (uçtan uca)
- [ ] `https://kankaverse.com` açılıyor (HTTPS yeşil).
- [ ] `invite` modda kodsuz kayıt reddediliyor; geçerli kodla kayıt + giriş çalışıyor.
- [ ] Mesaj gönder/al (WebSocket — Socket.IO Caddy üzerinden).
- [ ] Refresh cookie çalışıyor (sayfa yenile → oturum sürüyor; `sameSite=lax` + Secure).
- [ ] Ses kanalı (LiveKit Cloud — webhook URL'ini §sonraki güncelle).
- [ ] E-posta doğrulama maili geliyor (Resend).

**LiveKit webhook:** LiveKit Cloud → Settings → Webhooks → `https://api.kankaverse.com/voice/webhook`.

---

## 11. Operasyon (günlük)

```bash
# Loglar:        docker compose -f docker-compose.prod.yml logs -f api
# Yeniden deploy (kod güncellemesi):
#   git pull && docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
# DB yedeği:     docker compose -f docker-compose.prod.yml exec postgres pg_dump -U kankaverse kankaverse > backup_$(date +%F).sql
# Kaynak izle (oversold/jitter kontrolü — hafıza notu): vmstat 1   (st sütunu = CPU steal; yüksekse VDS'e yüksel)
```

> **Bayrakları açma sırası (lansman-hazırlık):** önce CSAM tarayıcı + hukuk (Track A) → `UPLOADS_ENABLED`/scan;
> C4 için önkoşullar tamamsa `CAMERA_ENABLED`/`SCREEN_ENABLED=true` + api restart. Acele etme (PLAN Track A/G).

---

## 11b. Masaüstü sürüm yayını (otomatik güncelleme)

Masaüstü istemci `electron-updater` ile `https://kankaverse.com/indir/latest.yml` dosyasına bakar (6 saatte bir + açılışta).
Web kodu canlıdan geldiği için yalnız `desktop/src/` (main, preload, picker, call) değişince yeni sürüm yayınlanır.

1. `desktop/package.json` içinde `version` değerini ARTIR. Artmazsa güncelleyici "yeni sürüm yok" der.
2. `cd desktop && npm run dist` → `dist/` altında `kankaverse-setup.exe`, `kankaverse-setup.exe.blockmap`, `latest.yml`.
3. Üç dosyayı VPS'te `/home/deploy/kankaverse/downloads/` klasörüne koy. **Sıra önemli:** önce `.exe` ve `.blockmap`,
   EN SON `latest.yml` (yarım yüklemede istemci henüz olmayan dosyayı istemesin).
4. Doğrula: `curl -s https://kankaverse.com/indir/latest.yml` yeni sürümü göstermeli.

Not: 1.0.1 ve öncesi kurulumlarda güncelleyici yoktur; bir kez elle yeniden indirmeleri gerekir.

---

## 12. Railway / Vercel devre dışı (VPS sağlamca çalıştıktan SONRA)
- Birkaç gün VPS'i izle; stabilse Railway api servisini ve Vercel projesini durdur/sil.
- DNS'te eski Vercel/Railway custom domain kayıtları kaldıysa temizle (yalnız VPS A kayıtları kalsın).
- Eski managed Postgres'te veri varsa (kapalı test öncesi) — fresh başlangıç istediğimiz için taşıma yok.

---

## 13. Dosya yükleme açma (Cloudflare R2)

> Kod hazır: backend presign akışı (`api` attachments modülü) + web yükleme arayüzü + scan-gate.
> Açmak tamamen ops/config işi; kod değişmez. Depolama = R2 (VPS diski değil — "ağır yük dışarıda").
>
> ⚠️ **CSAM notu (2026-06-25 sahip kararı):** Gerçek CSAM tarayıcı (PhotoDNA/Safer) henüz yok.
> Bu yüzden `ATTACHMENT_SCAN_ENABLED=false` ile her dosya otomatik CLEAN damgalanır ve TARANMADAN
> servis edilir. Bilinçli, tanınırlık fazı için geçici kabul. **Kitle görünür olmaya başlayınca
> tekrar masaya yatır** (tarayıcı entegrasyonu / whitelist'e daralt). Kill-switch: `UPLOADS_ENABLED=false` + api restart.

### 13.1 R2 bucket'lar + API token (Cloudflare panel)

> **İKİ bucket (bilinçli ayrım — C8-fix):**
> - `kankaverse-uploads` → **PRIVATE**. Mesaj/DM ekleri. Backend imzalı presigned GET + üyelik/scan kapısı ile sunar. Public erişim YOK.
> - `kankaverse-public` → **PUBLIC**. Avatar / profil-afişi / ortam-afişi / ortam-ikonu. `<img>` ile imzasız sunulur.
>
> Neden ayrı: ek gizliliği (URL=erişim değil, üyelik=erişim) korunur; profil görselleri zaten herkese açık. Aynı bucket'ı public yapmak DM görsellerini de URL ile herkese açardı (iptal edilemez) — çocuk güvenliği için kabul edilmez.

1. Cloudflare → R2 → **Create bucket** → `kankaverse-uploads` (private kalır) **ve** `kankaverse-public`.
2. **Public bucket'ı public yap:** `kankaverse-public` → **Settings → Public access → Custom Domains** → `cdn.kankaverse.com` bağla (DNS Cloudflare'de → CNAME otomatik açılır). *(r2.dev dev URL'i hızlı testte iş görür ama üretimde KULLANMA: rate-limit'li, Cloudflare garanti vermiyor ve `*.r2.dev` TR'de DPI ile engellenip görselleri kırıyor — bkz §5.1.)* Private bucket'a public erişim AÇMA.
3. R2 → **Manage API Tokens** → **Create API Token** → izin **Object Read & Write**, kapsam **her iki bucket** (backend ikisine de presigned PUT üretir).
4. Çıktıyı not et: **Access Key ID**, **Secret Access Key**, **endpoint** (`https://<accountid>.r2.cloudflarestorage.com`).

### 13.2 Bucket CORS politikası (KRİTİK — atlanırsa yükleme sessizce patlar)
Tarayıcı presigned URL'ye **doğrudan PUT** yapar; bucket origin'imize izin vermezse PUT CORS hatası alır.
**HER İKİ bucket'a** (`kankaverse-uploads` + `kankaverse-public`) aynı politikayı ekle — avatar/afiş PUT public bucket'a gider.
R2 → bucket → **Settings → CORS Policy**:
```json
[
  {
    "AllowedOrigins": ["https://kankaverse.com"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```
> İndirme `<img>`/lightbox ile yapılır (cross-origin GET, CORS gerektirmez) ama HEAD/GET'i de ekledik — zararı yok.

### 13.3 Env'i doldur + bayrağı çevir (VPS'te)
`.env.production` **repo kökünde değil**, çalışan stack'in dizininde: `/home/deploy/kankaverse/.env.production`.
```bash
# nano /home/deploy/kankaverse/.env.production
```
S3 bloğunu doldur ve yüklemeyi aç (ikisini AYNI kaydetmede yap — `UPLOADS_ENABLED=true` iken
S3 değişkenleri eksikse api fail-fast ile açılmaz, `configuration.ts` §16):
```
UPLOADS_ENABLED=true
ATTACHMENT_SCAN_ENABLED=false      # tarayıcı yok → false (true olursa dosyalar sonsuza dek PENDING kalır)
S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=kankaverse-uploads       # PRIVATE — mesaj/DM ekleri (presigned GET)
S3_ACCESS_KEY=<R2 Access Key ID>   # token her iki bucket'a Read&Write olmalı
S3_SECRET_KEY=<R2 Secret Access Key>
# Profil görselleri (avatar/afiş/ikon) için PUBLIC bucket + özel alan adı (C8-fix):
S3_PUBLIC_BUCKET=kankaverse-public
S3_PUBLIC_BASE_URL=https://cdn.kankaverse.com   # public bucket'a bağlı özel alan adı (r2.cloudflarestorage.com DEĞİL)
# MAX_UPLOAD_MB=25   # opsiyonel, varsayılan 25
```
> ⚠️ **Eski/yanlış kurulum uyarısı:** `S3_PUBLIC_URL`'i R2'nin S3 endpoint'ine (`...r2.cloudflarestorage.com/...`)
> ayarlama — o endpoint her GET için imza ister, imzasız `<img>` GET'i **401/403** döner → kırık avatar/afiş.
> Public sunum yalnız public bucket + özel alan adı (`S3_PUBLIC_BASE_URL`) ile olur. `S3_PUBLIC_URL` artık
> yalnız geriye-dönük varsayılan (verilmezse `S3_PUBLIC_BASE_URL` ona düşer) — prod'da `S3_PUBLIC_BASE_URL` gir.
> İzinli tipler allowlist'te sabit (png/jpeg/gif/webp/pdf/txt) — genişletme kod değişikliğiyle (`attachments.service.ts`).

### 13.4 Uygula + duman testi
```bash
# docker compose --env-file .env.production -f docker-compose.prod.yml up -d api
# docker compose -f docker-compose.prod.yml logs -f api    # fail-fast hatası YOKsa "Nest started"
```
- [ ] Bir kanalda mesaja görsel iliştir → yükleniyor (CORS hatası yoksa) + önizleme görünüyor.
- [ ] Sayfa yenile → görsel hâlâ açılıyor (presigned GET 300s; her açılışta yeniden imzalanır).
- [ ] Kötü senaryo testi: 25MB üstü / izinsiz tip reddediliyor (`FILE_TOO_LARGE` / `UNSUPPORTED_TYPE`).

### 13.5 Geri alma
```bash
# nano .env.production    → UPLOADS_ENABLED=false
# docker compose --env-file .env.production -f docker-compose.prod.yml up -d api
```
Yüklü dosyalar R2'de kalır; yeni yükleme/erişim kapanır (`UPLOADS_DISABLED`).

---

## 14. Şifreli off-site DB yedeği (felaket kurtarma + sızıntı koruması)

> Script: `infra/backup/backup-db.sh`. **Model:** `pg_dump → age (public-key şifrele) → R2`.
> **Çözme (private) anahtarı SUNUCUDA OLMAZ** — sunucu yalnız şifreler. Sunucu tamamen ele geçse de
> yedekler okunamaz. Düz-metin dump diske yazılmaz (uçtan uca pipe). R2 = off-site (VPS ölse de ayrı yerde).
>
> Bu **felaket kurtarmanın** (disk arızası / DB bozulması / yanlış silme = her şeyi kaybetme) birinci sınıf
> korumasıdır; şifreleme onun küçük ek katmanı. **Gerçek kullanıcı varken ertelenmez.**

### 14.1 Tek seferlik kurulum

**(a) age anahtar çifti — KENDİ MAKİNENDE üret (sunucuda DEĞİL):**
```bash
$ age-keygen -o kankaverse-backup-key.txt
#   → "Public key: age1xxxxx..." (bunu sunucuya koyacaksın)
#   → dosya içinde "AGE-SECRET-KEY-1..." (ÇÖZME anahtarı — SUNUCUYA ASLA KOYMA)
```
> 🔴 `kankaverse-backup-key.txt`'i (private key) **güvenli sakla** (parola yöneticisi / şifreli USB / 2 ayrı yer).
> **Bunu kaybedersen yedekleri ÇÖZEMEZSİN.** Sunucuya yalnız `age1...` public key gider.

**(b) R2 backups bucket + retention + DEDICATED token:** Cloudflare R2 → **Create bucket** (`kankaverse-backups`).
Bucket → **Settings → Object lifecycle rules** → "delete after N days" (örn. 14) → retention otomatik (script silmez).
> 🔑 **Dedicated token (uploads'a dokunma):** R2 → Manage API Tokens → **Create** → izin **Object Read & Write**,
> yalnız `kankaverse-backups`. Çıktıyı not et: Access Key ID + Secret + endpoint. Bunlar `.env`'de **`BACKUP_S3_*`**
> olarak girilir → çalışan uploads token'ı (`S3_*`) hiç değişmez. (Verilmezse script `S3_*`'a düşer ama o token
> genelde yalnız uploads bucket'ına kapılıdır → backup yazamaz; o yüzden dedicated token gir.)

**(c) VPS'te bağımlılıklar:**
```bash
# sudo apt update && sudo apt install -y age awscli
# (Ubuntu 24.04'te ikisi de apt'te. aws-cli yoksa: pipx install awscli)
```

**(d) `.env.production`'a ekle** (`/home/deploy/kankaverse/.env.production`):
```
AGE_RECIPIENT=age1xxxxx...                 # (a)'daki PUBLIC key
BACKUP_BUCKET=kankaverse-backups
BACKUP_S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com   # (b)'deki dedicated token endpoint
BACKUP_S3_ACCESS_KEY=<backups token Access Key ID>
BACKUP_S3_SECRET_KEY=<backups token Secret>
```

**(e) Çalıştırılabilir yap:**
```bash
# chmod +x /home/deploy/kankaverse/infra/backup/backup-db.sh
```

**(f) Cron (deploy kullanıcısı — docker erişimi olan):**
```bash
# crontab -e   (deploy kullanıcısıyla)
0 3 * * * /home/deploy/kankaverse/infra/backup/backup-db.sh >> /home/deploy/kankaverse-backup.log 2>&1
```
Her gece 03:00 UTC. Log: `~/kankaverse-backup.log`.

### 14.2 Test (kurulumdan hemen sonra)
```bash
# /home/deploy/kankaverse/infra/backup/backup-db.sh        # elle çalıştır → "tamam → s3://..." görmeli
# aws s3 ls s3://kankaverse-backups/db/ --endpoint-url "$S3_ENDPOINT"   # obje görünmeli
```

### 14.3 Geri yükleme (RESTORE — mutlaka bir kez test et!)
> Yedek **test edilmeden** işe yaramaz. Kurulumdan sonra bir kez restore-test yap (boş/geçici DB'ye).
```bash
# 1) Yedeği indir (KENDİ makinende, private key burada):
$ aws s3 cp s3://kankaverse-backups/db/kankaverse-YYYY...Z.sql.age ./yedek.sql.age --endpoint-url <R2_ENDPOINT>
# 2) age ile çöz (private key dosyası):
$ age -d -i kankaverse-backup-key.txt yedek.sql.age > yedek.sql
# 3) Hedef DB'ye yükle:
$ psql -U kankaverse -d <hedef_db> -f yedek.sql      # (sunucuda: docker compose exec -T postgres psql ... < yedek.sql)
```

### 14.4 İzleme
- `~/kankaverse-backup.log`'u ara sıra kontrol et (veya logwatch/cron-MAILTO).
- R2'de son yedeğin **bugünün tarihiyle** durduğunu doğrula (sessiz başarısızlık en tehlikelisi).
- Anahtar rotasyonu: private key'i değiştirirsen yeni public key'i `.env.production`'a koy; eski yedekler eski key'le çözülür.

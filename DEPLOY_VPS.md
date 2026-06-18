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

## 12. Railway / Vercel devre dışı (VPS sağlamca çalıştıktan SONRA)
- Birkaç gün VPS'i izle; stabilse Railway api servisini ve Vercel projesini durdur/sil.
- DNS'te eski Vercel/Railway custom domain kayıtları kaldıysa temizle (yalnız VPS A kayıtları kalsın).
- Eski managed Postgres'te veri varsa (kapalı test öncesi) — fresh başlangıç istediğimiz için taşıma yok.

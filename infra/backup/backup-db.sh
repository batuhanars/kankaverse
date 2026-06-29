#!/usr/bin/env bash
#
# Kankaverse — şifreli off-site PostgreSQL yedeği.
#
# Akış:  pg_dump  →  age ile şifrele (public-key)  →  Cloudflare R2'ye stream  →  (retention R2 lifecycle)
#
# Tasarım kararları:
#   • age PUBLIC-key ile şifrelenir → ÇÖZME (private) anahtarı SUNUCUDA YOKTUR.
#     Sunucu tamamen ele geçse bile yedekler okunamaz (sunucu yalnız şifreler, çözemez).
#   • Düz-metin dump hiçbir noktada DİSKE yazılmaz (uçtan uca pipe; yalnız bellekten akar).
#   • R2 = off-site (VPS ölse de yedek ayrı yerde). Şifreli olduğu için yurt dışı depo savunulabilir.
#   • Retention: R2 bucket "lifecycle" kuralıyla (N günden eski objeleri sil) — script tarafında değil.
#
# Çalıştırma: deploy kullanıcısının cron'undan (docker erişimi olmalı). Kurulum: DEPLOY_VPS.md §14.
#
set -euo pipefail

# ── Ortam: çalışan stack'in .env.production'ı (S3_*, POSTGRES_* buradan) ──────────
ENV_FILE="${ENV_FILE:-/home/deploy/kankaverse/.env.production}"
if [ -f "$ENV_FILE" ]; then
  set -a; . "$ENV_FILE"; set +a
fi

# ── Zorunlu config ───────────────────────────────────────────────────────────────
: "${S3_ENDPOINT:?S3_ENDPOINT gerekli (.env.production)}"
: "${S3_ACCESS_KEY:?S3_ACCESS_KEY gerekli}"
: "${S3_SECRET_KEY:?S3_SECRET_KEY gerekli}"
: "${AGE_RECIPIENT:?AGE_RECIPIENT gerekli — age PUBLIC key (age1...). Private key SUNUCUDA OLMAMALI}"

# ── Opsiyonel config (varsayılanlı) ──────────────────────────────────────────────
BACKUP_BUCKET="${BACKUP_BUCKET:-kankaverse-backups}"
COMPOSE_FILE="${COMPOSE_FILE:-/home/deploy/kankaverse/docker-compose.prod.yml}"
PG_USER="${POSTGRES_USER:-kankaverse}"
PG_DB="${POSTGRES_DB:-kankaverse}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OBJECT="db/kankaverse-${STAMP}.sql.age"

echo "[backup] başlıyor: ${OBJECT}"

# ── dump → age (public-key şifrele) → R2'ye stream (stdin upload) ─────────────────
# -T : TTY yok (cron/non-interactive şart). pg_dump local exec → parola gerekmez (container içi).
# pipefail: pg_dump veya age patlarsa upload başarısız sayılır (yarım yedek R2'ye gitmez sayılmaz).
docker compose -f "$COMPOSE_FILE" exec -T postgres \
    pg_dump -U "$PG_USER" "$PG_DB" \
  | age -r "$AGE_RECIPIENT" \
  | AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY" \
    AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY" \
    aws s3 cp - "s3://${BACKUP_BUCKET}/${OBJECT}" \
      --endpoint-url "$S3_ENDPOINT" \
      --only-show-errors

echo "[backup] tamam → s3://${BACKUP_BUCKET}/${OBJECT}"

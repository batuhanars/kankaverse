#!/bin/sh
# E1 acil geri alma (sözleşme §6.4), canlı sunucuda: sh /home/deploy/kankaverse/ops/e2ee-rollback.sh
# 1) E2EE_ENABLED=false  2) api aynı imajla yeniden başlar  3) şifreleme grupları temizlenir.
# Yalnız bayrağı kapatmak YETMEZ: şifreli sohbetler kilitlenir (sunucu düz mesajı reddeder).
set -e
cd /home/deploy/kankaverse
TAG=$(docker inspect --format '{{.Config.Image}}' $(docker ps -qf name=api) | sed 's/.*://')
cp .env.production .env.production.bak-rollback
sed -i 's/^E2EE_ENABLED=.*/E2EE_ENABLED=false/' .env.production
IMAGE_TAG=$TAG docker compose -f docker-compose.prod.yml --env-file .env.production up -d api
PG=$(docker ps -qf name=postgres)
docker exec -i "$PG" sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < ops/e2ee-rollback.sql
sleep 5
echo "--- imaj: $TAG"; docker exec $(docker ps -qf name=api) printenv E2EE_ENABLED

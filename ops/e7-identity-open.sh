#!/bin/sh
# E7 güvenlik kodu herkese açılış, canlı sunucuda: sh /home/deploy/kankaverse/ops/e7-identity-open.sh
# E2EE_IDENTITY_USER_IDS boşaltılır (boş liste = herkes), api aynı imajla yeniden başlar.
# Geri alma: E2EE_IDENTITY=false + api-restart.sh (kurulmuş kimlikler kalır, yüzeyler gizlenir).
set -e
cd /home/deploy/kankaverse
TAG=$(docker inspect --format '{{.Config.Image}}' $(docker ps -qf name=api) | sed 's/.*://')
[ -n "$TAG" ] || { echo "imaj etiketi okunamadı, DUR"; exit 1; }
cp .env.production ".env.production.bak-e7-open-$(date +%Y%m%d%H%M)"
sed -i 's/^E2EE_IDENTITY_USER_IDS=.*/E2EE_IDENTITY_USER_IDS=/' .env.production
IMAGE_TAG=$TAG docker compose -f docker-compose.prod.yml --env-file .env.production up -d --no-build api
sleep 5
echo "--- imaj: $TAG"
docker exec $(docker ps -qf name=api) sh -c 'echo "E2EE_IDENTITY=$E2EE_IDENTITY E2EE_IDENTITY_USER_IDS=[$E2EE_IDENTITY_USER_IDS]"'

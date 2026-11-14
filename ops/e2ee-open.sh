#!/bin/sh
# E2EE herkese açılış, canlı sunucuda: sh /home/deploy/kankaverse/ops/e2ee-open.sh
# E2EE_USER_IDS boşaltılır (boş liste = herkes uygun), api aynı imajla yeniden başlar.
# Acil geri alma bu dosyanın tersi DEĞİL: listeyi geri yazmak şifrelenmiş sohbetleri yarıda bırakır.
# Gerçek geri alma: sh ops/e2ee-rollback.sh
set -e
cd /home/deploy/kankaverse
TAG=$(docker inspect --format '{{.Config.Image}}' $(docker ps -qf name=api) | sed 's/.*://')
cp .env.production ".env.production.bak-e2ee-open-$(date +%Y%m%d%H%M)"
sed -i 's/^E2EE_USER_IDS=.*/E2EE_USER_IDS=/' .env.production
IMAGE_TAG=$TAG docker compose -f docker-compose.prod.yml --env-file .env.production up -d api
sleep 5
echo "--- imaj: $TAG"
docker exec $(docker ps -qf name=api) sh -c 'echo "E2EE_ENABLED=$E2EE_ENABLED E2EE_USER_IDS=[$E2EE_USER_IDS]"'

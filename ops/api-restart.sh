#!/bin/sh
# .env.production değişikliğinden sonra api'yi AYNI imajla yeniden kurar: sh ops/api-restart.sh
# Etiket çalışan konteynerden okunur (IMAGE_TAG'siz restart bayat :latest'e düşer). Komut kısa: terminal bölmez.
set -e
cd /home/deploy/kankaverse
TAG=$(docker inspect --format '{{.Config.Image}}' $(docker ps -qf name=api) | sed 's/.*://')
[ -n "$TAG" ] || { echo "imaj etiketi okunamadi, durdum"; exit 1; }
IMAGE_TAG=$TAG docker compose -f docker-compose.prod.yml --env-file .env.production up -d --no-build api
echo "--- imaj: $TAG"

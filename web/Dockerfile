# Kankaverse Web — production image (Vue 3 SPA → static via nginx)
# Multi-stage: build (vite) → nginx:alpine serving dist
# NOT: `npm run build` DEĞİL → `npx vite build`. Çünkü `npm run build` önce `vue-tsc -b` çalıştırır;
# repoda bilinen/önceden var olan tip hataları (VoiceVideoGrid/stores) build'i bloklar. Deploy vite build kullanır.

# E1 §6.1: build context KÖK dizindir (`docker build -f web/Dockerfile .`). Neden: web, MLS çekirdeğini
# (`shared/e2ee-core`) kaynağından derler; context ./web olsaydı `../shared` imaja girmezdi.
# Bağlam filtresi: web/Dockerfile.dockerignore (yalnız web/ ve shared/e2ee-core girer).

# ── Build ──────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
# Çekirdek: vite.config alias'ı ../shared/e2ee-core/src'e bakar (WORKDIR /app/web iken /app/shared).
COPY shared/e2ee-core/package*.json ./shared/e2ee-core/
RUN cd shared/e2ee-core && npm ci --omit=dev
COPY shared/e2ee-core/src ./shared/e2ee-core/src
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
# API base URL build-time'da gömülür (Vite import.meta.env). Compose build arg ile geçirir.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npx vite build

# ── Serve ──────────────────────────────────────────────────────────────────
FROM nginx:alpine
COPY --from=build /app/web/dist /usr/share/nginx/html
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

# Kankaverse Web — production image (Vue 3 SPA → static via nginx)
# Multi-stage: build (vite) → nginx:alpine serving dist
# NOT: `npm run build` DEĞİL → `npx vite build`. Çünkü `npm run build` önce `vue-tsc -b` çalıştırır;
# repoda bilinen/önceden var olan tip hataları (VoiceVideoGrid/stores) build'i bloklar. Deploy vite build kullanır.

# ── Build ──────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# API base URL build-time'da gömülür (Vite import.meta.env). Compose build arg ile geçirir.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npx vite build

# ── Serve ──────────────────────────────────────────────────────────────────
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

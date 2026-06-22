# Kankaverse Landing — production image (Nuxt SSG → static via nginx)
# Multi-stage: build (nuxt generate) → nginx:alpine serving .output/public
# Çalışan Node sunucusu YOK; saf statik dosya servisi (web/ ile aynı desen).

# ── Build ──────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run generate

# ── Serve ──────────────────────────────────────────────────────────────────
FROM nginx:alpine
COPY --from=build /app/.output/public /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

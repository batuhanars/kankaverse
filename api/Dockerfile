# Kankaverse API — production image (NestJS + Prisma)
# Multi-stage: build (full deps) → runtime (deps + dist + prisma CLI for migrate deploy)

# ── Build ──────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
# prisma şeması + config npm ci'den ÖNCE: postinstall = `prisma generate` bunlara ihtiyaç duyar.
# Prisma 7: datasource url schema'da değil prisma.config.ts'te (process.env.DATABASE_URL).
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci
COPY . .
RUN npm run build

# ── Runtime ────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# node_modules build'den kopyalanır → prisma CLI (migrate deploy) + @prisma/client (generate edilmiş) hazır
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
# Prisma 7: migrate deploy datasource url'i prisma.config.ts'ten okur — runtime'a ŞART.
COPY --from=build /app/prisma.config.ts ./
COPY package*.json ./
EXPOSE 3000
# Her başlangıçta migration'ı uygula (idempotent), sonra prod sunucuyu başlat.
# start:prod = node dist/src/main
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main"]

# Kankaverse

Yerli, topluluk odaklı gerçek zamanlı iletişim platformu (Discord alternatifi) — Türkiye pazarı için
sıfırdan tasarlanıyor. Öne çıkan ilkeler: Türkçe moderasyon, yerel ödeme, KVKK uyumu ve **çocuk
güvenliğinin mimariye gömülü olması**.

> Durum: **erken geliştirme** (V1 — walking skeleton aşaması).

## Monorepo Yapısı

| Dizin | İçerik | Stack |
|---|---|---|
| `api/` | Backend API | NestJS + Prisma + PostgreSQL |
| `web/` | Web istemcisi (V1 birincil) | Vue 3 + Vite + TypeScript |
| `contracts/` | Sprint sözleşmeleri (PM ↔ dev) | — |

Masaüstü (Electron) ve mobil (Flutter) tier'ları ileride aynı monorepoya eklenecek.

## Geliştirme

Kurulum ve çalıştırma adımları yakında eklenecek (paket seçimi ve dev ortamı kararından sonra).

Proje yol haritası ve mimari kararlar için `PLAN.md`; aktif sprint için `contracts/`; çalışma kuralları
için `CLAUDE.md`.

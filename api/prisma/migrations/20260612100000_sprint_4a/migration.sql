-- Sprint 4A: ChannelMember.clearedAt + minör profileDiscoverable backfill

-- G4: inbox soft-delete alanı (additive)
ALTER TABLE "ChannelMember" ADD COLUMN "clearedAt" TIMESTAMP(3);

-- Minör backfill: register'da zaten !isMinor kullanıyoruz ama tarihsel kayıtlar
-- için güvenlik ağı — isMinor=true olan kullanıcıların profileDiscoverable=false olması gerekir.
UPDATE "User" SET "profileDiscoverable" = false WHERE "isMinor" = true;

-- CreateEnum
CREATE TYPE "GameSource" AS ENUM ('STEAM', 'EPIC', 'CURATED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "showGameActivity" BOOLEAN;

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" "GameSource" NOT NULL,
    "externalId" TEXT,
    "executables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Game_source_externalId_key" ON "Game"("source", "externalId");

-- C31b §1: elle liste (CURATED) tohumu. Deploy hattı yalnız `migrate deploy` koşar, ayrı seed adımı yok:
-- oyunlar migration ile canlıya gelir. Kimlik sabit (curated_<slug>), yeniden koşuya dayanıklı.
INSERT INTO "Game" ("id", "name", "source", "externalId", "executables") VALUES
  ('curated_valorant', 'Valorant', 'CURATED', 'valorant', ARRAY['valorant-win64-shipping.exe']::TEXT[]),
  ('curated_league-of-legends', 'League of Legends', 'CURATED', 'league-of-legends', ARRAY['league of legends.exe']::TEXT[]),
  ('curated_knight-online', 'Knight Online', 'CURATED', 'knight-online', ARRAY['knightonline.exe']::TEXT[]),
  ('curated_overwatch-2', 'Overwatch 2', 'CURATED', 'overwatch-2', ARRAY['overwatch.exe']::TEXT[]),
  ('curated_call-of-duty', 'Call of Duty', 'CURATED', 'call-of-duty', ARRAY['cod.exe']::TEXT[]),
  ('curated_world-of-warcraft', 'World of Warcraft', 'CURATED', 'world-of-warcraft', ARRAY['wow.exe','wow-64.exe']::TEXT[]),
  ('curated_hearthstone', 'Hearthstone', 'CURATED', 'hearthstone', ARRAY['hearthstone.exe']::TEXT[]),
  ('curated_ea-sports-fc', 'EA SPORTS FC', 'CURATED', 'ea-sports-fc', ARRAY['fc24.exe','fc25.exe']::TEXT[]),
  ('curated_apex-legends', 'Apex Legends', 'CURATED', 'apex-legends', ARRAY['r5apex.exe','r5apex_dx12.exe']::TEXT[]),
  ('curated_minecraft-bedrock', 'Minecraft', 'CURATED', 'minecraft-bedrock', ARRAY['minecraft.windows.exe']::TEXT[]),
  ('curated_roblox', 'Roblox', 'CURATED', 'roblox', ARRAY['robloxplayerbeta.exe']::TEXT[]),
  ('curated_genshin-impact', 'Genshin Impact', 'CURATED', 'genshin-impact', ARRAY['genshinimpact.exe']::TEXT[]),
  ('curated_legends-of-runeterra', 'Legends of Runeterra', 'CURATED', 'legends-of-runeterra', ARRAY['lor.exe']::TEXT[]),
  ('curated_honkai-star-rail', 'Honkai: Star Rail', 'CURATED', 'honkai-star-rail', ARRAY['starrail.exe']::TEXT[]),
  ('curated_zenless-zone-zero', 'Zenless Zone Zero', 'CURATED', 'zenless-zone-zero', ARRAY['zenlesszonezero.exe']::TEXT[]),
  ('curated_honkai-impact-3rd', 'Honkai Impact 3rd', 'CURATED', 'honkai-impact-3rd', ARRAY['bh3.exe']::TEXT[]),
  ('curated_diablo-iv', 'Diablo IV', 'CURATED', 'diablo-iv', ARRAY['diablo iv.exe']::TEXT[]),
  ('curated_diablo-ii-resurrected', 'Diablo II: Resurrected', 'CURATED', 'diablo-ii-resurrected', ARRAY['d2r.exe']::TEXT[]),
  ('curated_starcraft-ii', 'StarCraft II', 'CURATED', 'starcraft-ii', ARRAY['sc2_x64.exe']::TEXT[]),
  ('curated_warcraft-iii', 'Warcraft III', 'CURATED', 'warcraft-iii', ARRAY['warcraft iii.exe']::TEXT[]),
  ('curated_heroes-of-the-storm', 'Heroes of the Storm', 'CURATED', 'heroes-of-the-storm', ARRAY['heroesofthestorm_x64.exe']::TEXT[]),
  ('curated_escape-from-tarkov', 'Escape from Tarkov', 'CURATED', 'escape-from-tarkov', ARRAY['escapefromtarkov.exe']::TEXT[]),
  ('curated_rainbow-six-siege', 'Rainbow Six Siege', 'CURATED', 'rainbow-six-siege', ARRAY['rainbowsix.exe','rainbowsix_vulkan.exe']::TEXT[]),
  ('curated_world-of-tanks', 'World of Tanks', 'CURATED', 'world-of-tanks', ARRAY['worldoftanks.exe']::TEXT[]),
  ('curated_path-of-exile', 'Path of Exile', 'CURATED', 'path-of-exile', ARRAY['pathofexile.exe','pathofexile_x64.exe']::TEXT[]),
  ('curated_elder-scrolls-online', 'The Elder Scrolls Online', 'CURATED', 'elder-scrolls-online', ARRAY['eso64.exe']::TEXT[]),
  ('curated_final-fantasy-xiv', 'Final Fantasy XIV', 'CURATED', 'final-fantasy-xiv', ARRAY['ffxiv_dx11.exe']::TEXT[]),
  ('curated_guild-wars-2', 'Guild Wars 2', 'CURATED', 'guild-wars-2', ARRAY['gw2-64.exe']::TEXT[]),
  ('curated_black-desert', 'Black Desert', 'CURATED', 'black-desert', ARRAY['blackdesert64.exe']::TEXT[]),
  ('curated_albion-online', 'Albion Online', 'CURATED', 'albion-online', ARRAY['albion-online.exe']::TEXT[]),
  ('curated_battlefield-2042', 'Battlefield 2042', 'CURATED', 'battlefield-2042', ARRAY['bf2042.exe']::TEXT[]),
  ('curated_the-sims-4', 'The Sims 4', 'CURATED', 'the-sims-4', ARRAY['ts4_x64.exe']::TEXT[])
ON CONFLICT ("source", "externalId") DO NOTHING;

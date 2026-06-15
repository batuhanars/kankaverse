-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#99AAB5',
    "position" INTEGER NOT NULL DEFAULT 0,
    "hoist" BOOLEAN NOT NULL DEFAULT false,
    "mentionable" BOOLEAN NOT NULL DEFAULT false,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "iconUrl" TEXT,
    "isEveryone" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuildMemberRole" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuildMemberRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Role_guildId_idx" ON "Role"("guildId");

-- CreateIndex
CREATE INDEX "GuildMemberRole_roleId_idx" ON "GuildMemberRole"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "GuildMemberRole_memberId_roleId_key" ON "GuildMemberRole"("memberId", "roleId");

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildMemberRole" ADD CONSTRAINT "GuildMemberRole_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "GuildMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildMemberRole" ADD CONSTRAINT "GuildMemberRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: mevcut guild'lerin her birine @everyone taban rolü ekle (idempotent)
INSERT INTO "Role" ("id", "guildId", "name", "color", "position", "hoist", "mentionable", "permissions", "isEveryone", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  g."id",
  '@everyone',
  '#99AAB5',
  0,
  false,
  false,
  ARRAY['VIEW_CHANNELS', 'CREATE_INVITE', 'CHANGE_NICKNAME'],
  true,
  NOW(),
  NOW()
FROM "Guild" g
WHERE NOT EXISTS (
  SELECT 1 FROM "Role" r WHERE r."guildId" = g."id" AND r."isEveryone" = true
);

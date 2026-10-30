-- CreateEnum
CREATE TYPE "WebhookKind" AS ENUM ('USER', 'STREAM_ANNOUNCE');

-- CreateEnum
CREATE TYPE "ExternalProvider" AS ENUM ('KICK', 'TWITCH');

-- AlterTable
ALTER TABLE "Webhook" ADD COLUMN     "kind" "WebhookKind" NOT NULL DEFAULT 'USER';

-- CreateTable
CREATE TABLE "ExternalAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "ExternalProvider" NOT NULL,
    "externalId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "showOnProfile" BOOLEAN NOT NULL DEFAULT true,
    "lastLiveAt" TIMESTAMP(3),
    "lastAnnouncedAt" TIMESTAMP(3),
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalLinkState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "ExternalProvider" NOT NULL,
    "codeVerifier" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalLinkState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StreamAnnounceConfig" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "mentionRoleId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StreamAnnounceConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StreamAnnounceOptIn" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StreamAnnounceOptIn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExternalAccount_provider_externalId_key" ON "ExternalAccount"("provider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalAccount_userId_provider_key" ON "ExternalAccount"("userId", "provider");

-- CreateIndex
CREATE INDEX "ExternalLinkState_expiresAt_idx" ON "ExternalLinkState"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "StreamAnnounceConfig_guildId_key" ON "StreamAnnounceConfig"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "StreamAnnounceConfig_webhookId_key" ON "StreamAnnounceConfig"("webhookId");

-- CreateIndex
CREATE INDEX "StreamAnnounceOptIn_userId_idx" ON "StreamAnnounceOptIn"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StreamAnnounceOptIn_guildId_userId_key" ON "StreamAnnounceOptIn"("guildId", "userId");

-- AddForeignKey
ALTER TABLE "ExternalAccount" ADD CONSTRAINT "ExternalAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreamAnnounceConfig" ADD CONSTRAINT "StreamAnnounceConfig_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "Webhook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreamAnnounceOptIn" ADD CONSTRAINT "StreamAnnounceOptIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

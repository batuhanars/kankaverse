-- CreateTable
CREATE TABLE "VoiceMute" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "mutedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoiceMute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VoiceMute_channelId_idx" ON "VoiceMute"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceMute_channelId_userId_key" ON "VoiceMute"("channelId", "userId");

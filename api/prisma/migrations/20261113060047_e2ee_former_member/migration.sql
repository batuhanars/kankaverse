-- CreateTable
CREATE TABLE "E2eeFormerMember" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "leftAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "E2eeFormerMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "E2eeFormerMember_channelId_idx" ON "E2eeFormerMember"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "E2eeFormerMember_channelId_userId_key" ON "E2eeFormerMember"("channelId", "userId");

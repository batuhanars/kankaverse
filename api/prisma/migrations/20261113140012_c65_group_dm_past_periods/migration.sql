-- CreateTable
CREATE TABLE "GroupDmPastPeriod" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL,
    "leftAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupDmPastPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GroupDmPastPeriod_channelId_userId_idx" ON "GroupDmPastPeriod"("channelId", "userId");

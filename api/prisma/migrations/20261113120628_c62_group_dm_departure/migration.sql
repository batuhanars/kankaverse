-- CreateEnum
CREATE TYPE "DepartureReason" AS ENUM ('LEFT', 'REMOVED');

-- CreateTable
CREATE TABLE "GroupDmDeparture" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL,
    "leftAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" "DepartureReason" NOT NULL,
    "clearedAt" TIMESTAMP(3),
    "memberIds" TEXT[],

    CONSTRAINT "GroupDmDeparture_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GroupDmDeparture_userId_idx" ON "GroupDmDeparture"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupDmDeparture_channelId_userId_key" ON "GroupDmDeparture"("channelId", "userId");

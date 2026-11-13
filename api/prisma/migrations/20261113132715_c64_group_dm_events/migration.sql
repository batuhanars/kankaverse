-- CreateEnum
CREATE TYPE "GroupDmEventKind" AS ENUM ('MEMBER_ADDED', 'MEMBER_LEFT', 'MEMBER_REMOVED');

-- CreateTable
CREATE TABLE "GroupDmEvent" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "kind" "GroupDmEventKind" NOT NULL,
    "actorId" TEXT,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupDmEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GroupDmEvent_channelId_createdAt_idx" ON "GroupDmEvent"("channelId", "createdAt");

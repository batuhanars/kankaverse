-- AlterTable
ALTER TABLE "User" ADD COLUMN     "showRecentActivity" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "RecentGame" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "lastPlayedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecentGame_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecentGame_lastPlayedAt_idx" ON "RecentGame"("lastPlayedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RecentGame_userId_gameId_key" ON "RecentGame"("userId", "gameId");

-- AddForeignKey
ALTER TABLE "RecentGame" ADD CONSTRAINT "RecentGame_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecentGame" ADD CONSTRAINT "RecentGame_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
